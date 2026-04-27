"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ensureCornerstoneInit } from "@/lib/dicom/init";
import { blobToImageId, fetchFileAsBlob } from "@/lib/dicom/imageId";
import DicomToolbar from "./DicomToolbar";
import { TOOLS, type ToolId } from "./tools";
import { usePatientAnnotations } from "@/hooks/usePatientAnnotations";

interface DicomViewerProps {
  /** URL pública/firmada del .dcm en Firebase Storage */
  fileUrl: string;
  /** Nombre del archivo, para mostrar en barra de info */
  fileName: string;
  /**
   * ID del paciente en Firestore (patients/{patientId}).
   * Si se omite, las anotaciones no se persisten ni cargan desde Firestore.
   * Opcional para mantener retrocompatibilidad con usos de preview sin paciente.
   */
  patientId?: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading"; phase: "init" | "downloading" | "rendering" }
  | { status: "ready"; metadata: ImageMetadata | null }
  | { status: "error"; message: string };

interface ImageMetadata {
  rows?: number;
  columns?: number;
  windowCenter?: number;
  windowWidth?: number;
  modality?: string;
  studyDate?: string;
}

/**
 * DicomViewer — visor de un único DICOM single-frame con herramientas.
 *
 * Arquitectura interna:
 *   1. ensureCornerstoneInit() — inicializa core/loader/tools una vez por sesión.
 *   2. fetch del .dcm → Blob → fileManager.add → imageId.
 *   3. RenderingEngine + StackViewport ligados al <div ref>.
 *   4. ToolGroup con todas las herramientas; la activa cambia con setToolActive.
 *   5. usePatientAnnotations — persiste mediciones en patients/{id}/annotations.
 *
 * Patrones importantes:
 * - Todo es cliente (`"use client"`). Cornerstone usa WebGL + workers.
 * - IDs únicos por instancia para que múltiples viewers en la misma página
 *   no se pisen los renderingEngines.
 * - Cleanup riguroso en unmount para liberar GPU/workers/blobs.
 */
export default function DicomViewer({ fileUrl, fileName, patientId }: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [activeTool, setActiveTool] = useState<ToolId>("windowLevel");
  const [inverted, setInverted] = useState(false);

  // IDs únicos por instancia — evita colisiones si hay múltiples viewers.
  // useRef para que persistan estables entre renders.
  const idsRef = useRef({
    renderingEngineId: `re-${crypto.randomUUID()}`,
    viewportId: `vp-${crypto.randomUUID()}`,
    toolGroupId: `tg-${crypto.randomUUID()}`,
  });

  // Refs a objetos de cornerstone para acceder en handlers sin re-suscribir efectos
  type Refs = {
    renderingEngine: unknown | null;
    viewport: unknown | null;
    toolGroup: unknown | null;
    cleanupBlobUrl: (() => void) | null;
  };
  const refs = useRef<Refs>({
    renderingEngine: null,
    viewport: null,
    toolGroup: null,
    cleanupBlobUrl: null,
  });

  /* ────────────────── Persistencia de anotaciones ────────────────── */

  // El hook maneja todo el ciclo onSnapshot ↔ cornerstone events.
  // Solo se activa cuando el viewer está listo (state.status === "ready").
  const { annotationAuthors, clearAllAnnotations } = usePatientAnnotations(
    patientId ?? null,
    // RefObject<HTMLDivElement | null> es compatible con el tipo que devuelve
    // useRef<HTMLDivElement>(null) en React 18.
    containerRef as React.RefObject<HTMLDivElement | null>,
    state.status === "ready",
    idsRef.current.renderingEngineId,
  );

  /* ────────────────── Setup principal ────────────────── */

  useEffect(() => {
    let cancelled = false;
    const ids = idsRef.current;

    async function load() {
      try {
        setState({ status: "loading", phase: "init" });
        await ensureCornerstoneInit();

        if (cancelled) return;
        setState({ status: "loading", phase: "downloading" });

        // 1) Descargar el .dcm como Blob (vs hacer wadouri directo a Firebase)
        const blob = await fetchFileAsBlob(fileUrl);
        if (cancelled) return;

        // 2) Registrar el blob → imageId
        const imageId = await blobToImageId(blob);

        if (cancelled) return;
        setState({ status: "loading", phase: "rendering" });

        if (!containerRef.current) {
          throw new Error("Container DOM no disponible");
        }

        // 3) Crear RenderingEngine + StackViewport
        const { RenderingEngine, Enums, metaData } = await import("@cornerstonejs/core");
        const renderingEngine = new RenderingEngine(ids.renderingEngineId);
        renderingEngine.enableElement({
          viewportId: ids.viewportId,
          element: containerRef.current as HTMLDivElement,
          type: Enums.ViewportType.STACK,
          defaultOptions: {
            background: [0, 0, 0] as [number, number, number],
          },
        });

        const viewport = renderingEngine.getViewport(ids.viewportId);
        // Cast tras chequear que es StackViewport
        const stackViewport = viewport as unknown as {
          setStack: (ids: string[]) => Promise<void>;
          setProperties: (props: { invert?: boolean }) => void;
          resetCamera: () => void;
          resetProperties: () => void;
          render: () => void;
        };

        await stackViewport.setStack([imageId]);
        stackViewport.render();

        // 4) Configurar ToolGroup con todas las herramientas
        const tools = await import("@cornerstonejs/tools");
        const { ToolGroupManager, Enums: ToolEnums } = tools;

        const toolGroup = ToolGroupManager.createToolGroup(ids.toolGroupId);
        if (!toolGroup) throw new Error("No se pudo crear ToolGroup");

        // Agrega cada tool al grupo. Inicializadas en pasivo; activamos la primera abajo.
        TOOLS.forEach((t) => toolGroup.addTool(t.toolName));
        // StackScroll para multi-frame (si llega un DICOM con varias frames)
        toolGroup.addTool("StackScroll");

        toolGroup.addViewport(ids.viewportId, ids.renderingEngineId);

        // Bindings por defecto:
        // - Mouse primary (click izq) → la tool activa
        // - Mouse secondary (click der) → Pan (siempre)
        // - Mouse aux (rueda click) → Zoom (siempre)
        // - Wheel scroll → StackScroll (para multi-frame)
        toolGroup.setToolActive("WindowLevel", {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });
        toolGroup.setToolActive("Pan", {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
        });
        toolGroup.setToolActive("Zoom", {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
        });
        toolGroup.setToolActive("StackScroll", {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });

        // 5) Capturar metadata para mostrar en la UI
        // metaData.get puede no tener data hasta que la imagen termine de parsearse.
        // En la práctica, después de setStack ya está cargada en cache.
        let metadata: ImageMetadata | null = null;
        try {
          const generalImage = metaData.get("generalImageModule", imageId) as
            | { studyDate?: string }
            | undefined;
          const imagePixel = metaData.get("imagePixelModule", imageId) as
            | { rows?: number; columns?: number }
            | undefined;
          const voiLut = metaData.get("voiLutModule", imageId) as
            | { windowCenter?: number[]; windowWidth?: number[] }
            | undefined;
          const generalSeries = metaData.get("generalSeriesModule", imageId) as
            | { modality?: string }
            | undefined;

          metadata = {
            rows: imagePixel?.rows,
            columns: imagePixel?.columns,
            windowCenter: voiLut?.windowCenter?.[0],
            windowWidth: voiLut?.windowWidth?.[0],
            modality: generalSeries?.modality,
            studyDate: generalImage?.studyDate,
          };
        } catch {
          // metadata es nice-to-have; si falla seguimos
        }

        if (cancelled) {
          // Si el componente se desmontó durante la carga, limpiamos
          renderingEngine.destroy();
          ToolGroupManager.destroyToolGroup(ids.toolGroupId);
          return;
        }

        refs.current = {
          renderingEngine,
          viewport: stackViewport,
          toolGroup,
          cleanupBlobUrl: null,
        };

        setState({ status: "ready", metadata });
      } catch (err) {
        if (cancelled) return;
        console.error("Error cargando DICOM:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
      // Cleanup: destruir rendering engine y tool group
      const { renderingEngine, toolGroup } = refs.current;
      const tgId = ids.toolGroupId;

      (async () => {
        if (renderingEngine) {
          try {
            (renderingEngine as { destroy: () => void }).destroy();
          } catch (e) {
            console.warn("Error destruyendo renderingEngine:", e);
          }
        }
        if (toolGroup) {
          try {
            const tools = await import("@cornerstonejs/tools");
            tools.ToolGroupManager.destroyToolGroup(tgId);
          } catch (e) {
            console.warn("Error destruyendo toolGroup:", e);
          }
        }
        refs.current = {
          renderingEngine: null,
          viewport: null,
          toolGroup: null,
          cleanupBlobUrl: null,
        };
      })();
    };
  }, [fileUrl]);

  /* ────────────────── Acciones de la toolbar ────────────────── */

  const handleToolChange = useCallback(async (toolId: ToolId) => {
    const toolGroup = refs.current.toolGroup as
      | { setToolPassive: (n: string) => void; setToolActive: (n: string, opts: unknown) => void }
      | null;
    if (!toolGroup) return;

    const tools = await import("@cornerstonejs/tools");
    const { Enums: ToolEnums } = tools;

    // Pone en pasivo todas las que estaban en primary
    TOOLS.forEach((t) => toolGroup.setToolPassive(t.toolName));

    // Activa la nueva en primary
    const tool = TOOLS.find((t) => t.id === toolId);
    if (tool) {
      toolGroup.setToolActive(tool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
      });
    }
    setActiveTool(toolId);
  }, []);

  const handleReset = useCallback(() => {
    const viewport = refs.current.viewport as
      | { resetCamera: () => void; resetProperties: () => void; render: () => void }
      | null;
    if (!viewport) return;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
    setInverted(false);
  }, []);

  const handleInvert = useCallback(() => {
    const viewport = refs.current.viewport as
      | { setProperties: (p: { invert: boolean }) => void; render: () => void }
      | null;
    if (!viewport) return;
    setInverted((prev) => {
      const next = !prev;
      viewport.setProperties({ invert: next });
      viewport.render();
      return next;
    });
  }, []);

  const handleClearAnnotations = useCallback(async () => {
    try {
      // Si hay patientId, usamos clearAllAnnotations del hook porque además de
      // limpiar cornerstone borra el batch de Firestore y silencia los eventos
      // (isHydrating=true) para no disparar deleteDoc individual por cada una.
      // Si no hay patientId, caemos al comportamiento original.
      if (patientId) {
        await clearAllAnnotations();
      } else {
        const { annotation } = await import("@cornerstonejs/tools");
        annotation.state.removeAllAnnotations();
      }
      const re = refs.current.renderingEngine as { render: () => void } | null;
      re?.render();
    } catch (e) {
      console.warn("Error limpiando anotaciones:", e);
    }
  }, [patientId, clearAllAnnotations]);

  /* ────────────────── Render ────────────────── */

  // Agrupar anotaciones por autor para el badge inferior
  const authorSummary = buildAuthorSummary(annotationAuthors);

  return (
    <div className="w-full h-full flex bg-ink">
      <DicomToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onReset={handleReset}
        onInvert={handleInvert}
        onClearAnnotations={handleClearAnnotations}
        inverted={inverted}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra de info superior */}
        <div className="border-b border-paper px-4 py-2 flex items-center justify-between gap-4">
          <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 truncate">
            {fileName}
          </p>
          {state.status === "ready" && state.metadata && (
            <DicomMetaStrip metadata={state.metadata} />
          )}
        </div>

        {/* Viewport — el div al que cornerstone se engancha */}
        <div className="relative flex-1 min-h-0 stark-grid">
          <div
            ref={containerRef}
            className="absolute inset-0"
            // Cornerstone necesita oncontextmenu suprimido en el elemento del viewport
            // o el botón derecho abre el menú del navegador en vez de hacer pan.
            onContextMenu={(e) => e.preventDefault()}
          />

          {state.status === "loading" && <LoadingOverlay phase={state.phase} />}
          {state.status === "error" && <ErrorOverlay message={state.message} />}
        </div>

        {/* Pie con leyenda de bindings */}
        {state.status === "ready" && (
          <div className="border-t border-paper px-4 py-2 flex items-center justify-between gap-6">
            <p className="font-mono text-micro tracking-wider text-paper/50">
              <span className="uppercase">Click izq:</span>{" "}
              {TOOLS.find((t) => t.id === activeTool)?.label} ·{" "}
              <span className="uppercase">Click der:</span> Mover ·{" "}
              <span className="uppercase">Rueda:</span> Frame ·{" "}
              <span className="uppercase">Click rueda:</span> Zoom
            </p>

            {/* Badge de autoría — solo visible cuando hay anotaciones guardadas */}
            {authorSummary && (
              <p className="font-mono text-micro tracking-wider text-paper/50 shrink-0">
                <span className="uppercase text-paper/30">Por:</span>{" "}
                <span className="text-paper/70">{authorSummary}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────── Helpers ────────────────── */

/**
 * Construye un string "Dr. X (2) · Dra. Y" a partir del mapa annotationUID→autor.
 * Agrupa por nombre y muestra el conteo solo si es > 1.
 */
function buildAuthorSummary(authors: Map<string, string>): string | null {
  if (authors.size === 0) return null;

  const counts = new Map<string, number>();
  for (const name of authors.values()) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} (${count})` : name))
    .join(" · ");
}

/* ────────────────── Subcomponentes ────────────────── */

function DicomMetaStrip({ metadata }: { metadata: ImageMetadata }) {
  const items: { label: string; value: string }[] = [];
  if (metadata.modality) items.push({ label: "Modalidad", value: metadata.modality });
  if (metadata.rows && metadata.columns)
    items.push({ label: "Tamaño", value: `${metadata.columns}×${metadata.rows}` });
  if (metadata.windowCenter !== undefined && metadata.windowWidth !== undefined)
    items.push({
      label: "WC/WW",
      value: `${Math.round(metadata.windowCenter)}/${Math.round(metadata.windowWidth)}`,
    });
  if (metadata.studyDate) {
    // Formato DICOM YYYYMMDD → YYYY-MM-DD para legibilidad
    const d = metadata.studyDate;
    const formatted = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
    items.push({ label: "Estudio", value: formatted });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-4">
      {items.map((item, i) => (
        <span key={i} className="font-mono text-micro tracking-wider whitespace-nowrap">
          <span className="text-paper/40 uppercase">{item.label}:</span>{" "}
          <span className="text-paper">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function LoadingOverlay({ phase }: { phase: "init" | "downloading" | "rendering" }) {
  const labels = {
    init: "Inicializando visor",
    downloading: "Descargando archivo",
    rendering: "Renderizando imagen",
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 bg-paper live-dot rounded-full" />
          <p className="font-mono text-micro uppercase tracking-[0.25em] text-paper">
            {labels[phase]}
          </p>
        </div>
        <p className="font-display text-h3 text-paper/60">DICOM</p>
      </div>
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="border border-paper p-6 max-w-md">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-2">
          No se pudo cargar el DICOM
        </p>
        <p className="font-mono text-body break-words">{message}</p>
        <p className="font-mono text-micro mt-4 text-paper/50 leading-relaxed">
          Posibles causas: archivo corrupto, transfer syntax no soportado, o CORS no
          configurado en Firebase Storage. Revisa el README.
        </p>
      </div>
    </div>
  );
}
