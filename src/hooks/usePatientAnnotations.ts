"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RefObject } from "react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { PatientAnnotation } from "@/types";

/**
 * Tipo mínimo del objeto Annotation de cornerstone que necesitamos manejar.
 *
 * @cornerstonejs/tools no exporta un tipo public limpio para Annotation en v3,
 * así que definimos la forma que nos importa para serializar/deserializar.
 * Los campos internos adicionales pasan opaque como Record<string, unknown>.
 */
interface CsAnnotation {
  annotationUID: string;
  metadata: {
    toolName: string;
    referencedImageId?: string;
    [key: string]: unknown;
  };
  data: Record<string, unknown>;
  isLocked?: boolean;
  isVisible?: boolean;
  highlighted?: boolean;
}

export interface UsePatientAnnotationsReturn {
  /** annotationUID → nombre del médico autor. Vacío hasta que hydrate el onSnapshot. */
  annotationAuthors: Map<string, string>;
  /**
   * Borra TODAS las anotaciones del paciente: primero en cornerstone
   * (con isHydrating=true para silenciar los eventos), luego en Firestore.
   * Expuesto para que DicomViewer lo use en "limpiar anotaciones".
   */
  clearAllAnnotations: () => Promise<void>;
}

/**
 * Persiste y sincroniza anotaciones DICOM de un paciente con Firestore.
 *
 * Ciclo de vida completo:
 *   1. Cuando `isViewerReady` pasa a true, onSnapshot hidrata cornerstone con
 *      las anotaciones guardadas en patients/{patientId}/annotations.
 *   2. El médico dibuja → cornerstone dispara ANNOTATION_ADDED/MODIFIED/REMOVED
 *      → el hook escribe upsert/delete a Firestore.
 *   3. Si otro médico anotó mientras este viewer estaba abierto, el onSnapshot
 *      detecta UIDs nuevos y los inyecta en cornerstone (con isHydrating=true
 *      para no disparar el handler de nuevo).
 *
 * Anti-loop: cornerstone dispatchEvent es síncrono — poner isHydrating=true
 * ANTES de addAnnotation() garantiza que el handler ANNOTATION_ADDED que
 * disparamos nosotros mismos sea un no-op. No hay race condition posible.
 *
 * Debounce en ANNOTATION_MODIFIED: cornerstone dispara este evento en cada
 * pixel de movimiento del handle. Sin debounce escribiríamos a Firestore
 * decenas de veces por segundo durante un drag.
 */
