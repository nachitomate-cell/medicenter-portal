"use client";

import { useState, useMemo, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePatientsQueue } from "@/hooks/usePatientsQueue";
import { usePresence } from "@/hooks/usePresence";
import { useAllViewers } from "@/hooks/useAllViewers";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { timeAgo, cn } from "@/lib/utils";
import { logicalTypeFromMime } from "@/lib/dicom/detect";
import Header from "./Header";
import FilePreview from "./FilePreview";
import type { Patient, PatientStatus, PresenceDoc } from "@/types";

/**
 * DoctorDashboard — Vista principal del médico.
 *
 * Layout: sidebar con la cola (tiempo real) + área central de preview.
 * - La cola se actualiza con onSnapshot — sin refresh.
 * - Click en paciente abre preview inline.
 * - "Llamar al box" cambia status → la lista se reordena en vivo.
 */
export default function DoctorDashboard() {
  const [filter, setFilter] = useState<PatientStatus | "all">("waiting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const queueOptions = filter === "all" ? {} : { status: filter };
  const { patients, loading, error } = usePatientsQueue(queueOptions);

  // Presencia: registra dónde está este médico; suscribe a los demás
  usePresence(selectedId);
  const viewersByPatient = useAllViewers();

  const selected = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId],
  );

  const handleCallToBox = async (patient: Patient) => {
    await updateDoc(doc(db, "patients", patient.id), {
      status: "in_box" as PatientStatus,
    });
    setPreviewOpen(false);
  };

  const handleMarkAttended = async (patient: Patient) => {
    await updateDoc(doc(db, "patients", patient.id), {
      status: "attended" as PatientStatus,
    });
    setSelectedId(null);
  };

  // Conteos para los filtros
  const counts = useMemo(() => {
    return {
      waiting: patients.filter((p) => p.status === "waiting").length,
      in_box: patients.filter((p) => p.status === "in_box").length,
    };
  }, [patients]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header context="Dashboard médico" />

      {/* Sub-bar con indicador "En vivo" */}
      <div className="border-b border-paper px-8 py-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-paper live-dot rounded-full" />
        <span className="font-mono text-micro uppercase tracking-[0.2em]">
          Cola en vivo · {patients.length} {patients.length === 1 ? "paciente" : "pacientes"}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr]">
        {/* ───────── COLA (sidebar) ───────── */}
        <aside className="border-r border-paper flex flex-col">
          {/* Tabs de filtro */}
          <div className="border-b border-paper">
            <div className="flex">
              <FilterTab
                label="En espera"
                count={counts.waiting}
                active={filter === "waiting"}
                onClick={() => setFilter("waiting")}
              />
              <FilterTab
                label="En box"
                count={counts.in_box}
                active={filter === "in_box"}
                onClick={() => setFilter("in_box")}
              />
              <FilterTab
                label="Todos"
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-8 text-center font-mono text-caption uppercase tracking-wider text-paper/60">
                Sincronizando...
              </div>
            )}
            {error && (
              <div className="p-6 border-b border-paper">
                <p className="font-mono text-caption uppercase tracking-wider mb-1">
                  Error
                </p>
                <p className="font-mono text-body">{error.message}</p>
              </div>
            )}
            {!loading && patients.length === 0 && (
              <div className="p-12 text-center">
                <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/40 mb-2">
                  Cola vacía
                </p>
                <p className="font-display text-h3 text-paper/60">Sin pacientes</p>
              </div>
            )}
            {patients.map((patient, idx) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                index={idx + 1}
                selected={selectedId === patient.id}
                viewers={viewersByPatient[patient.id] ?? []}
                onClick={() => setSelectedId(patient.id)}
              />
            ))}
          </div>
        </aside>

        {/* ───────── DETALLE (panel principal) ───────── */}
        <main className="flex flex-col">
          {!selected ? (
            <EmptyState />
          ) : (
            <PatientDetail
              patient={selected}
              viewers={viewersByPatient[selected.id] ?? []}
              onPreview={() => setPreviewOpen(true)}
              onCallToBox={() => handleCallToBox(selected)}
              onMarkAttended={() => handleMarkAttended(selected)}
            />
          )}
        </main>
      </div>

      {/* Modal de preview */}
      {previewOpen && selected && (
        <FilePreview
          patient={selected}
          onClose={() => setPreviewOpen(false)}
          onCallToBox={() => handleCallToBox(selected)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   SUBCOMPONENTES — privados al dashboard
   ──────────────────────────────────────────── */

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-4 font-mono text-micro uppercase tracking-[0.15em] transition-colors border-r border-paper last:border-r-0",
        active ? "bg-paper text-ink" : "text-paper hover:bg-paper/10",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-2 tabular-nums opacity-60">[{count}]</span>
      )}
    </button>
  );
}

