import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
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
  MoveRight,
  Ungroup,
  PaintBucket,
  Palette,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Type as TypeIcon,
  ALargeSmall,
} from "lucide-react";
import type { SelectionInfo } from "./SelectionFlyout";
import ColorPicker from "./ColorPicker";
import type { PaletteId } from "./ColorPicker";
import { SelectionStyleFlyout } from "./SelectionStyleFlyout";
import { ArrowStyleFlyout } from "./ArrowStyleFlyout";
import { TextStyleFlyout } from "./TextStyleFlyout";
import type { ExplicitStyleDefaults } from "@/hooks/useExplicitStyleDefaults";
import {
  ToolRail,
  RailSection,
  RailSeparator,
  RailButton,
  RailPopoverButton,
  RailSwatch,
  railButtonVariants,
} from "@/components/ui/tool-rail";
import { cn, shouldUseDarkForeground } from "@/lib/utils";

export type PropertyKind = "stroke" | "background" | "style" | "arrow" | "text" | "textColor" | "arrange";

type Props = {
  selection: SelectionInfo | null;
  api: ExcalidrawImperativeAPI | null;
  onRequestOpen?: (kind: PropertyKind) => void;
  onStyleCapture?: <K extends keyof ExplicitStyleDefaults>(
    key: K,
    value: ExplicitStyleDefaults[K],
  ) => void;
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

export function SelectionPropertiesRail({ selection, api, onRequestOpen, onStyleCapture }: Props) {
  const elements = selection?.elements ?? [];

  // All hooks must be called unconditionally, before any early return
  const [openKind, setOpenKind] = useState<PropertyKind | null>(null);

  const selectedIds = useMemo(
    () => new Set(elements.map((el) => el.id)),
    [elements]
  );

  const stampVersion = (el: ExcalidrawElement, now: number) => ({
    ...el,
    version: (el.version ?? 0) + 1,
    versionNonce: Math.floor(Math.random() * 1_000_000_000),
    updated: now,
  });

  // Determine selection composition for color control visibility
  const selectionComposition = useMemo(() => {
    const hasDirectText = elements.some((el) => el.type === "text");
    const hasContainersWithText = elements.some(
      (el) => el.type !== "text" && el.boundElements?.some((b) => b.type === "text")
    );
    const hasNonTextElements = elements.some((el) => el.type !== "text");
    const isTextOnly = hasDirectText && !hasNonTextElements;
    return { hasDirectText, hasContainersWithText, hasNonTextElements, isTextOnly };
  }, [elements]);

  // Get bound text element IDs for containers
  const boundTextIds = useMemo(() => {
    const ids = new Set<string>();
    for (const el of elements) {
      if (el.boundElements) {
        for (const bound of el.boundElements) {
          if (bound.type === "text") {
            ids.add(bound.id);
          }
        }
      }
    }
    return ids;
  }, [elements]);

  // Get all text elements (direct or bound) for color reading
  const allTextElements = useMemo(() => {
    if (!api) return [];
    const sceneElements = api.getSceneElements();
    const textEls: ExcalidrawTextElement[] = [];

    for (const el of elements) {
      if (el.type === "text") {
        textEls.push(el as ExcalidrawTextElement);
      }
    }

    for (const id of boundTextIds) {
      const textEl = sceneElements.find((el) => el.id === id);
      if (textEl?.type === "text") {
        textEls.push(textEl as ExcalidrawTextElement);
      }
    }

    return textEls;
  }, [api, elements, boundTextIds]);

  const strokeColor = useMemo(
    () => getCommonValue<string | null>(elements, (el) => el.strokeColor ?? null) ?? DEFAULT_STROKE,
    [elements],
  );

  const textColor = useMemo(() => {
    if (!allTextElements.length) return DEFAULT_STROKE;
    const colors = allTextElements.map((el) => el.strokeColor ?? DEFAULT_STROKE);
    const first = colors[0];
    return colors.every((c) => c === first) ? first : DEFAULT_STROKE;
  }, [allTextElements]);

  const backgroundColor = useMemo(
    () => getCommonValue<string | null>(elements, (el) => el.backgroundColor ?? null) ?? DEFAULT_FILL,
    [elements],
  );
  const isFillTransparent = backgroundColor === "transparent";
  const isStrokeTransparent = strokeColor === "transparent";
  const isTextTransparent = textColor === "transparent";

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
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [elements]);

  const sharedGroupIds = useMemo(() => {
    if (!elements.length) return [] as string[];
    const [first, ...rest] = elements;
    const baseIds = [...(first.groupIds ?? [])].filter(Boolean);
    if (!baseIds.length) return [] as string[];
    return baseIds.filter((groupId) => rest.every((el) => (el.groupIds ?? []).includes(groupId)));
  }, [elements]);

  // Close flyouts that are not applicable
  const hasImage = elements.some((el) => el.type === "image");
  const hasLinearElements = elements.some((el) => el.type === "arrow" || el.type === "line");
  useEffect(() => {
    if (hasImage && (openKind === "stroke" || openKind === "background" || openKind === "style" || openKind === "text" || openKind === "textColor")) {
      setOpenKind(null);
    }
    if (!hasLinearElements && openKind === "arrow") {
      setOpenKind(null);
    }
  }, [hasImage, hasLinearElements, openKind]);

  useEffect(() => {
    if (openKind !== "arrange") return;
    console.log("[arrange] flyout mount", { selectionCount: elements.length });
    return () => console.log("[arrange] flyout unmount");
  }, [openKind, elements.length]);

  // Early return AFTER all hooks have been called
  if (!elements.length) return null;

  const isMultiSelect = elements.length > 1;
  const isFrameOnly = elements.length === 1 && (elements[0].type === "frame" || elements[0].type === "magicframe");
  const hasFillCapable = elements.some((el) => (!LINE_LIKE_TYPES.has(el.type) && el.type !== "text") || isClosedPolyline(el));
  const hasStyleControls = elements.some((el) => el.type !== "text" && el.type !== "image" && el.type !== "frame" && el.type !== "magicframe");
  const hasArrowControls = elements.some((el) => el.type === "arrow" || el.type === "line");
  const hasTextControls = elements.some((el) =>
    el.type === "text" || el.boundElements?.some((b) => b.type === "text")
  );
  const showStrokeColorButton = !selectionComposition.isTextOnly && !isFrameOnly;
  const showTextColorButton = selectionComposition.hasDirectText || selectionComposition.hasContainersWithText;
  const showFillColorButton = hasFillCapable && !hasImage && !isFrameOnly;
  const hasAnyPropertyButtons = showStrokeColorButton || showFillColorButton || hasStyleControls || hasArrowControls || hasTextControls || (showTextColorButton && !hasImage);

  const selectedGroupIds = api?.getAppState().selectedGroupIds ?? {};
  const groupedSelectionIds = useMemo(() => {
    const activeGroupIds = Object.keys(selectedGroupIds).filter(Boolean);
    if (activeGroupIds.length) return activeGroupIds;
    return sharedGroupIds;
  }, [selectedGroupIds, sharedGroupIds]);
  const isGroupedSelection = groupedSelectionIds.length > 0;

  // Handlers
  const applyToSelection = (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !elements.length) return;
    const now = Date.now();
    const nextElements = api
      .getSceneElements()
      .map((el) => {
        if (!selectedIds.has(el.id)) return el;
        const mutated = mutate({ ...el });
        const hasVersionBump = typeof mutated.version === "number" && mutated.version !== el.version;
        return hasVersionBump ? mutated : stampVersion(mutated, now);
      });
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const handleUngroupSelection = () => {
    if (!api || !elements.length) return;
    const now = Date.now();
    const groupsToRemove = groupedSelectionIds;
    if (!groupsToRemove.length) return;

    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return el;
      const nextGroupIds = (el.groupIds ?? []).filter((groupId) => !groupsToRemove.includes(groupId));
      if (nextGroupIds.length === (el.groupIds ?? []).length) return el;
      return stampVersion({ ...el, groupIds: nextGroupIds }, now);
    });

    const nextSelectedElementIds = elements.reduce<Record<string, true>>((acc, el) => {
      acc[el.id] = true;
      return acc;
    }, {});

    api.updateScene({
      elements: nextElements,
      appState: { ...api.getAppState(), selectedGroupIds: {}, selectedElementIds: nextSelectedElementIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const moveSelection = (action: LayerAction) => {
    if (!api || !selectedIds.size) return;
    const scene = api.getSceneElements();
    const appState = api.getAppState();

    const reordered = (() => {
      switch (action) {
        case "forward": return moveOneRight(scene, appState) as ExcalidrawElement[];
        case "backward": return moveOneLeft(scene, appState) as ExcalidrawElement[];
        case "toFront": return moveAllRight(scene, appState) as ExcalidrawElement[];
        case "toBack": return moveAllLeft(scene, appState) as ExcalidrawElement[];
        default: return scene;
      }
    })();

    api.updateScene({ elements: reordered, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const alignSelection = (action: AlignAction) => {
    if (!api || !selectionBounds || !isMultiSelect) return;
    const { minX, minY, maxX, maxY, width, height } = selectionBounds;
    const now = Date.now();
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);

    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return { ...el };
      const base = { version: el.version + 1, versionNonce: randomNonce(), updated: now };
      switch (action) {
        case "left": return { ...el, x: minX, ...base };
        case "right": return { ...el, x: maxX - el.width, ...base };
        case "centerX": return { ...el, x: minX + (width - el.width) / 2, ...base };
        case "top": return { ...el, y: minY, ...base };
        case "bottom": return { ...el, y: maxY - el.height, ...base };
        case "centerY": return { ...el, y: minY + (height - el.height) / 2, ...base };
        default: return { ...el, ...base };
      }
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
      return { ...el, groupIds: [...el.groupIds, groupId], version: el.version + 1, versionNonce: randomNonce(), updated: now };
    });

    const nextSelectedElementIds = elements.reduce<Record<string, true>>((acc, el) => {
      acc[el.id] = true;
      return acc;
    }, {});

    api.updateScene({
      elements: nextElements,
      appState: { ...api.getAppState(), selectedGroupIds: { [groupId]: true }, selectedElementIds: nextSelectedElementIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const duplicateSelection = () => {
    if (!api || !elements.length) return;
    const sourceElements = elements.filter((el) => el.type !== "selection");
    if (!sourceElements.length) return;
    const scene = api.getSceneElements();

    const canUseSkeletonDuplication = sourceElements.every((el) => {
      if (el.type === "frame" || el.type === "magicframe") return false;
      if (el.type === "image" && !el.fileId) return false;
      return true;
    });

    // Collect frame IDs from selected frames
    const selectedFrameIds = new Set<string>();
    for (const el of sourceElements) {
      if (el.type === "frame" || el.type === "magicframe") {
        selectedFrameIds.add(el.id);
      }
    }

    // Find all elements contained in selected frames
    const frameChildElements = scene.filter((el) => {
      if (el.isDeleted) return false;
      const frameId = (el as { frameId?: string | null }).frameId;
      return frameId && selectedFrameIds.has(frameId);
    });

    const boundTextIds = new Set<string>();
    for (const el of sourceElements) {
      if (el.boundElements) {
        for (const bound of el.boundElements) {
          boundTextIds.add(bound.id);
        }
      }
    }
    // Also collect bound text from frame children
    for (const el of frameChildElements) {
      if (el.boundElements) {
        for (const bound of el.boundElements) {
          boundTextIds.add(bound.id);
        }
      }
    }
    const boundTextElements = scene.filter((el) => boundTextIds.has(el.id));
    const duplicationSource: ExcalidrawElement[] = [...sourceElements];
    // Add frame children that aren't already in source
    for (const frameChild of frameChildElements) {
      if (!duplicationSource.some((el) => el.id === frameChild.id)) {
        duplicationSource.push(frameChild as ExcalidrawElement);
      }
    }
    for (const boundText of boundTextElements) {
      if (!duplicationSource.some((el) => el.id === boundText.id)) {
        duplicationSource.push(boundText as ExcalidrawElement);
      }
    }

    const cloneOffset = { dx: 16, dy: 16 } as const;

    const clones: ExcalidrawElement[] = canUseSkeletonDuplication
      ? convertToExcalidrawElements(
          duplicationSource as unknown as NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>,
          { regenerateIds: true },
        ).map((el) => ({ ...el, x: el.x + cloneOffset.dx, y: el.y + cloneOffset.dy }))
      : (() => {
          const randomId = () => Math.random().toString(36).slice(2, 10);
          const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
          return duplicationSource.map((el) => ({
            ...el,
            id: randomId(),
            seed: randomNonce(),
            version: 1,
            versionNonce: randomNonce(),
            isDeleted: false,
            x: el.x + cloneOffset.dx,
            y: el.y + cloneOffset.dy,
          }));
        })();

    const remapBoundIds = (elementsToRemap: ExcalidrawElement[]) => {
      const idMap = new Map<string, string>();
      duplicationSource.forEach((source, index) => {
        const clone = elementsToRemap[index];
        if (clone) {
          idMap.set(source.id, clone.id);
        }
      });

      const remapped = elementsToRemap.map((clone) => {
        const mappedBoundElements = clone.boundElements
          ? clone.boundElements.map((binding) => {
              const mappedId = idMap.get(binding.id);
              return mappedId ? { ...binding, id: mappedId } : binding;
            })
          : clone.boundElements;

        const mappedContainer = "containerId" in clone && clone.containerId ? idMap.get(clone.containerId) : null;

        // Remap frameId for elements inside frames
        const sourceFrameId = (clone as { frameId?: string | null }).frameId;
        const mappedFrameId = sourceFrameId ? idMap.get(sourceFrameId) : null;

        return {
          ...clone,
          ...(mappedBoundElements ? { boundElements: mappedBoundElements } : {}),
          ...(mappedContainer ? { containerId: mappedContainer } : {}),
          ...(mappedFrameId ? { frameId: mappedFrameId } : {}),
        } as ExcalidrawElement;
      });

      return { remapped, idMap } as const;
    };

    const adjustBoundTextPositions = (
      remapped: ExcalidrawElement[],
      idMap: Map<string, string>,
    ): ExcalidrawElement[] => {
      const reverseIdMap = new Map<string, string>();
      idMap.forEach((cloneId, sourceId) => reverseIdMap.set(cloneId, sourceId));

      const cloneLookup = new Map(remapped.map((el) => [el.id, el]));
      const sourceLookup = new Map(duplicationSource.map((el) => [el.id, el]));

      return remapped.map((el) => {
        if (el.type !== "text") return el;
        if (!("containerId" in el) || !el.containerId) return el;
        const containerClone = cloneLookup.get(el.containerId);
        if (!containerClone || !("width" in containerClone && "height" in containerClone)) return el;

        const sourceId = reverseIdMap.get(el.id);
        const sourceText = sourceId ? sourceLookup.get(sourceId) : null;
        const textWidth = el.width;
        const textHeight = el.height;

        const newX = containerClone.x + (containerClone.width - textWidth) / 2;
        const newY = containerClone.y + (containerClone.height - textHeight) / 2;

        return {
          ...el,
          x: newX,
          y: newY,
          // Preserve any other properties; width/height come from cloned text
        } as ExcalidrawElement;
      });
    };

    const { remapped, idMap } = remapBoundIds(clones);
    const clonesWithBoundFix = adjustBoundTextPositions(remapped, idMap);

    const nextSelectedElementIds = clonesWithBoundFix.reduce<Record<string, true>>((acc, clone) => {
      acc[clone.id] = true;
      return acc;
    }, {});

    api.updateScene({
      elements: [...scene, ...clonesWithBoundFix],
      appState: { selectedElementIds: nextSelectedElementIds, selectedGroupIds: {} },
    });
  };

  const deleteSelection = () => applyToSelection((el) => ({ ...el, isDeleted: true }));

  const handleStrokeChange = (color: string) => {
    if (!api) return;
    const sceneElements = api.getSceneElements();
    const textIds = new Set<string>();
    for (const el of elements) {
      if (el.boundElements) {
        for (const bound of el.boundElements) {
          if (bound.type === "text") textIds.add(bound.id);
        }
      }
    }
    const now = Date.now();
    const nextElements = sceneElements.map((el) => {
      if (selectedIds.has(el.id) || textIds.has(el.id)) {
        return stampVersion({ ...el, strokeColor: color }, now);
      }
      return el;
    });
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    onStyleCapture?.("strokeColor", color);
  };

  const handleBackgroundChange = (color: string) => {
    applyToSelection((el) => ({ ...el, backgroundColor: color }));
    onStyleCapture?.("backgroundColor", color);
  };

  const handleTextColorChange = (color: string) => {
    if (!api) return;
    const sceneElements = api.getSceneElements();
    const textIdsToUpdate = new Set<string>();
    for (const el of elements) {
      if (el.type === "text") textIdsToUpdate.add(el.id);
      if (el.boundElements) {
        for (const bound of el.boundElements) {
          if (bound.type === "text") textIdsToUpdate.add(bound.id);
        }
      }
    }
    const now = Date.now();
    const nextElements = sceneElements.map((el) => {
      if (textIdsToUpdate.has(el.id)) return stampVersion({ ...el, strokeColor: color }, now);
      return el;
    });
    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    // Text color uses strokeColor for text elements, but we don't capture it
    // as a separate default since text elements inherit from strokeColor
  };

  // Flyout button for arrange panel
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

    return (
      <RailButton
        variant="flyout"
        data-testid={testId}
        onPointerDownCapture={(e) => { pointerActivatedRef.current = false; e.stopPropagation(); }}
        onPointerUp={(e) => {
          if (e.button !== 0) return;
          pointerActivatedRef.current = true;
          e.stopPropagation();
          onClick();
        }}
        onClick={(e) => {
          if (pointerActivatedRef.current) { pointerActivatedRef.current = false; return; }
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
      >
        <Icon size={18} aria-hidden="true" style={iconStyle} />
      </RailButton>
    );
  };

  // Arrange flyout content
  const arrangeFlyoutContent = (
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
            <ArrangeTile Icon={AlignStartVertical} label="Align top" testId="arrange-align-top" onClick={() => alignSelection("top")} iconStyle={{ transform: "rotate(90deg)" }} />
            <ArrangeTile Icon={AlignCenterVertical} label="Align middle (X axis)" testId="arrange-align-center-y" onClick={() => alignSelection("centerY")} iconStyle={{ transform: "rotate(90deg)" }} />
            <ArrangeTile Icon={AlignEndVertical} label="Align bottom" testId="arrange-align-bottom" onClick={() => alignSelection("bottom")} iconStyle={{ transform: "rotate(90deg)" }} />
          </div>
        </div>
      )}

      {isMultiSelect && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-bold text-slate-900">Actions</div>
          <div className="grid grid-cols-1 gap-2" role="group" aria-label="Grouping">
            {isGroupedSelection ? (
              <ArrangeTile Icon={Ungroup} label="Ungroup selection" testId="arrange-ungroup" onClick={handleUngroupSelection} />
            ) : (
              <ArrangeTile Icon={GroupIcon} label="Group selection" testId="arrange-group" onClick={handleGroupSelection} />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolRail position="right" showDivider aria-label="Selection properties">
      {/* Property buttons with popovers */}      {hasAnyPropertyButtons && (      <RailSection columns={1}>
        {/* Stroke color */}
        {showStrokeColorButton && !hasImage && (
          <RailPopoverButton
            open={openKind === "stroke"}
            onOpenChange={(open) => setOpenKind(open ? "stroke" : null)}
            aria-label="Stroke color"
            className="relative"
            content={
              <ColorPicker
                value={strokeColor}
                onChange={handleStrokeChange}
                title="Stroke color"
                initialShadeIndex={3}
                paletteId={"default" satisfies PaletteId}
              />
            }
          >
            <span
              className={cn(
                "stroke-color-indicator",
                isStrokeTransparent
                  ? "stroke-color-indicator--transparent"
                  : shouldUseDarkForeground(strokeColor)
                    ? "stroke-color-indicator--filled-dark"
                    : "stroke-color-indicator--filled",
              )}
              aria-hidden="true"
              style={isStrokeTransparent ? undefined : { backgroundColor: strokeColor }}
            >
              <Palette className="size-[24px]" strokeWidth={1.4} aria-hidden="true" />
            </span>
          </RailPopoverButton>
        )}

        {/* Fill color */}
        {showFillColorButton && (
          <RailPopoverButton
            open={openKind === "background"}
            onOpenChange={(open) => setOpenKind(open ? "background" : null)}
            aria-label="Fill color"
            className="relative"
            content={
              <ColorPicker
                value={backgroundColor}
                onChange={handleBackgroundChange}
                title="Fill color"
                initialShadeIndex={5}
                paletteId={"default" satisfies PaletteId}
              />
            }
          >
            <span
              className={cn(
                "fill-color-indicator",
                isFillTransparent
                  ? "fill-color-indicator--transparent"
                  : shouldUseDarkForeground(backgroundColor)
                    ? "fill-color-indicator--filled-dark"
                    : "fill-color-indicator--filled",
              )}
              aria-hidden="true"
              style={isFillTransparent ? undefined : { backgroundColor }}
            >
              <PaintBucket className="size-[24px]" strokeWidth={1.4} aria-hidden="true" />
            </span>
          </RailPopoverButton>
        )}

        {/* Style controls */}
        {hasStyleControls && (
          <RailPopoverButton
            open={openKind === "style"}
            onOpenChange={(open) => setOpenKind(open ? "style" : null)}
            aria-label="Stroke and fill style"
            content={<SelectionStyleFlyout elements={elements} onUpdate={applyToSelection} onStyleCapture={onStyleCapture} />}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </RailPopoverButton>
        )}

        {/* Arrow style controls */}
        {hasArrowControls && (
          <RailPopoverButton
            open={openKind === "arrow"}
            onOpenChange={(open) => setOpenKind(open ? "arrow" : null)}
            aria-label="Arrow style"
            content={<ArrowStyleFlyout elements={elements} onUpdate={applyToSelection} onStyleCapture={onStyleCapture} />}
          >
            <MoveRight size={18} aria-hidden="true" />
          </RailPopoverButton>
        )}

        {/* Text style */}
        {hasTextControls && (
          <RailPopoverButton
            open={openKind === "text"}
            onOpenChange={(open) => setOpenKind(open ? "text" : null)}
            aria-label="Text style"
            content={
              <TextStyleFlyout
                elements={elements}
                allSceneElements={api?.getSceneElements() ?? []}
                api={api}
                selectedIds={selectedIds}
                onStyleCapture={onStyleCapture}
              />
            }
          >
            <TypeIcon size={18} aria-hidden="true" />
          </RailPopoverButton>
        )}

        {/* Text color */}
        {showTextColorButton && !hasImage && (
          <RailPopoverButton
            open={openKind === "textColor"}
            onOpenChange={(open) => setOpenKind(open ? "textColor" : null)}
            aria-label="Text color"
            content={
              <ColorPicker
                value={textColor}
                onChange={handleTextColorChange}
                title="Text color"
                initialShadeIndex={3}
                paletteId={"default" satisfies PaletteId}
              />
            }
          >
            <span
              className={cn(
                "text-color-indicator",
                isTextTransparent
                  ? "text-color-indicator--transparent"
                  : shouldUseDarkForeground(textColor)
                    ? "text-color-indicator--filled-dark"
                    : "text-color-indicator--filled",
              )}
              aria-hidden="true"
              style={isTextTransparent ? undefined : { backgroundColor: textColor }}
            >
              <ALargeSmall className="size-[24px]" strokeWidth={1.4} aria-hidden="true" />
            </span>
          </RailPopoverButton>
        )}
      </RailSection>
      )}

      {hasAnyPropertyButtons && <RailSeparator />}

      {/* Action buttons */}
      <RailSection columns={1}>
        {isMultiSelect && (
          <RailPopoverButton
            open={openKind === "arrange"}
            onOpenChange={(open) => setOpenKind(open ? "arrange" : null)}
            aria-label="Layers and alignment"
            contentClassName="min-w-[232px]"
            content={arrangeFlyoutContent}
          >
            <LayersIcon size={18} aria-hidden="true" />
          </RailPopoverButton>
        )}

        <RailButton onClick={duplicateSelection} aria-label="Duplicate selection">
          <Copy size={18} aria-hidden="true" />
        </RailButton>

        <RailButton onClick={deleteSelection} aria-label="Delete selection">
          <Trash2 size={18} aria-hidden="true" />
        </RailButton>
      </RailSection>
    </ToolRail>
  );
}
