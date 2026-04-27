"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Patient, PatientStatus } from "@/types";

interface UsePatientsQueueOptions {
  status?: PatientStatus | PatientStatus[];
}

/**
 * Hook de tiempo real para la cola de pacientes.
 * Usa onSnapshot — el médico ve nuevas mamografías sin refrescar.
 *
 * El snapshot trae metadata.hasPendingWrites; lo exponemos por si
 * queremos mostrar un indicador "guardando..." en el optimistic UI.
 */
export function usePatientsQueue(options: UsePatientsQueueOptions = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const constraints = [];
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      constraints.push(where("status", "in", statuses));
    }
    constraints.push(orderBy("uploadedAt", "desc"));

    const q = query(collection(db, "patients"), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const list: Patient[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Patient, "id">),
        }));
        setPatients(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error en suscripción a pacientes:", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options.status)]);

  return { patients, loading, error };
}
