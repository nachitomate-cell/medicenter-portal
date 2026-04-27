"use client";

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import { cleanRut } from "@/lib/rut";

interface UploadParams {
  rut: string; // formateado
  fullName: string;
  file: File;
  uploadedBy: string; // uid
  /** Sobrescribe el MIME que se guarda en Storage. Útil para DICOM. */
  contentTypeOverride?: string;
}

interface UploadState {
  progress: number;
  uploading: boolean;
  error: string | null;
}

/**
 * Hook de subida con progreso. Sube a Storage → crea doc en Firestore.
 *
 * Path en Storage: mammograms/{rut_limpio}/{timestamp}_{filename}
 * Esto permite reglas de Storage por paciente más adelante.
 */
export function useUpload() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    uploading: false,
    error: null,
  });

  const upload = async ({
    rut,
    fullName,
    file,
    uploadedBy,
    contentTypeOverride,
  }: UploadParams): Promise<string> => {
    setState({ progress: 0, uploading: true, error: null });

    try {
      const cleanedRut = cleanRut(rut);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `mammograms/${cleanedRut}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);

      // Si recibimos override (ej: "application/dicom" verificado por magic bytes),
      // lo usamos. Si no, usamos el type del File — que puede ser "" para .dcm.
      const contentType = contentTypeOverride ?? file.type ?? "application/octet-stream";

      // uploadBytesResumable nos da progreso real, a diferencia de uploadBytes
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType,
      });

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setState((s) => ({ ...s, progress }));
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          },
        );
      });

      // Crea el documento del paciente en Firestore
      const docRef = await addDoc(collection(db, "patients"), {
        rut,
        fullName,
        fileUrl: downloadUrl,
        fileName: file.name,
        fileType: contentType, // usamos el efectivo, no file.type que puede ser ""
        fileSize: file.size,
        uploadedBy,
        uploadedAt: serverTimestamp(),
        status: "waiting",
      });

      setState({ progress: 100, uploading: false, error: null });
      return docRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setState({ progress: 0, uploading: false, error: message });
      throw err;
    }
  };

  const reset = () => setState({ progress: 0, uploading: false, error: null });

  return { upload, reset, ...state };
}
