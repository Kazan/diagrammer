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
import {
  ToolRail,
  RailSection,
  RailSeparator,
  RailToggleGroup,
  RailToggleItem,
} from "@/components/ui/tool-rail";

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

type ToolDef = {
  id: ToolType;
  label: string;
  Icon: React.ComponentType<{ size?: number | string }>;
};

type ToolSection = {
  id: string;
  tools: ToolDef[];
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
    <ToolRail position="left" aria-label="Drawing tools">
      <RailToggleGroup value={activeTool} onValueChange={onSelect}>
        {TOOL_SECTIONS.map((section, index) => (
          <RailSection key={section.id} columns={2} label={section.id}>
            {section.tools.map((tool) => (
              <RailToggleItem key={tool.id} value={tool.id} aria-label={tool.label}>
                <tool.Icon aria-hidden="true" />
              </RailToggleItem>
            ))}
            {index < TOOL_SECTIONS.length - 1 && <RailSeparator colSpan={2} />}
          </RailSection>
        ))}
      </RailToggleGroup>
    </ToolRail>
  );
}
