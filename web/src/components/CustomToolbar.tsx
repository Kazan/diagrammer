import type React from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  MousePointer2,
  Hand,
  Eraser,
  Frame,
  Sparkle,
  Square,
  Diamond,
  Circle,
  ArrowUpRight,
  Minus,
  Pencil,
  Type as TypeIcon,
} from "lucide-react";

type ExcalidrawToolType = ExcalidrawImperativeAPI["setActiveTool"] extends (
  input: { type: infer T },
) => void
  ? T
  : never;

export type ToolType = Extract<
  ExcalidrawToolType,
  | "selection"
  | "hand"
  | "eraser"
  | "frame"
  | "laser"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
>;

type Props = {
  activeTool: ToolType;
  onSelect: (tool: ToolType) => void;
};

type ToolSection = {
  id: string;
  label: string;
  tools: { id: ToolType; label: string; Icon: React.ComponentType<{ size?: number }> }[];
};

const TOOL_SECTIONS: ToolSection[] = [
  {
    id: "navigate",
    label: "Navigate",
    tools: [
      { id: "selection", label: "Select", Icon: MousePointer2 },
      { id: "hand", label: "Hand", Icon: Hand },
      { id: "eraser", label: "Eraser", Icon: Eraser },
      { id: "frame", label: "Frame", Icon: Frame },
      { id: "laser", label: "Laser", Icon: Sparkle },
    ],
  },
  {
    id: "draw",
    label: "Draw",
    tools: [
      { id: "rectangle", label: "Rectangle", Icon: Square },
      { id: "diamond", label: "Diamond", Icon: Diamond },
      { id: "ellipse", label: "Ellipse", Icon: Circle },
      { id: "arrow", label: "Arrow", Icon: ArrowUpRight },
      { id: "line", label: "Line", Icon: Minus },
      { id: "freedraw", label: "Freehand", Icon: Pencil },
      { id: "text", label: "Text", Icon: TypeIcon },
    ],
  },
];

export function CustomToolbar({ activeTool, onSelect }: Props) {
  return (
    <div className="custom-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOL_SECTIONS.map((section) => (
        <div key={section.id} className="custom-toolbar__section" role="group" aria-label={section.label}>
          <div className="custom-toolbar__section-label">{section.label}</div>
          <div className="custom-toolbar__buttons">
            {section.tools.map((tool) => {
              const isActive = activeTool === tool.id;
              const Icon = tool.Icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`custom-tool ${isActive ? "is-active" : ""}`}
                  aria-pressed={isActive}
                  aria-label={tool.label}
                  onClick={() => onSelect(tool.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
