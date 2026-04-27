"use client";

import { TOOLS, type ToolId } from "./tools";
import { cn } from "@/lib/utils";

interface DicomToolbarProps {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  onReset: () => void;
  onInvert: () => void;
  onClearAnnotations: () => void;
  inverted: boolean;
}

/**
 * Toolbar lateral del DicomViewer.
 *
 * Decisión: vertical, hairline, agrupada por categoría (manipulación vs
 * medición). Las herramientas activas se invierten a fondo blanco — mismo
 * lenguaje que el resto del portal.
 */
export default function DicomToolbar({
  activeTool,
  onToolChange,
  onReset,
  onInvert,
  onClearAnnotations,
  inverted,
}: DicomToolbarProps) {
  const manipulation = TOOLS.filter((t) => !t.measurement);
  const measurement = TOOLS.filter((t) => t.measurement);

  return (
    <aside className="w-14 border-r border-paper flex flex-col">
      {/* Manipulación */}
      <ToolGroup>
        {manipulation.map((tool) => (
          <ToolButton
            key={tool.id}
            tool={tool}
            active={activeTool === tool.id}
            onClick={() => onToolChange(tool.id)}
          />
        ))}
      </ToolGroup>

      {/* Mediciones */}
      <ToolGroup>
        {measurement.map((tool) => (
          <ToolButton
            key={tool.id}
            tool={tool}
            active={activeTool === tool.id}
            onClick={() => onToolChange(tool.id)}
          />
        ))}
      </ToolGroup>

      {/* Acciones (no son herramientas, son comandos one-shot) */}
      <ToolGroup>
        <button
          onClick={onInvert}
          title="Invertir"
          className={cn(
            "w-14 h-14 flex items-center justify-center transition-colors",
            inverted ? "bg-paper text-ink" : "hover:bg-paper/10",
          )}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={onClearAnnotations}
          title="Limpiar anotaciones"
          className="w-14 h-14 flex items-center justify-center hover:bg-paper/10 transition-colors"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </button>
        <button
          onClick={onReset}
          title="Reset vista"
          className="w-14 h-14 flex items-center justify-center hover:bg-paper/10 transition-colors"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </button>
      </ToolGroup>
    </aside>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-paper py-1">{children}</div>;
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: (typeof TOOLS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={tool.label}
      className={cn(
        "w-14 h-14 flex items-center justify-center transition-colors",
        active ? "bg-paper text-ink" : "hover:bg-paper/10",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: tool.icon }}
      />
    </button>
  );
}
