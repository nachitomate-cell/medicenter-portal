/**
 * Helpers para obtener `imageId` que Cornerstone3D entiende.
 *
 * Cornerstone trabaja con identificadores tipo URL — la parte antes de los
 * dos puntos es el "scheme" que rutea a un image loader registrado.
 * `dicom-image-loader` registra los schemes `wadouri:`, `wadors:` y
 * `dicomfile:`. Para nuestro flujo (descargar el .dcm desde Firebase
 * Storage como blob → Cornerstone), usamos `dicomfile:` que toma un
 * fileId interno del fileManager.
 *
 * El `wadouri:` también funcionaría apuntando directo a la URL de Firebase
 * Storage, PERO requiere CORS configurado en el bucket Y soporta menos
 * transfer syntaxes que la ruta File. Vamos por File para máxima
 * compatibilidad — descargamos una vez y le pasamos el blob.
 */

interface CornerstoneFileManager {
  add: (file: File | Blob) => string; // retorna imageId
  remove: (imageId: string) => void;
}

/**
 * Convierte un Blob a imageId vía el fileManager interno de
 * @cornerstonejs/dicom-image-loader.
 */
export async function blobToImageId(blob: Blob): Promise<string> {
  const dicomImageLoader = await import("@cornerstonejs/dicom-image-loader");
  // El fileManager está en .wadouri.fileManager según la API actual.
  // Tipos: la lib no exporta esto en su .d.ts; afirmamos su forma.
  const fileManager = (dicomImageLoader as unknown as {
    wadouri: { fileManager: CornerstoneFileManager };
  }).wadouri.fileManager;

  // El método `add` retorna directamente un imageId de tipo "dicomfile:N"
  return fileManager.add(blob);
}

/**
 * Descarga un archivo desde Firebase Storage como Blob.
 *
 * Por qué fetch y no usar wadouri directo:
 * - Control de errores explícito (CORS, 404, blob corrupto).
 * - Permite mostrar progreso de descarga si el archivo es grande.
 * - Funciona con archivos firmados temporales.
 */
export async function fetchFileAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo (${response.status})`);
  }
  return await response.blob();
}
