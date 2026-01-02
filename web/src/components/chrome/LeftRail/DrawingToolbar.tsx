import { useRef, useCallback } from "react";
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
  PenTool,
} from "lucide-react";
import {
  ToolRail,
  RailSection,
  RailSeparator,
  RailToggleGroup,
  RailToggleItem,
  RailButton,
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

/** Tools that can be locked (drawing tools) */
const LOCKABLE_TOOLS: Set<ToolType> = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
]);

type Props = {
  activeTool: ToolType;
  arrowType?: ArrowType;
  isToolLocked?: boolean;
  onSelect: (tool: ToolType) => void;
  onLockTool?: (tool: ToolType) => void;
  /** Whether Boox native stylus drawing is available */
  hasNativeDrawing?: boolean;
  /** Whether native drawing is currently in progress */
  isNativeDrawing?: boolean;
  /** Callback to open native drawing canvas */
  onNativeDraw?: () => void;
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

export function DrawingToolbar({
  activeTool,
  arrowType = "sharp",
  isToolLocked = false,
  onSelect,
  onLockTool,
  hasNativeDrawing = false,
  isNativeDrawing = false,
  onNativeDraw,
}: Props) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const LONG_PRESS_DURATION = 500; // ms

  // Determine the icon for the arrow tool based on current arrow type
  const getArrowIcon = () => (arrowType === "elbow" ? ElbowArrowIcon : ArrowUpRight);
  const getArrowLabel = () => (arrowType === "elbow" ? "Elbow Arrow" : "Arrow");

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (toolId: ToolType) => {
      if (!LOCKABLE_TOOLS.has(toolId) || !onLockTool) return;

      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLockTool(toolId);
      }, LONG_PRESS_DURATION);
    },
    [onLockTool]
  );

  const handlePointerUp = useCallback(
    (toolId: ToolType) => {
      clearLongPressTimer();
      // If long press was triggered, don't fire regular click
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      // Regular tap - select tool
      onSelect(toolId);
    },
    [clearLongPressTimer, onSelect]
  );

  const handlePointerLeave = useCallback(() => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
  }, [clearLongPressTimer]);

  const handleNativeDrawClick = useCallback(() => {
    console.log("[DrawingToolbar] Native Draw button clicked");
    onNativeDraw?.();
  }, [onNativeDraw]);

  return (
    <ToolRail position="left" aria-label="Drawing tools">
      <RailToggleGroup value={activeTool} onValueChange={onSelect}>
        {TOOL_SECTIONS.map((section, index) => (
          <RailSection key={section.id} columns={2} label={section.id}>
            {section.tools.map((tool) => {
              // Use dynamic icon for arrow tool
              const Icon = tool.id === "arrow" ? getArrowIcon() : tool.Icon;
              const label = tool.id === "arrow" ? getArrowLabel() : tool.label;
              const isActive = activeTool === tool.id;
              const showLocked = isActive && isToolLocked && LOCKABLE_TOOLS.has(tool.id);

              return (
                <RailToggleItem
                  key={tool.id}
                  value={tool.id}
                  aria-label={showLocked ? `${label} (locked)` : label}
                  data-locked={showLocked || undefined}
                  className={showLocked ? "ring-2 ring-[hsl(var(--accent))] ring-offset-1 ring-offset-[var(--btn-pressed-bg)]" : undefined}
                  onPointerDown={() => handlePointerDown(tool.id)}
                  onPointerUp={() => handlePointerUp(tool.id)}
                  onPointerLeave={handlePointerLeave}
                  onPointerCancel={handlePointerLeave}
                >
                  <Icon aria-hidden="true" />
                </RailToggleItem>
              );
            })}
            {index < TOOL_SECTIONS.length - 1 && <RailSeparator colSpan={2} />}
          </RailSection>
        ))}
      </RailToggleGroup>

      {/* Native Boox stylus drawing button - only shown on supported devices */}
      {hasNativeDrawing && (
        <>
          <RailSeparator colSpan={2} />
          <RailSection columns={2} label="native">
            <RailButton
              onClick={handleNativeDrawClick}
              disabled={isNativeDrawing}
              pressed={isNativeDrawing}
              className="col-span-2 w-full"
              aria-label="Native stylus drawing"
              title="Draw with Boox native stylus (hardware accelerated)"
            >
              <PenTool aria-hidden="true" />
            </RailButton>
          </RailSection>
        </>
      )}
    </ToolRail>
  );
}
