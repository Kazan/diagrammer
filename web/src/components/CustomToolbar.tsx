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

export type ArrowType = "sharp" | "round" | "elbow";

type Props = {
  activeTool: ToolType;
  arrowType?: ArrowType;
  onSelect: (tool: ToolType) => void;
};

/**
 * Elbow arrow icon (stepped/orthogonal line with arrowhead).
 */
function ElbowArrowIcon({ size = 24 }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Elbow path: horizontal then vertical */}
      <path d="M5 8 H14 V16" />
      {/* Arrowhead pointing down */}
      <path d="M11 13 L14 16 L17 13" />
    </svg>
  );
}

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

export function CustomToolbar({ activeTool, arrowType = "sharp", onSelect }: Props) {
  // Determine the icon for the arrow tool based on current arrow type
  const getArrowIcon = () => (arrowType === "elbow" ? ElbowArrowIcon : ArrowUpRight);
  const getArrowLabel = () => (arrowType === "elbow" ? "Elbow Arrow" : "Arrow");

  const handleToolClick = (toolId: ToolType) => {
    // Always call onSelect - let parent decide what to do (e.g., toggle arrow type)
    onSelect(toolId);
  };

  return (
    <ToolRail position="left" aria-label="Drawing tools">
      <RailToggleGroup value={activeTool} onValueChange={onSelect}>
        {TOOL_SECTIONS.map((section, index) => (
          <RailSection key={section.id} columns={2} label={section.id}>
            {section.tools.map((tool) => {
              // Use dynamic icon for arrow tool
              const Icon = tool.id === "arrow" ? getArrowIcon() : tool.Icon;
              const label = tool.id === "arrow" ? getArrowLabel() : tool.label;

              return (
                <RailToggleItem
                  key={tool.id}
                  value={tool.id}
                  aria-label={label}
                  onClick={() => handleToolClick(tool.id)}
                >
                  <Icon aria-hidden="true" />
                </RailToggleItem>
              );
            })}
            {index < TOOL_SECTIONS.length - 1 && <RailSeparator colSpan={2} />}
          </RailSection>
        ))}
      </RailToggleGroup>
    </ToolRail>
  );
}
