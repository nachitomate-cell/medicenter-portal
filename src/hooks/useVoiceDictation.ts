"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Tipos mínimos de Web Speech API ───────────────────────────────────────
 * La especificación Web Speech API no está completa en lib.dom.d.ts de TS para
 * todos los prefijos de vendor (webkitSpeechRecognition no existe en el tipo global).
 * Declaramos solo la superficie que necesitamos — cast controlado en la frontera.
 * ──────────────────────────────────────────────────────────────────────────── */

interface SpeechResultItem {
  readonly transcript: string;
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechResultItem;
}

interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}

interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}

interface SpeechErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionAPI extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((evt: SpeechResultEvent) => void) | null;
  onerror: ((evt: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionAPI;
  webkitSpeechRecognition?: new () => SpeechRecognitionAPI;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionAPI) | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithSpeech;
  // Chrome/Edge usan el prefijo webkit; Safari experimental también.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ─── Tipos públicos del hook ─────────────────────────────────────────────── */

/**
 * "done" es un estado transitorio: indica que el reconocimiento acaba de
 * terminar y segmentText está completo. El componente debe consumir este
 * estado (p.ej. transicionando a "editing") y luego llamar a reset().
 */
export type DictationStatus = "idle" | "listening" | "done" | "error" | "unsupported";

export interface UseDictationReturn {
  status: DictationStatus;
  /**
   * Texto en curso no confirmado (el reconocedor aún está procesando).
   * Se muestra en vivo pero puede cambiar antes de que sea final.
   */
  liveText: string;
  /**
   * Texto final acumulado de la sesión actual.
   * Estable cuando status === "done" — es seguro usarlo en ese momento.
   */
  segmentText: string;
  /** Presente cuando status === "error" */
  errorMessage: string | null;
  /**
   * Indica si el browser soporta Web Speech API.
   * null → aún no determinado (primer render SSR-compatible).
   * false → no soportado (Firefox, algunos mobile).
   * true → soportado.
   *
   * IMPORTANTE: requiere HTTPS o localhost — en HTTP puro el browser
   * bloquea la API por política de permisos de micrófono.
   */
  isSupported: boolean | null;
  start: () => void;
  stop: () => void;
  /** Resetea desde "done" o "error" a "idle" y limpia segmentText. */
  reset: () => void;
}

/**
 * Hook que encapsula Web Speech API para dictado de notas clínicas.
 *
 * Comportamiento:
 * - continuous=true: el reconocedor no para entre frases largas o silencios.
 * - interimResults=true: muestra transcripción en vivo (liveText) antes de
 *   confirmar cada fragmento, lo que da feedback inmediato al médico.
 * - Al llamar stop(), el reconocedor procesa el audio pendiente, dispara un
 *   último onresult con isFinal=true, y luego onend. Solo entonces pasamos
 *   a status="done" con el segmentText completo.
 *
 * No compatible con Firefox (usa API propia no estandarizada sin prefijo).
 * Compatibilidad completa: Chrome 33+, Edge 79+, Safari 14.1+.
 */
export function useVoiceDictation(lang = "es-CL"): UseDictationReturn {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [liveText, setLiveText] = useState("");
  const [segmentText, setSegmentText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // null → no sabemos todavía (evita mismatch de hidratación SSR↔client)
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  // Texto confirmado acumulado en la sesión actual.
  // Usamos ref para que los closures de onresult/onend siempre lean el valor
  // más reciente sin necesitar redefinir los handlers.
  const accumulatedRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);

  // Detectar soporte post-mount para no romper la hidratación SSR
  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }

    // Abortar instancia previa si el médico hace doble-click rápido
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    // continuous=true: sin timeout por silencio — el médico puede pausar y seguir
    recognition.continuous = true;
    // interimResults=true: actualizamos liveText en cada chunk, no solo al final
    recognition.interimResults = true;

    recognition.onstart = () => {
      accumulatedRef.current = "";
      setStatus("listening");
      setLiveText("");
      setSegmentText("");
      setErrorMessage(null);
    };

    recognition.onresult = (evt) => {
      let interim = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const result = evt.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          // Acumulamos con espacio — el reconocedor entrega los fragmentos
          // sin separador; necesitamos añadirlo manualmente.
          accumulatedRef.current = accumulatedRef.current
            ? `${accumulatedRef.current} ${transcript.trim()}`
            : transcript.trim();
        } else {
          interim += transcript;
        }
      }
      setSegmentText(accumulatedRef.current);
      setLiveText(interim);
    };

    recognition.onerror = (evt) => {
      // "aborted": lo causamos nosotros con abort() — no es error real.
      // "no-speech": el médico no habló en X segundos — tampoco es error.
      if (evt.error === "aborted" || evt.error === "no-speech") return;
      setStatus("error");
      setErrorMessage(evt.error);
    };

    recognition.onend = () => {
      // onend siempre dispara al terminar. A este punto todos los onresult
      // ya dispararon, incluido el último chunk final. segmentText es estable.
      setLiveText("");
      // Solo transicionamos a "done" si el médico no canceló (abort) por error
      setStatus((prev) => (prev === "listening" ? "done" : prev));
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [lang]);

  const stop = useCallback(() => {
    // stop() procesa el audio pendiente antes de disparar onend.
    // abort() descarta el audio — usamos stop() para no perder la última frase.
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = "";
    setStatus("idle");
    setSegmentText("");
    setLiveText("");
    setErrorMessage(null);
  }, []);

  return { status, liveText, segmentText, errorMessage, isSupported, start, stop, reset };
}
