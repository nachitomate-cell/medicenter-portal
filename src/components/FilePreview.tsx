"use client";

import { useEffect } from "react";
import type { Patient } from "@/types";
import { formatBytes } from "@/lib/utils";
import { logicalTypeFromMime } from "@/lib/dicom/detect";
import DicomViewerLazy from "./dicom/DicomViewerLazy";

interface FilePreviewProps {
  patient: Patient;
  onClose: () => void;
  onCallToBox: () => void;
}

/**
 * FilePreview — Modal de previsualización para el médico.
 *
 * Detecta el tipo lógico del archivo (DICOM / image / pdf / unknown) y
 * rutea al renderer apropiado:
 *   - DICOM → DicomViewer (cornerstone3d, herramientas, mediciones)
 *   - image → <img>
 *   - pdf   → <iframe>
 *   - else  → link de descarga
 *
 * Cierra con ESC, atrapa el scroll del body.
 */
export default function FilePreview({ patient, onClose, onCallToBox }: FilePreviewProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const logicalType = logicalTypeFromMime(patient.fileType, patient.fileName);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="absolute inset-4 md:inset-8 border border-paper bg-ink flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header del modal */}
        <header className="border-b border-paper px-6 py-4 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
              Vista previa · {logicalType.toUpperCase()}
            </p>
            <h3 className="font-display text-h3 mt-1 truncate">{patient.fullName}</h3>
            <p className="font-mono text-caption text-paper/60 mt-1">
              {patient.rut} · {patient.fileName} · {formatBytes(patient.fileSize)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-caption uppercase tracking-wider border border-paper px-4 py-2 hover:bg-paper hover:text-ink transition-colors"
            aria-label="Cerrar preview"
          >
            Cerrar [ESC]
          </button>
        </header>

        {/* Cuerpo del preview — varía según tipo */}
        <div className="flex-1 min-h-0 flex flex-col">
          {logicalType === "dicom" && (
            <DicomViewerLazy
              fileUrl={patient.fileUrl}
              fileName={patient.fileName}
              patientId={patient.id}
            />
          )}

          {logicalType === "image" && (
            <div className="flex-1 stark-grid flex items-center justify-center p-6 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={patient.fileUrl}
                alt={`Mamografía de ${patient.fullName}`}
                className="max-w-full max-h-full object-contain border border-paper/40"
              />
            </div>
          )}

          {logicalType === "pdf" && (
            <iframe
              src={`${patient.fileUrl}#toolbar=0&navpanes=0`}
              className="flex-1 bg-paper"
              title={`PDF de ${patient.fullName}`}
            />
          )}

          {logicalType === "unknown" && (
            <div className="flex-1 flex items-center justify-center stark-grid p-6">
              <div className="text-center max-w-md">
                <p className="font-mono text-caption uppercase tracking-[0.2em] text-paper/60 mb-4">
                  Formato no previsualizable
                </p>
                <p className="font-display text-h3 mb-6">
                  {patient.fileType || "Tipo desconocido"}
                </p>
                <a
                  href={patient.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block border border-paper px-6 py-3 font-mono text-caption uppercase tracking-wider hover:bg-paper hover:text-ink transition-colors"
                >
                  Descargar archivo
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <footer className="border-t border-paper px-6 py-4 flex items-center justify-between gap-4">
          <a
            href={patient.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-caption uppercase tracking-wider hover:underline"
          >
            ↗ Abrir en pestaña nueva
          </a>
          <button
            onClick={onCallToBox}
            className="bg-paper text-ink px-8 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors"
          >
            Llamar al box →
          </button>
        </footer>
      </div>
    </div>
  );
}
