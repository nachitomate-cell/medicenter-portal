import type { Timestamp } from "firebase/firestore";

export type UserRole = "admin" | "doctor" | "secretary";

export type AccountStatus = "invited" | "active" | "disabled";

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  status?: AccountStatus;
}

export type PatientStatus = "waiting" | "in_box" | "attended";

export interface Patient {
  id: string;
  rut: string; // formateado: "12.345.678-9"
  fullName: string;
  fileUrl: string; // URL de descarga firmada
  fileName: string;
  fileType: string; // MIME type
  fileSize: number; // bytes
  uploadedBy: string; // uid de la secretaría
  uploadedAt: Timestamp;
  status: PatientStatus;
  notes?: string;
}

/**
 * Documento en presence/{uid}.
 * TTL implícito: se filtra client-side si lastHeartbeat > 30s.
 * TODO: Cloud Function que elimine docs huérfanos (sesiones que cerraron browser)
 *       para no acumular basura en la colección a largo plazo.
 */
export interface PresenceDoc {
  uid: string;
  displayName?: string;
  currentPatientId: string | null;
  lastHeartbeat: Timestamp;
  role: UserRole;
}

/**
 * Documento en patients/{id}/annotations/{annId}.
 *
 * `data` es el objeto completo de cornerstone serializado a JSON.
 * Lo guardamos opaco para poder pasarlo de vuelta a addAnnotation() sin
 * transformación — cornerstone lo restaura tal cual.
 */
export interface PatientAnnotation {
  toolName: string;
  /**
   * Objeto Annotation de cornerstone serializado como JSON string.
   * Firestore no soporta arrays anidados (ej. handles.points: [[x,y,z],...]),
   * así que guardamos todo como string opaco y parseamos al leer.
   * Docs legacy pueden tener este campo como objeto — el hook maneja ambos casos.
   */
  data: string;
  /** UID del médico que creó la anotación */
  createdBy: string;
  /** Nombre para mostrar en UI (displayName o email como fallback) */
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
