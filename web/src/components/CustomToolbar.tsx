import React from "react";

export type ToolType = "rectangle" | "ellipse" | "arrow" | "diamond";

type Props = {
  activeTool: ToolType;
  onSelect: (tool: ToolType) => void;
};

const TOOLS: { id: ToolType; label: string }[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse", label: "Circle" },
  { id: "arrow", label: "Arrow" },
  { id: "diamond", label: "Rombus" },
];

export function CustomToolbar({ activeTool, onSelect }: Props) {
  return (
    <div className="custom-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            className={`custom-tool ${isActive ? "is-active" : ""}`}
            aria-pressed={isActive}
            aria-label={tool.label}
            onClick={() => onSelect(tool.id)}
          >
            {tool.label}
          </button>
        );
      })}
    </div>
  );
}
