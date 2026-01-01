import { useEffect, useMemo, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import { moveAllLeft, moveAllRight, moveOneLeft, moveOneRight } from "../excalidraw-zindex";
import {
  Copy,
  Layers as LayersIcon,
  MoveRight,
  PaintBucket,
  Palette,
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
import { ArrangeFlyout, type LayerAction, type AlignAction } from "./ArrangeFlyout";
import type { ExplicitStyleDefaults } from "@/hooks/useExplicitStyleDefaults";
import {
  ToolRail,
  RailSection,
  RailSeparator,
  RailButton,
  RailPopoverButton,
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
  /** External signal to close all open flyouts */
  closeSignal?: number;
};

const DEFAULT_STROKE = "#0f172a";
const DEFAULT_FILL = "#b7f5c4";
const LINE_LIKE_TYPES = new Set<ExcalidrawElement["type"]>(["line", "arrow"]);

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

export function SelectionPropertiesRail({ selection, api, onRequestOpen, onStyleCapture, closeSignal }: Props) {
  const elements = selection?.elements ?? [];

  // All hooks must be called unconditionally, before any early return
  const [openKind, setOpenKind] = useState<PropertyKind | null>(null);

  // Close flyouts when external signal changes
  useEffect(() => {
    if (closeSignal !== undefined && closeSignal > 0) {
      setOpenKind(null);
    }
  }, [closeSignal]);

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

  const selectedGroupIds = api?.getAppState().selectedGroupIds ?? {};
  const groupedSelectionIds = useMemo(() => {
    const activeGroupIds = Object.keys(selectedGroupIds).filter(Boolean);
    if (activeGroupIds.length) return activeGroupIds;
    return sharedGroupIds;
  }, [selectedGroupIds, sharedGroupIds]);
  const isGroupedSelection = groupedSelectionIds.length > 0;

  // Count alignment units: groups count as 1 unit, ungrouped elements count as 1 each
  // Show align buttons only when there are 2+ units to align
  const alignmentUnitCount = useMemo(() => {
    if (elements.length <= 1) return elements.length;

    // Find all group IDs and count how many selected elements are in each
    const groupIdToCount = new Map<string, number>();

    for (const el of elements) {
      const groupIds = el.groupIds ?? [];
      for (const gid of groupIds) {
        // Count how many selected elements share this group
        const groupMembers = elements.filter((e) => (e.groupIds ?? []).includes(gid));
        if (groupMembers.length > 1) {
          // This group has multiple selected members
          groupIdToCount.set(gid, groupMembers.length);
        }
      }
    }

    // For each element, find its outermost group that contains other selected elements
    // Elements with the same outermost group are in the same alignment unit
    const elementToOutermostGroup = new Map<string, string | null>();

    for (const el of elements) {
      const groupIds = el.groupIds ?? [];
      // groupIds are ordered innermost to outermost, so iterate to find the outermost shared group
      let outermostSharedGroup: string | null = null;
      for (const gid of groupIds) {
        if ((groupIdToCount.get(gid) ?? 0) > 1) {
          outermostSharedGroup = gid; // Keep updating - last one found is outermost
        }
      }
      elementToOutermostGroup.set(el.id, outermostSharedGroup);
    }

    // Count distinct alignment units
    const distinctGroups = new Set<string>();
    let ungroupedCount = 0;

    for (const el of elements) {
      const outermostGroup = elementToOutermostGroup.get(el.id);
      if (outermostGroup) {
        distinctGroups.add(outermostGroup);
      } else {
        ungroupedCount++;
      }
    }

    // Total units = number of distinct outermost groups + number of ungrouped elements
    return distinctGroups.size + ungroupedCount;
  }, [elements]);

  const canAlign = alignmentUnitCount >= 2;

  // Determine if ungroup should be available:
  // - All selected elements share exactly one outermost group (single group selected), OR
  // - All selected elements are themselves groups (each element has groupIds and represents a distinct group)
  const canUngroup = useMemo(() => {
    if (!elements.length) return false;

    // Case 1: All elements share a common outermost groupId (they form a single group)
    // This is true when sharedGroupIds has at least one entry
    if (sharedGroupIds.length > 0) return true;

    // Case 2: Every element has at least one groupId (each is part of some group)
    // This allows ungrouping when selecting multiple distinct groups
    const allHaveGroups = elements.every((el) => (el.groupIds ?? []).length > 0);
    if (allHaveGroups && elements.length > 1) {
      // Check if they're actually distinct groups (not sharing the same group)
      // If they shared a group, sharedGroupIds would be non-empty
      return true;
    }

    return false;
  }, [elements, sharedGroupIds]);

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
  const hasArrowControls = elements.some((el) => el.type === "arrow");
  const hasTextControls = elements.some((el) =>
    el.type === "text" || el.boundElements?.some((b) => b.type === "text")
  );
  const showStrokeColorButton = !selectionComposition.isTextOnly && !isFrameOnly;
  const showTextColorButton = selectionComposition.hasDirectText || selectionComposition.hasContainersWithText;
  const showFillColorButton = hasFillCapable && !hasImage && !isFrameOnly;
  const hasAnyPropertyButtons = showStrokeColorButton || showFillColorButton || hasStyleControls || hasArrowControls || hasTextControls || (showTextColorButton && !hasImage);

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

    // Only remove one level of grouping at a time
    // For each element, remove only its outermost groupId
    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return el;
      const currentGroupIds = el.groupIds ?? [];
      if (currentGroupIds.length === 0) return el;

      // Remove the last (outermost) groupId only
      const nextGroupIds = currentGroupIds.slice(0, -1);
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

    // Build alignment units: groups are treated as single units
    // An alignment unit is either:
    // 1. A group of elements that share a common groupId (the outermost one within selection)
    // 2. An individual element that isn't grouped with other selected elements

    // Find all group IDs present in the selection
    const groupIdToElements = new Map<string, ExcalidrawElement[]>();
    const ungroupedElements: ExcalidrawElement[] = [];

    for (const el of elements) {
      const groupIds = el.groupIds ?? [];
      if (groupIds.length > 0) {
        // Find the outermost group that contains multiple selected elements
        let assignedGroup: string | null = null;
        for (const gid of groupIds) {
          const groupMembers = elements.filter(
            (e) => (e.groupIds ?? []).includes(gid)
          );
          if (groupMembers.length > 1) {
            // This group has multiple selected members - use the outermost such group
            assignedGroup = gid;
          }
        }
        if (assignedGroup) {
          if (!groupIdToElements.has(assignedGroup)) {
            groupIdToElements.set(assignedGroup, []);
          }
          groupIdToElements.get(assignedGroup)!.push(el);
        } else {
          // Element has groupIds but none of them contain other selected elements
          ungroupedElements.push(el);
        }
      } else {
        ungroupedElements.push(el);
      }
    }

    // Build alignment units with their bounds
    type AlignmentUnit = {
      elements: ExcalidrawElement[];
      bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    };

    const alignmentUnits: AlignmentUnit[] = [];

    // Add grouped units
    for (const [, groupElements] of groupIdToElements) {
      // Deduplicate elements that might be in nested groups
      const uniqueIds = new Set<string>();
      const uniqueElements = groupElements.filter((el) => {
        if (uniqueIds.has(el.id)) return false;
        uniqueIds.add(el.id);
        return true;
      });

      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      for (const el of uniqueElements) {
        gMinX = Math.min(gMinX, el.x);
        gMinY = Math.min(gMinY, el.y);
        gMaxX = Math.max(gMaxX, el.x + el.width);
        gMaxY = Math.max(gMaxY, el.y + el.height);
      }
      alignmentUnits.push({
        elements: uniqueElements,
        bounds: { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY, width: gMaxX - gMinX, height: gMaxY - gMinY },
      });
    }

    // Add ungrouped elements as individual units
    for (const el of ungroupedElements) {
      // Skip if already included in a group
      const alreadyIncluded = alignmentUnits.some((unit) =>
        unit.elements.some((e) => e.id === el.id)
      );
      if (alreadyIncluded) continue;

      alignmentUnits.push({
        elements: [el],
        bounds: { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height, width: el.width, height: el.height },
      });
    }

    // Calculate the delta for each unit based on alignment action
    const unitDeltas = new Map<string, { dx: number; dy: number }>();

    for (const unit of alignmentUnits) {
      const ub = unit.bounds;
      let dx = 0, dy = 0;

      switch (action) {
        case "left":
          dx = minX - ub.minX;
          break;
        case "right":
          dx = maxX - ub.maxX;
          break;
        case "centerX":
          dx = (minX + width / 2) - (ub.minX + ub.width / 2);
          break;
        case "top":
          dy = minY - ub.minY;
          break;
        case "bottom":
          dy = maxY - ub.maxY;
          break;
        case "centerY":
          dy = (minY + height / 2) - (ub.minY + ub.height / 2);
          break;
      }

      for (const el of unit.elements) {
        unitDeltas.set(el.id, { dx, dy });
      }
    }

    // Apply deltas to all selected elements
    const nextElements = api.getSceneElements().map((el) => {
      const delta = unitDeltas.get(el.id);
      if (!delta) return el;
      const base = { version: el.version + 1, versionNonce: randomNonce(), updated: now };
      return { ...el, x: el.x + delta.dx, y: el.y + delta.dy, ...base };
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
      const randomId = () => Math.random().toString(36).slice(2, 10);
      const idMap = new Map<string, string>();
      duplicationSource.forEach((source, index) => {
        const clone = elementsToRemap[index];
        if (clone) {
          idMap.set(source.id, clone.id);
        }
      });

      // Build groupId map - collect all unique groupIds and generate new ones
      const groupIdMap = new Map<string, string>();
      for (const el of duplicationSource) {
        if (el.groupIds) {
          for (const gid of el.groupIds) {
            if (!groupIdMap.has(gid)) {
              groupIdMap.set(gid, randomId());
            }
          }
        }
      }

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

        // Remap groupIds so cloned groups are independent from originals
        const mappedGroupIds = clone.groupIds?.map((gid) => groupIdMap.get(gid) ?? gid);

        return {
          ...clone,
          ...(mappedBoundElements ? { boundElements: mappedBoundElements } : {}),
          ...(mappedContainer ? { containerId: mappedContainer } : {}),
          ...(mappedFrameId ? { frameId: mappedFrameId } : {}),
          ...(mappedGroupIds ? { groupIds: mappedGroupIds } : {}),
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
        <RailPopoverButton
          open={openKind === "arrange"}
          onOpenChange={(open) => setOpenKind(open ? "arrange" : null)}
          aria-label="Layers and alignment"
          contentClassName="min-w-[232px]"
          content={
            <ArrangeFlyout
              canAlign={canAlign}
              canUngroup={canUngroup}
              onLayerAction={moveSelection}
              onAlignAction={alignSelection}
              onGroup={handleGroupSelection}
              onUngroup={handleUngroupSelection}
            />
          }
        >
          <LayersIcon size={18} aria-hidden="true" />
        </RailPopoverButton>

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
