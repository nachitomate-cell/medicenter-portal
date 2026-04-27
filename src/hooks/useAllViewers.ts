"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, type QuerySnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { PresenceDoc } from "@/types";

// Debe coincidir con el intervalo de heartbeat × 2 para tolerar un latido perdido
const TTL_MS = 30_000;

/**
 * Suscripción global a la colección presence.
 * Devuelve un mapa { patientId → [PresenceDoc] } excluyendo al usuario actual
 * y filtrando docs con lastHeartbeat expirado (> 30s) en cliente, ya que
 * Firestore no soporta queries con timestamps dinámicos del lado servidor.
 */
export function useAllViewers(): Record<string, PresenceDoc[]> {
  const { user } = useAuth();
  const [viewersByPatient, setViewersByPatient] = useState<Record<string, PresenceDoc[]>>({});

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "presence"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const now = Date.now();
        const map: Record<string, PresenceDoc[]> = {};

        snapshot.docs.forEach((d) => {
          const data = d.data() as PresenceDoc;

          if (data.uid === user.uid) return;
          if (!data.currentPatientId) return;

          // Filtro de TTL client-side: docs sin heartbeat reciente se ignoran
          const heartbeatMs = data.lastHeartbeat?.toMillis?.() ?? 0;
          if (now - heartbeatMs > TTL_MS) return;

          if (!map[data.currentPatientId]) map[data.currentPatientId] = [];
          map[data.currentPatientId].push(data);
        });

        setViewersByPatient(map);
      },
      (err) => {
        console.error("Error en suscripción de presencia global:", err);
      },
    );

    return () => unsubscribe();
  }, [user]);

  return viewersByPatient;
}
