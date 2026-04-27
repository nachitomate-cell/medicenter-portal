/**
 * Inicialización singleton de Cornerstone3D.
 *
 * `init()` de @cornerstonejs/core y de dicom-image-loader debe correr
 * exactamente una vez por sesión de navegador. Si se llama múltiples veces
 * obtienes warnings/duplicación de web workers.
 *
 * También registramos las herramientas de @cornerstonejs/tools acá. La
 * adición de cada Tool a un ToolGroup sí se hace por viewport.
 *
 * IMPORTANTE: este módulo debe importarse SOLO desde Client Components.
 * El SSR no tiene `window` ni `WebGL` y va a explotar.
 */

let initPromise: Promise<void> | null = null;

export function ensureCornerstoneInit(): Promise<void> {
  if (typeof window === "undefined") {
    // Defensa en profundidad — esto NO debería llamarse en server.
    return Promise.reject(new Error("Cornerstone solo puede inicializarse en el cliente"));
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { init: coreInit } = await import("@cornerstonejs/core");
    const { init: dicomImageLoaderInit } = await import("@cornerstonejs/dicom-image-loader");
    const { init: toolsInit, addTool, PanTool, ZoomTool, WindowLevelTool, StackScrollTool, LengthTool, AngleTool, RectangleROITool, EllipticalROITool, ArrowAnnotateTool } = await import("@cornerstonejs/tools");

    await coreInit();
    await dicomImageLoaderInit({
      // Web workers se manejan internos. maxWebWorkers controla concurrencia.
      maxWebWorkers: Math.min(navigator.hardwareConcurrency || 1, 4),
    });
    await toolsInit();

    // Registramos todas las herramientas globalmente. Cada ToolGroup decide
    // cuáles activar y con qué bindings.
    addTool(PanTool);
    addTool(ZoomTool);
    addTool(WindowLevelTool);
    addTool(StackScrollTool);
    addTool(LengthTool);
    addTool(AngleTool);
    addTool(RectangleROITool);
    addTool(EllipticalROITool);
    addTool(ArrowAnnotateTool);
  })();

  return initPromise;
}
