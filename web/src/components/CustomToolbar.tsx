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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup, toolbarButtonVariants } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";

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
    <Toolbar
      aria-label="Drawing tools"
      className={cn(
        "fixed left-[var(--tool-rail-left)] top-[var(--tool-rail-top)]",
        "w-[var(--tool-rail-width)] p-3",
        "animate-[float-in_260ms_ease_both]"
      )}
    >
      <ToggleGroup
        type="single"
        value={activeTool}
        onValueChange={(value) => value && onSelect(value as ToolType)}
        className="flex flex-col gap-1.5 w-full"
      >
        {TOOL_SECTIONS.map((section, index) => (
          <ToolbarGroup key={section.id} aria-label={section.id} orientation="horizontal" className="grid grid-cols-2 gap-1.5">
            {section.tools.map((tool) => (
              <ToggleGroupItem
                key={tool.id}
                value={tool.id}
                aria-label={tool.label}
                className={cn(
                  toolbarButtonVariants({ variant: "default", size: "default" }),
                  "data-[state=on]:bg-[var(--toolbar-btn-active-bg)] data-[state=on]:border-[var(--toolbar-btn-active-border)] data-[state=on]:text-[var(--toolbar-btn-active-text)]"
                )}
              >
                <tool.Icon aria-hidden="true" />
              </ToggleGroupItem>
            ))}
            {index < TOOL_SECTIONS.length - 1 && (
              <ToolbarSeparator className="col-span-2 my-1.5" />
            )}
          </ToolbarGroup>
        ))}
      </ToggleGroup>
    </Toolbar>
  );
}