export function usePatientAnnotations(
  patientId: string | null,
  containerRef: RefObject<HTMLDivElement | null>,
  isViewerReady: boolean,
  renderingEngineId: string,
): UsePatientAnnotationsReturn {
  const { user } = useAuth();

  const [annotationAuthors, setAnnotationAuthors] = useState<Map<string, string>>(new Map());

  // Verdadero durante cualquier addAnnotation/removeAnnotation que viene de
  // Firestore → silencia los event handlers para no escribir de vuelta.
  const isHydrating = useRef(false);

  // UIDs de anotaciones que cornerstone tiene en memoria.
  // Usamos esto para hacer un diff incremental en onSnapshot en vez de
  // borrar-y-rebuild (que causa parpadeo visual).
  const knownUIDs = useRef(new Set<string>());

  // Timers de debounce para ANNOTATION_MODIFIED, indexados por annotationUID.
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /* ─── Escrituras a Firestore ──────────────────────────────────────────── */

  /**
   * Upsert de una anotación en Firestore.
   * isNew=true → incluye createdBy/createdAt (solo en la primera escritura).
   * isNew=false → merge, preserva autoría original y solo actualiza data/updatedAt.
   */
  const persistAnnotation = useCallback(
    async (ann: CsAnnotation, isNew: boolean): Promise<void> => {
      if (!patientId || !user) return;

      // JSON.parse(JSON.stringify(...)) limpia undefined y valores no serializables
      // que cornerstone puede dejar en cachedStats antes de la primera renderización.
      // Firestore no admite arrays anidados (handles.points: [[x,y,z],...]).
      // Serializamos el objeto completo como JSON string; lo parseamos al leer.
      const dataStr = JSON.stringify(JSON.parse(JSON.stringify(ann)));

      const annRef = doc(db, "patients", patientId, "annotations", ann.annotationUID);
      const payload: Omit<PatientAnnotation, "createdAt" | "updatedAt"> & {
        updatedAt: ReturnType<typeof serverTimestamp>;
        createdAt?: ReturnType<typeof serverTimestamp>;
        createdBy?: string;
        createdByName?: string;
      } = {
        toolName: ann.metadata.toolName,
        data: dataStr,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        await setDoc(annRef, { ...payload, createdAt: serverTimestamp() });
      } else {
        // merge:true preserva createdBy/createdAt de quien dibujó la anotación
        // originalmente, aunque otro médico la modifique.
        await setDoc(
          annRef,
          { data: dataStr, updatedAt: serverTimestamp(), toolName: ann.metadata.toolName },
          { merge: true },
        );
      }
    },
    [patientId, user],
  );

  const deleteAnnotationFromFirestore = useCallback(
    async (annotationUID: string): Promise<void> => {
      if (!patientId) return;
      await deleteDoc(doc(db, "patients", patientId, "annotations", annotationUID));
    },
    [patientId],
  );

  /* ─── clearAllAnnotations (expuesto al viewer) ───────────────────────── */

  const clearAllAnnotations = useCallback(async (): Promise<void> => {
    if (!patientId) return;

    // Silenciar eventos para que los ANNOTATION_REMOVED que dispare
    // removeAllAnnotations() no vuelvan a intentar deleteDoc individualmente.
    isHydrating.current = true;
    try {
      const { annotation } = await import("@cornerstonejs/tools");
      annotation.state.removeAllAnnotations();
    } finally {
      isHydrating.current = false;
    }

    // Cancelar todos los debounces pendientes antes de borrar en Firestore
    for (const timer of pendingTimers.current.values()) clearTimeout(timer);
    pendingTimers.current.clear();
    knownUIDs.current.clear();
    setAnnotationAuthors(new Map());

    // Borrado en batch: más eficiente y atómico que deleteDoc individual
    const annColl = collection(db, "patients", patientId, "annotations");
    const snap = await getDocs(annColl);
    if (snap.docs.length > 0) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }, [patientId]);

  /* ─── Efecto principal: onSnapshot + event listeners de cornerstone ──── */

  useEffect(() => {
    if (!patientId || !isViewerReady || !user) return;

    let cancelled = false;
    let unsubSnapshot: (() => void) | null = null;
    let cleanupCsListeners: (() => void) | null = null;

    async function setup() {
      // eventTarget vive en core (es el bus global de eventos de cornerstone).
      // Los nombres de eventos de tools (ANNOTATION_ADDED, etc.) están en tools/Enums.
      const [{ annotation, Enums }, { eventTarget }] = await Promise.all([
        import("@cornerstonejs/tools"),
        import("@cornerstonejs/core"),
      ]);
      if (cancelled) return;

      const element = containerRef.current;
      if (!element) return;

      /* ── 1. onSnapshot: hydration inicial + sync en tiempo real ─────── */
      const annColl = collection(db, "patients", patientId!, "annotations");

      unsubSnapshot = onSnapshot(
        annColl,
        (snapshot) => {
          if (cancelled) return;

          const snapshotUIDs = new Set(snapshot.docs.map((d) => d.id));
          const newAuthors = new Map<string, string>();

          isHydrating.current = true;
          try {
            // Añadir las anotaciones que están en Firestore pero no en cornerstone.
            // Esto cubre: carga inicial Y anotaciones de otro médico que llegaron
            // vía onSnapshot mientras el viewer estaba abierto.
            for (const docSnap of snapshot.docs) {
              const stored = docSnap.data() as PatientAnnotation;
              if (stored.createdByName) {
                newAuthors.set(docSnap.id, stored.createdByName);
              }

              if (!knownUIDs.current.has(docSnap.id)) {
                try {
                  // data puede ser un JSON string (nuevo formato) o un objeto
                  // (docs legacy escritos antes de la serialización).
                  const annObj: unknown =
                    typeof stored.data === "string"
                      ? JSON.parse(stored.data)
                      : stored.data;
                  annotation.state.addAnnotation(
                    annObj as Parameters<typeof annotation.state.addAnnotation>[0],
                    element,
                  );
                  knownUIDs.current.add(docSnap.id);
                } catch (e) {
                  console.warn(`No se pudo hidratar anotación ${docSnap.id}:`, e);
                }
              }
            }

            // Eliminar de cornerstone las anotaciones que otro médico borró.
            for (const uid of knownUIDs.current) {
              if (!snapshotUIDs.has(uid)) {
                try {
                  annotation.state.removeAnnotation(uid);
                } catch {
                  // Ya no existe en cornerstone — ignorar silenciosamente
                }
                knownUIDs.current.delete(uid);
                newAuthors.delete(uid);
              }
            }
          } finally {
            isHydrating.current = false;
          }

          setAnnotationAuthors(newAuthors);

          // Pedir re-render para que las anotaciones hydratadas aparezcan
          // en el canvas sin que el médico tenga que mover el mouse.
          import("@cornerstonejs/core")
            .then(({ getRenderingEngine }) => {
              const engine = getRenderingEngine(renderingEngineId);
              if (engine) {
                (engine as unknown as { render: () => void }).render();
              }
            })
            .catch(() => {});
        },
        (err) => {
          console.error("Error en onSnapshot de anotaciones del paciente:", err);
        },
      );

      /* ── 2. Event listeners de cornerstone ─────────────────────────── */

      const handleAdded = (evt: Event) => {
        // Si isHydrating=true venimos de nuestro propio addAnnotation() — no persistir.
        if (isHydrating.current) return;

        const detail = (evt as CustomEvent).detail as { annotation: CsAnnotation };
        const ann = detail.annotation;

        knownUIDs.current.add(ann.annotationUID);
        persistAnnotation(ann, true).catch((e) =>
          console.error("Error guardando anotación nueva en Firestore:", e),
        );
      };

      const handleModified = (evt: Event) => {
        if (isHydrating.current) return;

        const detail = (evt as CustomEvent).detail as { annotation: CsAnnotation };
        const ann = detail.annotation;

        // Debounce: cornerstone dispara MODIFIED en cada frame durante un drag.
        // Esperamos 600ms de inactividad antes de escribir a Firestore.
        const existing = pendingTimers.current.get(ann.annotationUID);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          pendingTimers.current.delete(ann.annotationUID);
          persistAnnotation(ann, false).catch((e) =>
            console.error("Error actualizando anotación en Firestore:", e),
          );
        }, 600);

        pendingTimers.current.set(ann.annotationUID, timer);
      };

      const handleRemoved = (evt: Event) => {
        if (isHydrating.current) return;

        // En cs-tools v3, ANNOTATION_REMOVED puede traer annotationUID directamente
        // o bien el objeto completo en `annotation`. Manejamos ambos casos.
        const detail = (evt as CustomEvent).detail as {
          annotationUID?: string;
          annotation?: CsAnnotation;
        };
        const uid = detail.annotationUID ?? detail.annotation?.annotationUID;
        if (!uid) return;

        // Cancelar debounce pendiente si lo había
        const timer = pendingTimers.current.get(uid);
        if (timer) {
          clearTimeout(timer);
          pendingTimers.current.delete(uid);
        }

        knownUIDs.current.delete(uid);
        setAnnotationAuthors((prev) => {
          const next = new Map(prev);
          next.delete(uid);
          return next;
        });
        deleteAnnotationFromFirestore(uid).catch((e) =>
          console.error("Error eliminando anotación de Firestore:", e),
        );
      };

      eventTarget.addEventListener(Enums.Events.ANNOTATION_ADDED, handleAdded);
      eventTarget.addEventListener(Enums.Events.ANNOTATION_MODIFIED, handleModified);
      eventTarget.addEventListener(Enums.Events.ANNOTATION_REMOVED, handleRemoved);

      cleanupCsListeners = () => {
        eventTarget.removeEventListener(Enums.Events.ANNOTATION_ADDED, handleAdded);
        eventTarget.removeEventListener(Enums.Events.ANNOTATION_MODIFIED, handleModified);
        eventTarget.removeEventListener(Enums.Events.ANNOTATION_REMOVED, handleRemoved);
      };
    }

    setup().catch((e) => console.error("Error inicializando usePatientAnnotations:", e));

    return () => {
      cancelled = true;
      unsubSnapshot?.();
      cleanupCsListeners?.();

      // Limpiar todos los timers de debounce al desmontar
      for (const timer of pendingTimers.current.values()) clearTimeout(timer);
      pendingTimers.current.clear();
      knownUIDs.current.clear();
      isHydrating.current = false;
    };
    // persistAnnotation y deleteAnnotationFromFirestore son estables (useCallback
    // con dependencias que no cambian durante el ciclo de vida del viewer).
    // user?.uid como dependencia: re-corre si el auth se establece tardíamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, isViewerReady, renderingEngineId, user?.uid]);

  return { annotationAuthors, clearAllAnnotations };
}
