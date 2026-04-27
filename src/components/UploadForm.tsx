"use client";

import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUpload } from "@/hooks/useUpload";
import { validateRut, formatRut } from "@/lib/rut";
import { formatBytes, cn } from "@/lib/utils";
import { detectLogicalType, looksLikeDicom, type LogicalFileType } from "@/lib/dicom/detect";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/dicom",
  "application/octet-stream", // muchos .dcm llegan así
  "", // algunos browsers no asignan MIME para .dcm
];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".dcm", ".dicom"];
const MAX_SIZE_MB = 100; // DICOMs son más grandes que PDFs

/**
 * UploadForm — Panel de subida para Secretaría.
 *
 * Flujo: ingresa RUT → valida módulo 11 → ingresa nombre →
 * arrastra/selecciona archivo → confirma → sube con progreso.
 *
 * Estética: campos con label flotante, sin placeholders fantasmas,
 * subrayado hairline blanco. Cada error es explícito, no toast genérico.
 */
export default function UploadForm() {
  const { user } = useAuth();
  const { upload, uploading, progress, error, reset } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rut, setRut] = useState("");
  const [fullName, setFullName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<LogicalFileType | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Formato automático del RUT mientras escribe
  const handleRutChange = (e: ChangeEvent<HTMLInputElement>) => {
    setRut(formatRut(e.target.value));
    setValidationError(null);
  };

  const handleFileSelect = async (selected: File | null) => {
    if (!selected) return;

    // Validación 1: extensión o MIME conocido
    const lowerName = selected.name.toLowerCase();
    const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = ACCEPTED_TYPES.includes(selected.type);

    if (!hasValidExtension && !hasValidMime) {
      setValidationError(`Formato no permitido: ${selected.type || selected.name}`);
      return;
    }

    // Validación 2: tamaño
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setValidationError(`Archivo supera ${MAX_SIZE_MB} MB`);
      return;
    }

    // Validación 3: si dice ser DICOM (por extensión o MIME), verificar magic bytes.
    // Si pasa magic bytes sabemos que es DICOM real y guardamos esa intención.
    let logicalType: LogicalFileType = "unknown";
    if (looksLikeDicom(selected) || selected.type === "application/octet-stream" || selected.type === "") {
      logicalType = await detectLogicalType(selected);
      // Si la extensión decía .dcm pero magic bytes no confirma → archivo corrupto o malnombrado
      if (looksLikeDicom(selected) && logicalType !== "dicom") {
        setValidationError(
          "El archivo parece ser DICOM por su extensión pero no contiene el preámbulo válido. Verifica el archivo.",
        );
        return;
      }
    } else {
      logicalType = await detectLogicalType(selected);
    }

    setValidationError(null);
    setFile(selected);
    setDetectedType(logicalType);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!validateRut(rut)) {
      setValidationError("RUT inválido — revisa el dígito verificador");
      return;
    }
    if (fullName.trim().length < 3) {
      setValidationError("Ingresa el nombre completo del paciente");
      return;
    }
    if (!file) {
      setValidationError("Adjunta el archivo de la mamografía");
      return;
    }
    if (!user) return;

    try {
      await upload({
        rut,
        fullName: fullName.trim(),
        file,
        uploadedBy: user.uid,
        // Si detectamos DICOM por magic bytes, forzamos el MIME type al subir.
        // Storage guardará "application/dicom" aunque el browser haya dado otro.
        contentTypeOverride: detectedType === "dicom" ? "application/dicom" : undefined,
      });
      setSuccess(true);
      // Reset diferido para que se vea el 100%
      setTimeout(() => {
        setRut("");
        setFullName("");
        setFile(null);
        setDetectedType(null);
        setSuccess(false);
        reset();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 2000);
    } catch {
      // error ya capturado en el hook
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      {/* Encabezado del formulario */}
      <div className="mb-12 border-b border-paper pb-6">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
          Secretaría — Ingreso
        </p>
        <h2 className="mt-3 font-display text-h2 text-paper">Nuevo paciente</h2>
      </div>

      {/* Grid de campos */}
      <div className="space-y-10">
        {/* RUT */}
        <FieldGroup label="RUT del paciente" hint="Formato 12.345.678-9">
          <input
            type="text"
            value={rut}
            onChange={handleRutChange}
            disabled={uploading}
            placeholder="—"
            maxLength={12}
            className="w-full bg-transparent border-0 border-b border-paper py-3 font-mono text-h3 text-paper placeholder:text-paper/20 focus:outline-none focus:border-paper disabled:opacity-40"
            required
          />
        </FieldGroup>

        {/* Nombre completo */}
        <FieldGroup label="Nombre completo">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={uploading}
            placeholder="—"
            className="w-full bg-transparent border-0 border-b border-paper py-3 font-display text-h3 text-paper placeholder:text-paper/20 focus:outline-none disabled:opacity-40"
            required
          />
        </FieldGroup>

        {/* Dropzone de archivo */}
        <FieldGroup label="Mamografía" hint="DICOM · JPG · PNG · PDF · máx 100 MB">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border border-paper p-8 cursor-pointer transition-colors",
              dragActive && "bg-paper text-ink",
              uploading && "pointer-events-none opacity-40",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={[...ACCEPTED_TYPES.filter(Boolean), ...ACCEPTED_EXTENSIONS].join(",")}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-body truncate">{file.name}</p>
                  <p className="font-mono text-caption text-paper/50 mt-1 uppercase tracking-wider">
                    {formatBytes(file.size)}
                    {detectedType && detectedType !== "unknown" && (
                      <>
                        {" · "}
                        <span className="text-paper">{detectedType}</span>
                        {detectedType === "dicom" && (
                          <span className="ml-2 inline-block border border-paper px-1.5 py-px normal-case tracking-normal">
                            ✓ verificado
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setDetectedType(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="font-mono text-caption uppercase tracking-wider hover:underline"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="font-mono text-caption uppercase tracking-[0.2em]">
                  Arrastra · o haz click para seleccionar
                </p>
              </div>
            )}
          </div>
        </FieldGroup>

        {/* Barra de progreso — solo durante upload */}
        {uploading && (
          <div className="border-t border-paper pt-6 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-caption uppercase tracking-wider">
                Subiendo
              </span>
              <span className="font-mono text-caption tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-px bg-paper/20 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-paper transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Mensajes */}
        {(validationError || error) && (
          <div className="border border-paper p-4 animate-fade-in">
            <p className="font-mono text-caption uppercase tracking-wider mb-1">
              Error
            </p>
            <p className="font-mono text-body">{validationError ?? error}</p>
          </div>
        )}

        {success && (
          <div className="border border-paper p-4 animate-fade-in">
            <p className="font-mono text-caption uppercase tracking-wider mb-1">
              ✓ Registrado
            </p>
            <p className="font-mono text-body">El paciente está en cola del médico.</p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-4 pt-6 border-t border-paper">
          <button
            type="submit"
            disabled={uploading || !file || !rut || !fullName}
            className="bg-paper text-ink px-8 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {uploading ? "Subiendo..." : "Registrar paciente"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRut("");
              setFullName("");
              setFile(null);
              setDetectedType(null);
              setValidationError(null);
              reset();
            }}
            disabled={uploading}
            className="border border-paper px-8 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper hover:text-ink transition-colors disabled:opacity-30"
          >
            Limpiar
          </button>
        </div>
      </div>
    </form>
  );
}

/* Campo con label arriba — patrón editorial reusable */
function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
          {label}
        </label>
        {hint && (
          <span className="font-mono text-micro text-paper/40 tracking-wider">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
