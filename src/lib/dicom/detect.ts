/**
 * Detección de archivos DICOM.
 *
 * Los archivos DICOM Part 10 tienen un preámbulo de 128 bytes (típicamente
 * ceros, opcional) seguido del prefijo "DICM" en bytes 128-131. Esa es la
 * señal canónica.
 *
 * Edge case: muchos DICOM "in the wild" omiten el preámbulo y empiezan
 * directamente con un grupo de elementos. Esos requieren parseo real para
 * detectar — fuera de scope para magic bytes. Con el preámbulo cubrimos
 * el ~95% de archivos modernos.
 */

const DICOM_PREAMBLE_OFFSET = 128;
const DICOM_MAGIC = "DICM";

/** Detecta DICOM leyendo solo los primeros 132 bytes. Rápido. */
export async function isDicomFile(file: File): Promise<boolean> {
  if (file.size < DICOM_PREAMBLE_OFFSET + DICOM_MAGIC.length) return false;

  const slice = file.slice(DICOM_PREAMBLE_OFFSET, DICOM_PREAMBLE_OFFSET + 4);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return (
    bytes[0] === 0x44 && // D
    bytes[1] === 0x49 && // I
    bytes[2] === 0x43 && // C
    bytes[3] === 0x4d    // M
  );
}

/** Heurística por extensión + MIME — el cliente ve esto antes de subir. */
export function looksLikeDicom(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".dcm") || name.endsWith(".dicom")) return true;
  if (file.type === "application/dicom") return true;
  return false;
}

/**
 * Determina el "tipo lógico" de un archivo para enrutar la previsualización.
 * Combina extensión + MIME + magic bytes cuando sea relevante.
 */
export type LogicalFileType = "dicom" | "image" | "pdf" | "unknown";

export async function detectLogicalType(file: File): Promise<LogicalFileType> {
  // 1) Heurística rápida sin leer bytes
  if (looksLikeDicom(file)) {
    // Confirmar con magic bytes — la extensión miente a veces
    if (await isDicomFile(file)) return "dicom";
  }
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";

  // 2) Si no tenemos MIME confiable, intentar magic bytes para DICOM
  // (algunos browsers reportan octet-stream para .dcm)
  if (file.type === "" || file.type === "application/octet-stream") {
    if (await isDicomFile(file)) return "dicom";
  }

  return "unknown";
}

/** Misma detección pero a partir del fileType guardado en Firestore (no tenemos magic bytes ahí). */
export function logicalTypeFromMime(mimeType: string, fileName: string): LogicalFileType {
  const lowerName = fileName.toLowerCase();
  if (mimeType === "application/dicom" || lowerName.endsWith(".dcm") || lowerName.endsWith(".dicom")) {
    return "dicom";
  }
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "unknown";
}