function PatientRow({
  patient,
  index,
  selected,
  viewers,
  onClick,
}: {
  patient: Patient;
  index: number;
  selected: boolean;
  viewers: PresenceDoc[];
  onClick: () => void;
}) {
  const uploadedDate = patient.uploadedAt?.toDate?.() ?? new Date();
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-6 py-5 border-b border-paper transition-colors block",
        selected ? "bg-paper text-ink" : "hover:bg-paper/5",
      )}
    >
      <div className="flex items-start gap-4">
        <span className="font-mono text-micro tabular-nums opacity-60 mt-1">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lead truncate">{patient.fullName}</p>
          <p className="font-mono text-caption mt-1 opacity-70">{patient.rut}</p>
          <div className="flex items-center gap-3 mt-3">
            <StatusBadge status={patient.status} inverted={selected} />
            <span className="font-mono text-micro uppercase tracking-wider opacity-50">
              {timeAgo(uploadedDate)}
            </span>
          </div>
        </div>
        {viewers.length > 0 && (
          <PresenceDot viewers={viewers} inverted={selected} />
        )}
      </div>
    </button>
  );
}

function PresenceDot({ viewers, inverted }: { viewers: PresenceDoc[]; inverted: boolean }) {
  const label = viewers.map((v) => v.displayName ?? "Dr.").join(" · ");
  return (
    <div className="group relative flex-shrink-0 self-center">
      <span
        className={cn(
          "block w-2 h-2 rounded-full live-dot",
          inverted ? "bg-ink border border-ink/60" : "bg-paper",
        )}
      />
      {/* Tooltip: posicionado a la izquierda del punto para no salir del sidebar */}
      <div
        className={cn(
          "absolute right-full mr-2.5 top-1/2 -translate-y-1/2 z-50",
          "pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 duration-150",
          "border border-paper bg-ink px-2 py-1 whitespace-nowrap",
        )}
      >
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-paper">
          {label}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  inverted = false,
}: {
  status: PatientStatus;
  inverted?: boolean;
}) {
  const labels: Record<PatientStatus, string> = {
    waiting: "En espera",
    in_box: "En box",
    attended: "Atendido",
  };
  return (
    <span
      className={cn(
        "font-mono text-micro uppercase tracking-[0.15em] px-2 py-0.5 border",
        inverted ? "border-ink text-ink" : "border-paper text-paper",
      )}
    >
      {labels[status]}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 stark-grid flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div className="border border-paper w-16 h-16 mx-auto mb-8 flex items-center justify-center">
          <span className="font-display text-h2">+</span>
        </div>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-3">
          Selecciona un paciente
        </p>
        <p className="font-display text-h3 text-paper/80">
          La preview de la mamografía aparecerá aquí.
        </p>
      </div>
    </div>
  );
}

