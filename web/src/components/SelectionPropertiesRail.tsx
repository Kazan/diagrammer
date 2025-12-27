import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { moveAllLeft, moveAllRight, moveOneLeft, moveOneRight } from "../excalidraw-zindex";
import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Copy,
  Group as GroupIcon,
  Layers as LayersIcon,
  PaintBucket,
  Palette,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import type { SelectionInfo } from "./SelectionFlyout";
import ColorPicker from "./ColorPicker";
import type { PaletteId } from "./ColorPicker";
import { SelectionStyleFlyout } from "./SelectionStyleFlyout";
import { TextStyleFlyout } from "./TextStyleFlyout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup, ToolbarSwatch } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";

export type PropertyKind = "stroke" | "background" | "style" | "text" | "arrange";

type Props = {
  selection: SelectionInfo | null;
  api: ExcalidrawImperativeAPI | null;
  onRequestOpen?: (kind: PropertyKind) => void;
};

const DEFAULT_STROKE = "#0f172a";
const DEFAULT_FILL = "#b7f5c4";
const LINE_LIKE_TYPES = new Set<ExcalidrawElement["type"]>(["line", "arrow"]);

type LayerAction = "toFront" | "toBack" | "forward" | "backward";
type AlignAction = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

const isClosedPolyline = (el: ExcalidrawElement) => {
  if (el.type !== "line") return false;
  const points = el.points;
  if (!points || points.length < 3) return false;
  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points[points.length - 1];
  const epsilon = 0.5;
  return Math.abs(firstX - lastX) <= epsilon && Math.abs(firstY - lastY) <= epsilon;
};

