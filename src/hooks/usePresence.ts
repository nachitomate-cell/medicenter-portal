"use client";

import { useEffect, useRef } from "react";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_MS = 15_000;

/**
 * Registra la presencia del médico actual en Firestore.
 * Escribe cada 15s; pausa si la pestaña queda en background para
 * no consumir escrituras cuando el doctor no está mirando.
 * Al desmontar, elimina el doc — la solución para browsers que cierran
 * de golpe es el filtro de TTL de 30s en useAllViewers.
 */
export function usePresence(currentPatientId: string | null): void {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const presenceRef = doc(db, "presence", user.uid);

    const beat = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        await setDoc(presenceRef, {
          uid: user.uid,
          displayName: user.displayName ?? user.email,
          currentPatientId,
          lastHeartbeat: serverTimestamp(),
          role: user.role,
        });
      } catch (err) {
        console.error("Error en heartbeat de presencia:", err);
      }
    };

    beat();
    intervalRef.current = setInterval(beat, HEARTBEAT_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        beat();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(beat, HEARTBEAT_MS);
        }
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Best-effort: falla silenciosa si el browser ya cerró la conexión
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [user, currentPatientId]);
}