function PatientDetail({
  patient,
  viewers,
  onPreview,
  onCallToBox,
  onMarkAttended,
}: {
  patient: Patient;
  viewers: PresenceDoc[];
  onPreview: () => void;
  onCallToBox: () => void;
  onMarkAttended: () => void;
}) {
  const logicalType = logicalTypeFromMime(patient.fileType, patient.fileName);
  const isImage = logicalType === "image";
  const isDicom = logicalType === "dicom";

  const viewerNames = viewers.map((v) => v.displayName ?? "Dr.").join(", ");

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      {/* Banner de co-presencia */}
      {viewers.length > 0 && (
        <div className="border-b border-paper px-10 py-3 flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-paper live-dot rounded-full flex-shrink-0" />
          <span className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
            {viewerNames} {viewers.length === 1 ? "está viendo" : "están viendo"} este caso
          </span>
        </div>
      )}

      {/* Hero del paciente */}
      <section className="border-b border-paper px-10 py-10">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-3">
          {patient.rut}
        </p>
        <h2 className="font-display text-h1 leading-none mb-6">{patient.fullName}</h2>
        <div className="flex items-center gap-6">
          <StatusBadge status={patient.status} />
          <span className="font-mono text-caption text-paper/60">
            Subido {timeAgo(patient.uploadedAt?.toDate?.() ?? new Date())}
          </span>
        </div>
      </section>

      {/* Thumbnail/preview rápido */}
      <section className="flex-1 grid lg:grid-cols-[1fr_320px]">
        <div
          onClick={onPreview}
          className="stark-grid flex items-center justify-center p-10 cursor-pointer hover:bg-paper/5 transition-colors group min-h-[300px]"
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={patient.fileUrl}
              alt=""
              className="max-w-full max-h-[60vh] object-contain border border-paper/40 group-hover:border-paper transition-colors"
            />
          ) : isDicom ? (
            <div className="text-center">
              <div className="border border-paper px-12 py-16 mb-4 relative">
                <span className="font-display text-h2">DICOM</span>
                {/* Indicador minimal de modalidad médica */}
                <div className="absolute top-2 left-2 font-mono text-micro tracking-wider text-paper/40">
                  ◆ MED
                </div>
              </div>
              <p className="font-mono text-caption uppercase tracking-wider text-paper/60">
                Click para abrir visor
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="border border-paper px-12 py-16 mb-4">
                <span className="font-display text-h2">
                  {logicalType === "pdf" ? "PDF" : (patient.fileType.split("/")[1]?.toUpperCase() ?? "FILE")}
                </span>
              </div>
              <p className="font-mono text-caption uppercase tracking-wider text-paper/60">
                Click para previsualizar
              </p>
            </div>
          )}
        </div>

        {/* Panel de metadata + acciones */}
        <aside className="border-l border-paper p-8 flex flex-col overflow-y-auto">
          <div className="space-y-6 flex-1">
            <MetaItem label="Archivo" value={patient.fileName} mono />
            <MetaItem label="Tipo" value={patient.fileType} mono />
            <MetaItem
              label="Tamaño"
              value={`${(patient.fileSize / (1024 * 1024)).toFixed(2)} MB`}
              mono
            />

            {/* Notas clínicas con dictado por voz */}
            <div className="pt-6 border-t border-paper">
              <NotesDictation patient={patient} />
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-paper">
            <button
              onClick={onPreview}
              className="w-full border border-paper px-6 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors"
            >
              Previsualizar →
            </button>
            {patient.status === "waiting" && (
              <button
                onClick={onCallToBox}
                className="w-full bg-paper text-ink px-6 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors"
              >
                Llamar al box
              </button>
            )}
            {patient.status === "in_box" && (
              <button
                onClick={onMarkAttended}
                className="w-full bg-paper text-ink px-6 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors"
              >
                Marcar atendido
              </button>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-1">
        {label}
      </p>
      <p className={cn("text-body break-all", mono ? "font-mono" : "font-display text-lead")}>
        {value}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   NotesDictation — Notas clínicas con dictado por voz
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Componente de notas clínicas con dictado por voz.
 *
 * Estados internos:
 *   reading   → muestra nota guardada, botón "Dictar nota"
 *   listening → reconocimiento activo, transcripción en vivo, botón "Detener"
 *   editing   → textarea editable con texto acumulado, botones Guardar/Cancelar
 *   saving    → textarea deshabilitado durante escritura a Firestore
 *
 * El modo "editing" admite continuar dictando ("Dictar más"), lo que
 * agrega texto al final del textarea sin descartarlo.
 *
 * Comportamiento acumulativo: cada sesión de dictado se agrega al final
 * del texto existente, separado por salto de línea. El médico puede
 * revisar y editar antes de guardar.
 *
 * REQUISITO DE BROWSER: la Web Speech API requiere HTTPS o localhost.
 * En HTTP puro, el browser rechaza el acceso al micrófono por política
 * de privacidad. Firebase Hosting y Vercel sirven por HTTPS por defecto.
 */
function NotesDictation({ patient }: { patient: Patient }) {
  type Mode = "reading" | "listening" | "editing" | "saving";
  const [mode, setMode] = useState<Mode>("reading");
  // Texto que verá el médico en el textarea (combina nota guardada + dictados)
  const [editText, setEditText] = useState<string>(patient.notes ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);

  const dictation = useVoiceDictation("es-CL");

  // Cuando Firestore actualiza la nota (otro dispositivo, onSnapshot), sincronizamos
  // solo si el médico no está editando — no queremos pisar trabajo en curso.
  useEffect(() => {
    if (mode === "reading") {
      setEditText(patient.notes ?? "");
    }
  }, [patient.notes, mode]);

  // Cuando el dictado termina, acumulamos el texto del segmento al editor y
  // transicionamos a "editing" para que el médico revise antes de guardar.
  useEffect(() => {
    if (dictation.status !== "done") return;

    setEditText((prev) => {
      const seg = dictation.segmentText.trim();
      if (!seg) return prev;
      const base = prev.trim();
      return base ? `${base}\n${seg}` : seg;
    });
    setMode("editing");
    // Consumir el estado "done" — vuelve a idle para la próxima sesión
    dictation.reset();
  // dictation.reset es estable (useCallback sin deps), no necesita estar en el array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.status]);

  const handleStartDictation = () => {
    setSaveError(null);
    setMode("listening");
    dictation.start();
  };

  const handleStop = () => {
    // stop() procesa el audio pendiente; la transición a "editing" ocurre
    // cuando el hook pasa a status="done" (via useEffect arriba).
    dictation.stop();
  };

  const handleSave = async () => {
    setMode("saving");
    setSaveError(null);
    try {
      // La regla de Firestore permite 'notes' en el allow-list de update
      await updateDoc(doc(db, "patients", patient.id), {
        notes: editText.trim(),
      });
      setMode("reading");
    } catch (e) {
      console.error("Error guardando nota clínica:", e);
      setSaveError("No se pudo guardar. Intenta de nuevo.");
      setMode("editing");
    }
  };

  const handleCancel = () => {
    // Descartar cambios y volver a la nota guardada
    setEditText(patient.notes ?? "");
    setSaveError(null);
    dictation.reset();
    setMode("reading");
  };

  // isSupported===null → aún no determinado (hidratación SSR). Mostramos
  // un placeholder vacío para evitar el flash de contenido incorrecto.
  if (dictation.isSupported === null) {
    return (
      <div>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-3">
          Notas clínicas
        </p>
        <div className="h-8 border border-paper/10" />
      </div>
    );
  }

  // Firefox y browsers sin soporte: fallback a textarea directo sin dictado
  if (!dictation.isSupported) {
    return <NotesFallback patient={patient} />;
  }

  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-3">
        Notas clínicas
      </p>

      {/* ── Modo lectura ─────────────────────────────────────────────── */}
      {mode === "reading" && (
        <>
          {editText.trim() ? (
            <p className="font-mono text-body leading-relaxed text-paper mb-4 whitespace-pre-wrap break-words">
              {editText}
            </p>
          ) : (
            <p className="font-mono text-body text-paper/30 mb-4">Sin notas clínicas.</p>
          )}
          <button
            onClick={handleStartDictation}
            className="w-full border border-paper px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors"
          >
            Dictar nota
          </button>
        </>
      )}

      {/* ── Modo dictado activo ───────────────────────────────────────── */}
      {mode === "listening" && (
        <>
          {/* Indicador de grabación: punto pulsante blanco, sin rojo */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-paper live-dot rounded-full" />
            <span className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
              Dictando
            </span>
          </div>

          {/* Transcripción en vivo — siempre presente para ocupar el espacio */}
          <div
            className={cn(
              "border border-paper/30 p-3 mb-4 min-h-[80px] transition-colors",
              (dictation.liveText || dictation.segmentText) && "border-paper/60",
            )}
          >
            {/* Texto ya confirmado por el reconocedor */}
            {dictation.segmentText && (
              <p className="font-mono text-body text-paper leading-relaxed whitespace-pre-wrap">
                {dictation.segmentText}
              </p>
            )}
            {/* Texto interim — en proceso, puede cambiar */}
            {dictation.liveText && (
              <p className="font-mono text-body text-paper/40 leading-relaxed">
                {dictation.liveText}
              </p>
            )}
            {!dictation.segmentText && !dictation.liveText && (
              <p className="font-mono text-body text-paper/20">Hable ahora...</p>
            )}
          </div>

          {/* Error no-fatal del reconocedor (p.ej. permiso de mic denegado) */}
          {dictation.status === "error" && dictation.errorMessage && (
            <p className="font-mono text-micro text-paper/60 mb-3 uppercase tracking-wider">
              Error: {dictation.errorMessage}
            </p>
          )}

          <button
            onClick={handleStop}
            className="w-full border border-paper px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors"
          >
            Detener
          </button>
        </>
      )}

      {/* ── Modo edición / guardado ───────────────────────────────────── */}
      {(mode === "editing" || mode === "saving") && (
        <>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={mode === "saving"}
            rows={5}
            className="w-full border border-paper bg-ink font-mono text-body text-paper p-3 resize-y mb-3 disabled:opacity-40 focus:outline-none focus:border-paper/80 placeholder:text-paper/30"
            placeholder="Nota clínica..."
          />

          {saveError && (
            <p className="font-mono text-micro text-paper/60 mb-3 uppercase tracking-wider">
              {saveError}
            </p>
          )}

          <div className="flex gap-2 mb-2">
            <button
              onClick={handleSave}
              disabled={mode === "saving"}
              className="flex-1 bg-paper text-ink px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors disabled:opacity-40"
            >
              {mode === "saving" ? "Guardando" : "Guardar"}
            </button>
            <button
              onClick={handleCancel}
              disabled={mode === "saving"}
              className="border border-paper px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>

          {/* Dictar más: agrega al texto que ya hay en el textarea */}
          {mode === "editing" && (
            <button
              onClick={handleStartDictation}
              className="w-full border border-paper/30 px-4 py-2 font-mono text-micro uppercase tracking-[0.15em] text-paper/50 hover:border-paper hover:text-paper transition-colors"
            >
              Dictar mas
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Fallback para browsers sin Web Speech API (Firefox, algunos mobile).
 * Presenta el mismo flujo lectura/edición pero sin el botón de dictado.
 * El textarea aparece siempre visible para no esconder la funcionalidad.
 */
function NotesFallback({ patient }: { patient: Patient }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(patient.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sincronizar con Firestore cuando no estamos editando
  useEffect(() => {
    if (!isEditing) {
      setEditText(patient.notes ?? "");
    }
  }, [patient.notes, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateDoc(doc(db, "patients", patient.id), {
        notes: editText.trim(),
      });
      setIsEditing(false);
    } catch (e) {
      console.error("Error guardando nota:", e);
      setSaveError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditText(patient.notes ?? "");
    setSaveError(null);
    setIsEditing(false);
  };

  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-3">
        Notas clínicas
      </p>

      {!isEditing ? (
        <>
          {editText.trim() ? (
            <p className="font-mono text-body leading-relaxed text-paper mb-4 whitespace-pre-wrap break-words">
              {editText}
            </p>
          ) : (
            <p className="font-mono text-body text-paper/30 mb-4">Sin notas clínicas.</p>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="w-full border border-paper px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors"
          >
            Editar nota
          </button>
        </>
      ) : (
        <>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={isSaving}
            rows={5}
            className="w-full border border-paper bg-ink font-mono text-body text-paper p-3 resize-y mb-3 disabled:opacity-40 focus:outline-none focus:border-paper/80 placeholder:text-paper/30"
            placeholder="Nota clínica..."
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {saveError && (
            <p className="font-mono text-micro text-paper/60 mb-3 uppercase tracking-wider">
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-paper text-ink px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors disabled:opacity-40"
            >
              {isSaving ? "Guardando" : "Guardar"}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="border border-paper px-4 py-2.5 font-mono text-micro uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
