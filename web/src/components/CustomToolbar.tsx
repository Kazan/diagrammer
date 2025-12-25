import type React from "react";
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
  Image as ImageIcon,
} from "lucide-react";

export type ToolType =
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
  | "image";

type Props = {
  activeTool: ToolType;
  onSelect: (tool: ToolType) => void;
};

type ToolSection = {
  id: string;
  tools: { id: ToolType; label: string; Icon: React.ComponentType<{ size?: number | string }> }[];
};

const TOOL_SECTIONS: ToolSection[] = [
  {
    id: "navigate",
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
    tools: [
      { id: "rectangle", label: "Rectangle", Icon: Square },
      { id: "diamond", label: "Diamond", Icon: Diamond },
      { id: "ellipse", label: "Ellipse", Icon: Circle },
      { id: "arrow", label: "Arrow", Icon: ArrowUpRight },
      { id: "line", label: "Line", Icon: Minus },
      { id: "freedraw", label: "Freehand", Icon: Pencil },
      { id: "text", label: "Text", Icon: TypeIcon },
      { id: "image", label: "Image", Icon: ImageIcon },
    ],
  },
];

export function CustomToolbar({ activeTool, onSelect }: Props) {
  return (
    <div className="custom-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOL_SECTIONS.map((section, index) => (
        <div key={section.id} className="custom-toolbar__section" role="group" aria-label={section.id}>
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
          {index < TOOL_SECTIONS.length - 1 ? <div className="custom-toolbar__divider" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}