function getCommonValue<T>(
  elements: readonly ExcalidrawElement[],
  pick: (el: ExcalidrawElement) => T,
): T | null {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

export function SelectionPropertiesRail({ selection, api, onRequestOpen }: Props) {
  const elements = selection?.elements ?? [];

  // All hooks must be called unconditionally, before any early return
  const [openKind, setOpenKind] = useState<PropertyKind | null>(null);

  const selectedIds = useMemo(
    () => new Set(elements.map((el) => el.id)),
    [elements]
  );

  const strokeColor = useMemo(
    () =>
      getCommonValue<string | null>(elements, (el) => el.strokeColor ?? null) ?? DEFAULT_STROKE,
    [elements],
  );

  const backgroundColor = useMemo(
    () =>
      getCommonValue<string | null>(
        elements,
        (el) => el.backgroundColor ?? null,
      ) ?? DEFAULT_FILL,
    [elements],
  );

  const selectionBounds = useMemo(() => {
    if (!elements.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [elements]);

  // Close flyouts that are not applicable (e.g., when images are selected).
  const hasImage = elements.some((el) => el.type === "image");
  useEffect(() => {
    if (hasImage && (openKind === "stroke" || openKind === "background" || openKind === "style" || openKind === "text")) {
      setOpenKind(null);
    }
  }, [hasImage, openKind]);

  useEffect(() => {
    if (openKind !== "arrange") return;
    console.log("[arrange] flyout mount", { selectionCount: elements.length });
    return () => console.log("[arrange] flyout unmount");
  }, [openKind, elements.length]);

  // Early return AFTER all hooks have been called
  if (!elements.length) return null;

  const isMultiSelect = elements.length > 1;
  const hasFillCapable = elements.some((el) => (!LINE_LIKE_TYPES.has(el.type) && el.type !== "text") || isClosedPolyline(el));
  const hasStyleControls = elements.some((el) => el.type !== "text" && el.type !== "image");
  // Text controls: show for text elements or shapes that can contain text (have bound text)
  const hasTextControls = elements.some((el) =>
    el.type === "text" || el.boundElements?.some((b) => b.type === "text")
  );

  const applyToSelection = (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !elements.length) return;
    const nextElements = api.getSceneElements().map((el) => (selectedIds.has(el.id) ? mutate({ ...el }) : el));
    api.updateScene({ elements: nextElements });
  };

  const moveSelection = (action: LayerAction) => {
    console.log("z-index action request", {
      action,
      hasApi: Boolean(api),
      selectionCount: selectedIds.size,
    });

    if (!api) {
      return;
    }

    if (!selectedIds.size) {
      console.warn("z-index action skipped: no selection", { action });
      return;
    }

    const scene = api.getSceneElements();
    const appState = api.getAppState();
    console.log("z-index action start", { action, selectedCount: selectedIds.size });

    const reordered = (() => {
      switch (action) {
        case "forward":
          return moveOneRight(scene, appState) as ExcalidrawElement[];
        case "backward":
          return moveOneLeft(scene, appState) as ExcalidrawElement[];
        case "toFront":
          return moveAllRight(scene, appState) as ExcalidrawElement[];
        case "toBack":
          return moveAllLeft(scene, appState) as ExcalidrawElement[];
        default:
          return scene;
      }
    })();

    console.log("z-index action result", {
      action,
      length: reordered.length,
      firstIds: reordered.slice(0, 5).map((el) => el.id),
    });

    api.updateScene({ elements: reordered, captureUpdate: CaptureUpdateAction.IMMEDIATELY });

    console.log("z-index action applied", {
      action,
      selectedIds: Array.from(selectedIds),
    });
  };

  const alignSelection = (action: AlignAction) => {
    if (!api || !selectionBounds || !isMultiSelect) return;
    const { minX, minY, maxX, maxY, width, height } = selectionBounds;
    const now = Date.now();
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return { ...el };
      if (action === "left") return { ...el, x: minX, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "right") return { ...el, x: maxX - el.width, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "centerX") return { ...el, x: minX + (width - el.width) / 2, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "top") return { ...el, y: minY, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "bottom") return { ...el, y: maxY - el.height, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "centerY") return { ...el, y: minY + (height - el.height) / 2, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      return { ...el, version: el.version + 1, versionNonce: randomNonce(), updated: now };
    });

    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const handleGroupSelection = () => {
    if (!api || !isMultiSelect) return;
    const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return { ...el };
      return {
        ...el,
        groupIds: [...el.groupIds, groupId],
        version: el.version + 1,
        versionNonce: randomNonce(),
        updated: now,
      };
    });

    const nextSelectedElementIds = elements.reduce<Record<string, true>>((acc, el) => {
      acc[el.id] = true;
      return acc;
    }, {});

    api.updateScene({
      elements: nextElements,
      appState: {
        ...api.getAppState(),
        selectedGroupIds: { [groupId]: true },
        selectedElementIds: nextSelectedElementIds,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const duplicateSelection = () => {
    if (!api || !elements.length) return;
    const sourceElements = elements.filter((el) => el.type !== "selection");
    if (!sourceElements.length) return;
    const scene = api.getSceneElements();
    const appState = api.getAppState();

    const canUseSkeletonDuplication = sourceElements.every((el) => {
      if (el.type === "frame" || el.type === "magicframe") return false;
      if (el.type === "image" && !el.fileId) return false;
      return true;
    });

    const clones: ExcalidrawElement[] = canUseSkeletonDuplication
      ? convertToExcalidrawElements(
          sourceElements as unknown as NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>,
          { regenerateIds: true },
        ).map((el, index) => ({
          ...el,
          x: el.x + 16 + index * 4,
          y: el.y + 16 + index * 4,
        }))
      : (() => {
          const randomId = () => Math.random().toString(36).slice(2, 10);
          const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
          return sourceElements.map((el, index) => ({
            ...el,
            id: randomId(),
            seed: randomNonce(),
            version: 1,
            versionNonce: randomNonce(),
            isDeleted: false,
            x: el.x + 16 + index * 4,
            y: el.y + 16 + index * 4,
          }));
        })();

    const nextSelectedElementIds = clones.reduce<Record<string, true>>((acc, clone) => {
      acc[clone.id] = true;
      return acc;
    }, {});
    api.updateScene({
      elements: [...scene, ...clones],
      appState: {
        selectedElementIds: nextSelectedElementIds,
        selectedGroupIds: {},
      },
    });
  };

  const deleteSelection = () => {
    applyToSelection((el) => ({ ...el, isDeleted: true }));
  };

  const handleStrokeChange = (color: string) => {
    applyToSelection((el) => ({ ...el, strokeColor: color }));
  };

  const handleBackgroundChange = (color: string) => {
    applyToSelection((el) => ({ ...el, backgroundColor: color }));
  };

  const ArrangeTile = ({
    Icon,
    label,
    onClick,
    testId,
    iconStyle,
  }: {
    Icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
    label: string;
    onClick: () => void;
    testId: string;
    iconStyle?: React.CSSProperties;
  }) => {
    const pointerActivatedRef = useRef(false);

    const activate = (source: "click" | "pointerup") => {
      console.log("[arrange] click", { label, source });
      onClick();
    };

    return (
      <ToolbarButton
        variant="flyout"
        data-testid={testId}
        onPointerDownCapture={(event) => {
          pointerActivatedRef.current = false;
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          if (event.button !== 0) return;
          pointerActivatedRef.current = true;
          event.stopPropagation();
          activate("pointerup");
        }}
        onClick={(event) => {
          if (pointerActivatedRef.current) {
            pointerActivatedRef.current = false;
            return;
          }
          event.stopPropagation();
          activate("click");
        }}
        aria-label={label}
      >
        <Icon size={18} aria-hidden="true" style={iconStyle} />
      </ToolbarButton>
    );
  };

  return (
    <Toolbar
      aria-label="Selection properties"
      className={cn(
        "fixed",
        "left-[calc(var(--tool-rail-left)+var(--tool-rail-width)+var(--rails-gap))]",
        "top-[var(--tool-rail-top)]",
        "p-3 isolate",
        "animate-[float-in_260ms_ease_both]",
        // Divider line
        "before:content-[''] before:absolute before:top-0 before:bottom-0",
        "before:left-[calc(-1*(var(--rails-gap)/2))]",
        "before:w-[var(--rails-divider-width)] before:bg-[var(--rails-divider-color)]",
        "before:-translate-x-1/2 before:rounded-full before:z-0 before:pointer-events-none"
      )}
    >
      {/* Property buttons with popovers */}
      <ToolbarGroup>
        {!hasImage && (
          <Popover open={openKind === "stroke"} onOpenChange={(open) => setOpenKind(open ? "stroke" : null)}>
            <PopoverTrigger asChild>
              <ToolbarButton aria-label="Stroke color" className="relative">
                <ToolbarSwatch color={strokeColor} />
                <Palette size={18} aria-hidden="true" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              className="w-auto min-w-[280px] p-3 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8"
            >
              <ColorPicker
                value={strokeColor}
                onChange={handleStrokeChange}
                title="Stroke color"
                initialShadeIndex={3}
                paletteId={"default" satisfies PaletteId}
              />
            </PopoverContent>
          </Popover>
        )}

        {hasFillCapable && !hasImage && (
          <Popover open={openKind === "background"} onOpenChange={(open) => setOpenKind(open ? "background" : null)}>
            <PopoverTrigger asChild>
              <ToolbarButton aria-label="Fill color" className="relative">
                <ToolbarSwatch color={backgroundColor} />
                <PaintBucket size={18} aria-hidden="true" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              className="w-auto min-w-[280px] p-3 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8"
            >
              <ColorPicker
                value={backgroundColor}
                onChange={handleBackgroundChange}
                title="Fill color"
                initialShadeIndex={5}
                paletteId={"default" satisfies PaletteId}
              />
            </PopoverContent>
          </Popover>
        )}

        {hasStyleControls && (
          <Popover open={openKind === "style"} onOpenChange={(open) => setOpenKind(open ? "style" : null)}>
            <PopoverTrigger asChild>
              <ToolbarButton aria-label="Stroke and fill style">
                <SlidersHorizontal size={18} aria-hidden="true" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              className="w-auto min-w-[280px] p-3 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8"
            >
              <SelectionStyleFlyout elements={elements} onUpdate={applyToSelection} />
            </PopoverContent>
          </Popover>
        )}

        {hasTextControls && (
          <Popover open={openKind === "text"} onOpenChange={(open) => setOpenKind(open ? "text" : null)}>
            <PopoverTrigger asChild>
              <ToolbarButton aria-label="Text style">
                <TypeIcon size={18} aria-hidden="true" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              className="w-auto min-w-[260px] p-3 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8"
            >
              <TextStyleFlyout
                elements={elements}
                allSceneElements={api?.getSceneElements() ?? []}
                api={api}
                selectedIds={selectedIds}
              />
            </PopoverContent>
          </Popover>
        )}

      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Action buttons */}
      <ToolbarGroup orientation="vertical" className="gap-1.5">
        <Popover open={openKind === "arrange"} onOpenChange={(open) => setOpenKind(open ? "arrange" : null)}>
          <PopoverTrigger asChild>
            <ToolbarButton aria-label="Layers and alignment">
              <LayersIcon size={18} aria-hidden="true" />
            </ToolbarButton>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={12}
            className="w-auto min-w-[232px] p-3 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8"
            data-testid="arrange-flyout"
          >
            <div className="flex flex-col gap-3 text-slate-900">
              <div className="flex flex-col gap-2">
                <div className="text-[13px] font-bold text-slate-900">Layers</div>
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="Layer order">
                  <ArrangeTile Icon={SendToBack} label="Send to back" testId="arrange-layer-back" onClick={() => moveSelection("toBack")} />
                  <ArrangeTile Icon={ArrowDown} label="Move backward" testId="arrange-layer-backward" onClick={() => moveSelection("backward")} />
                  <ArrangeTile Icon={ArrowUp} label="Move forward" testId="arrange-layer-forward" onClick={() => moveSelection("forward")} />
                  <ArrangeTile Icon={BringToFront} label="Bring to front" testId="arrange-layer-front" onClick={() => moveSelection("toFront")} />
                </div>
              </div>

              {isMultiSelect && (
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold text-slate-900">Align</div>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Horizontal align">
                    <ArrangeTile Icon={AlignStartVertical} label="Align left" testId="arrange-align-left" onClick={() => alignSelection("left")} />
                    <ArrangeTile Icon={AlignCenterVertical} label="Align center (Y axis)" testId="arrange-align-center-x" onClick={() => alignSelection("centerX")} />
                    <ArrangeTile Icon={AlignEndVertical} label="Align right" testId="arrange-align-right" onClick={() => alignSelection("right")} />
                  </div>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Vertical align">
                    <ArrangeTile
                      Icon={AlignStartVertical}
                      label="Align top"
                      testId="arrange-align-top"
                      onClick={() => alignSelection("top")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                    <ArrangeTile
                      Icon={AlignCenterVertical}
                      label="Align middle (X axis)"
                      testId="arrange-align-center-y"
                      onClick={() => alignSelection("centerY")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                    <ArrangeTile
                      Icon={AlignEndVertical}
                      label="Align bottom"
                      testId="arrange-align-bottom"
                      onClick={() => alignSelection("bottom")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                  </div>
                </div>
              )}

              {isMultiSelect && (
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold text-slate-900">Actions</div>
                  <div className="grid grid-cols-1 gap-2" role="group" aria-label="Grouping">
                    <ArrangeTile Icon={GroupIcon} label="Group selection" testId="arrange-group" onClick={handleGroupSelection} />
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <ToolbarButton onClick={duplicateSelection} aria-label="Duplicate selection">
          <Copy size={18} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton onClick={deleteSelection} aria-label="Delete selection">
          <Trash2 size={18} aria-hidden="true" />
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  );
}
