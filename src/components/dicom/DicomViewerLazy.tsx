"use client";

import dynamic from "next/dynamic";

/**
 * Wrapper dinámico para DicomViewer.
 *
 * Cornerstone3D no funciona en SSR — usa WebGL, web workers y `window`.
 * `dynamic(..., { ssr: false })` garantiza que el bundle solo se carga
 * en el cliente, evitando errores de hidratación.
 *
 * El Suspense fallback usa nuestro lenguaje visual.
 */
const DicomViewer = dynamic(() => import("./DicomViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center stark-grid">
      <div className="inline-flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-paper live-dot rounded-full" />
        <p className="font-mono text-micro uppercase tracking-[0.25em] text-paper/60">
          Cargando visor DICOM
        </p>
      </div>
    </div>
  ),
});

export default DicomViewer;
