/**
 * Definiciones de herramientas disponibles en el visor.
 * Separamos data de UI para mantener el componente Toolbar limpio.
 */

export type ToolId =
  | "windowLevel"
  | "pan"
  | "zoom"
  | "stackScroll"
  | "length"
  | "angle"
  | "rectangleROI"
  | "ellipticalROI"
  | "arrowAnnotate";

export interface ToolDef {
  id: ToolId;
  label: string;
  /** Nombre del tool en cornerstone-tools — usado al activar el ToolGroup. */
  toolName: string;
  /** Glyph SVG que va dentro de un <button>. Mantiene estética hairline. */
  icon: string;
  /** Si la herramienta es de medición (vs manipulación). Cambia agrupación visual. */
  measurement?: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: "windowLevel",
    label: "Window/Level",
    toolName: "WindowLevel",
    icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1"/><path d="M12 3v18" stroke="currentColor" stroke-width="1"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  },
  {
    id: "pan",
    label: "Mover",
    toolName: "Pan",
    icon: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1" fill="none"/>',
  },
  {
    id: "zoom",
    label: "Zoom",
    toolName: "Zoom",
    icon: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1"/><path d="M14.5 14.5L20 20" stroke="currentColor" stroke-width="1"/><path d="M10 7v6M7 10h6" stroke="currentColor" stroke-width="1"/>',
  },
  {
    id: "length",
    label: "Regla",
    toolName: "Length",
    measurement: true,
    icon: '<path d="M3 18L18 3" stroke="currentColor" stroke-width="1"/><path d="M3 18l3-3M6 15l-3-3M9 12l-3-3M12 9l-3-3M15 6l-3-3" stroke="currentColor" stroke-width="1"/>',
  },
  {
    id: "angle",
    label: "Ángulo",
    toolName: "Angle",
    measurement: true,
    icon: '<path d="M4 20L20 4M4 20h12" stroke="currentColor" stroke-width="1" fill="none"/><path d="M4 20a8 8 0 0 1 4-7" stroke="currentColor" stroke-width="1" fill="none"/>',
  },
  {
    id: "rectangleROI",
    label: "ROI Rect",
    toolName: "RectangleROI",
    measurement: true,
    icon: '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
  },
  {
    id: "ellipticalROI",
    label: "ROI Elip",
    toolName: "EllipticalROI",
    measurement: true,
    icon: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
  },
  {
    id: "arrowAnnotate",
    label: "Anotar",
    toolName: "ArrowAnnotate",
    measurement: true,
    icon: '<path d="M3 21L21 3M21 3v8M21 3h-8" stroke="currentColor" stroke-width="1" fill="none"/>',
  },
];
