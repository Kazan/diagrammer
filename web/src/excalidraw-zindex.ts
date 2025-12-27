// Use the public bundle but grab internal helpers dynamically to avoid build-time export checks.
import * as Excalidraw from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

// Port of Excalidraw's internal z-index helpers (v0.18.0).
// Mirrors the logic from dist/dev/index.js for layer reordering.

const logZ = (...args: any[]) => {
  console.debug("[z-index]", ...args);
};

type Direction = "left" | "right";

type ElementsMap = Map<string, ExcalidrawElement>;

type FrameChildrenMap = Map<string, ExcalidrawElement[]>;

type ShiftFn = (
  allElements: readonly ExcalidrawElement[],
  appState: AppState,
  direction: Direction,
  containingFrame: ExcalidrawElement["id"] | null,
  elementsToBeMoved: readonly ExcalidrawElement[],
) => ExcalidrawElement[];

// Runtime-only exports; pull from the runtime namespace to avoid Rollup export warnings.
const excalidrawRuntime = Excalidraw as unknown as Record<string, unknown>;
const pick = <T>(key: string) => (excalidrawRuntime as Record<string, unknown>)[key] as T;

const arrayToMap =
  pick<
    <T extends { id: string }>(
      items: readonly T[],
    ) => Map<string, T>
  >("arrayToMap") ??
  ((items) => new Map(items.map((item) => [item.id, item])));
const findIndex =
  pick<
    <T>(items: readonly T[], predicate: (value: T) => boolean, fromIndex?: number) => number
  >("findIndex") ??
  ((items, predicate, fromIndex = 0) => {
    for (let i = fromIndex; i < items.length; i += 1) {
      if (predicate(items[i])) return i;
    }
    return -1;
  });
const findLastIndex =
  pick<
    <T>(items: readonly T[], predicate: (value: T) => boolean, fromIndex?: number) => number
  >("findLastIndex") ??
  ((items, predicate, fromIndex) => {
    let i = typeof fromIndex === "number" ? fromIndex : items.length - 1;
    for (; i >= 0; i -= 1) {
      if (predicate(items[i])) return i;
    }
    return -1;
  });
const getElementsInGroup = pick<
  (items: readonly ExcalidrawElement[], groupId: string) => ExcalidrawElement[]
>("getElementsInGroup");
const getSelectedElements =
  pick<
    (
      items: readonly ExcalidrawElement[],
      appState: AppState,
      opts?: { includeBoundTextElement?: boolean; includeElementsInFrames?: boolean },
    ) => ExcalidrawElement[]
  >("getSelectedElements") ??
  ((items, appState) => {
    // Runtime fallback: older Excalidraw bundles may not expose getSelectedElements.
    // Use appState.selectedElementIds to derive the active selection; ignore opts.
    const selected = appState.selectedElementIds ?? {};
    return items.filter((el) => Boolean((selected as Record<string, boolean>)[el.id]));
  });
const isFrameLikeElement =
  pick<(element: ExcalidrawElement) => boolean>("isFrameLikeElement") ??
  ((element) => element.type === "frame" || (element as { type?: string }).type === "magicframe");
const syncMovedIndices =
  pick<
    (elements: ExcalidrawElement[], targetMap: Map<string, ExcalidrawElement>) => ExcalidrawElement[]
  >("syncMovedIndices") ??
  ((elements) => elements);

const isOfTargetFrame = (element: ExcalidrawElement, frameId: string) => {
  return element.frameId === frameId || element.id === frameId;
};

const getIndicesToMove = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  elementsToBeMoved?: readonly ExcalidrawElement[],
) => {
  logZ("getIndicesToMove:start", {
    providedCount: elementsToBeMoved?.length ?? null,
    selectionCount: elements.length,
  });
  let selectedIndices: number[] = [];
  let deletedIndices: number[] = [];
  let includeDeletedIndex: number | null = null;
  let index = -1;

  const selectedElementIds = arrayToMap(
    elementsToBeMoved
      ? elementsToBeMoved
      : getSelectedElements(elements, appState, {
          includeBoundTextElement: true,
          includeElementsInFrames: true,
        }),
  );

  while (++index < elements.length) {
    const element = elements[index];
    if (selectedElementIds.get(element.id)) {
      if (deletedIndices.length) {
        selectedIndices = selectedIndices.concat(deletedIndices);
        deletedIndices = [];
      }
      selectedIndices.push(index);
      includeDeletedIndex = index + 1;
    } else if (element.isDeleted && includeDeletedIndex === index) {
      includeDeletedIndex = index + 1;
      deletedIndices.push(index);
    } else {
      deletedIndices = [];
    }
  }

  logZ("getIndicesToMove:end", {
    indices: selectedIndices,
    contiguousGroups: toContiguousGroups(selectedIndices),
  });
  return selectedIndices;
};

const toContiguousGroups = (array: number[]) => {
  let cursor = 0;
  return array.reduce<number[][]>((acc, value, idx) => {
    if (idx > 0 && array[idx - 1] !== value - 1) {
      cursor += 1;
    }
    (acc[cursor] || (acc[cursor] = [])).push(value);
    return acc;
  }, []);
};

const getTargetIndexAccountingForBinding = (
  nextElement: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
  direction: Direction,
) => {
  if ("containerId" in nextElement && nextElement.containerId) {
    const containerElement = elements.find((el) => el.id === nextElement.containerId);
    if (containerElement) {
      return direction === "left"
        ? Math.min(elements.indexOf(containerElement), elements.indexOf(nextElement))
        : Math.max(elements.indexOf(containerElement), elements.indexOf(nextElement));
    }
  } else {
    const boundElementId = nextElement.boundElements?.find((binding) => binding.type !== "arrow")?.id;
    if (boundElementId) {
      const boundElement = elements.find((el) => el.id === boundElementId);
      if (boundElement) {
        return direction === "left"
          ? Math.min(elements.indexOf(boundElement), elements.indexOf(nextElement))
          : Math.max(elements.indexOf(boundElement), elements.indexOf(nextElement));
      }
    }
  }
  return undefined;
};

const getContiguousFrameRangeElements = (
  allElements: readonly ExcalidrawElement[],
  frameId: string,
) => {
  let rangeStart = -1;
  let rangeEnd = -1;

  allElements.forEach((element, index) => {
    if (isOfTargetFrame(element, frameId)) {
      if (rangeStart === -1) {
        rangeStart = index;
      }
      rangeEnd = index;
    }
  });

  if (rangeStart === -1) return [] as ExcalidrawElement[];
  return allElements.slice(rangeStart, rangeEnd + 1) as ExcalidrawElement[];
};

const getTargetIndex = (
  appState: AppState,
  elements: readonly ExcalidrawElement[],
  boundaryIndex: number,
  direction: Direction,
  containingFrame: ExcalidrawElement["id"] | null,
) => {
  const sourceElement = elements[boundaryIndex];
  const indexFilter = (element: ExcalidrawElement) => {
    if (element.isDeleted) return false;
    if (containingFrame) return element.frameId === containingFrame;
    if (appState.editingGroupId) return element.groupIds.includes(appState.editingGroupId);
    return true;
  };

  const candidateIndex =
    direction === "left"
      ? findLastIndex(elements, (el: ExcalidrawElement) => indexFilter(el), Math.max(0, boundaryIndex - 1))
      : findIndex(elements, (el: ExcalidrawElement) => indexFilter(el), boundaryIndex + 1);

  const nextElement = elements[candidateIndex];
  if (!nextElement) return -1;

  if (appState.editingGroupId) {
    if (sourceElement?.groupIds.join("") === nextElement?.groupIds.join("")) {
      return getTargetIndexAccountingForBinding(nextElement, elements, direction) ?? candidateIndex;
    }
    if (!nextElement?.groupIds.includes(appState.editingGroupId)) {
      return -1;
    }
  }

  if (!containingFrame && (nextElement.frameId || isFrameLikeElement(nextElement))) {
    const frameElements = getContiguousFrameRangeElements(
      elements,
      nextElement.frameId || nextElement.id,
    );
    return direction === "left"
      ? elements.indexOf(frameElements[0])
      : elements.indexOf(frameElements[frameElements.length - 1]);
  }

  if (!nextElement.groupIds.length) {
    return getTargetIndexAccountingForBinding(nextElement, elements, direction) ?? candidateIndex;
  }

  const siblingGroupId = appState.editingGroupId
    ? nextElement.groupIds[nextElement.groupIds.indexOf(appState.editingGroupId) - 1]
    : nextElement.groupIds[nextElement.groupIds.length - 1];

  const elementsInSiblingGroup = getElementsInGroup(elements, siblingGroupId);
  if (elementsInSiblingGroup.length) {
    return direction === "left"
      ? elements.indexOf(elementsInSiblingGroup[0])
      : elements.indexOf(elementsInSiblingGroup[elementsInSiblingGroup.length - 1]);
  }

  return candidateIndex;
};

const getTargetElementsMap = (elements: readonly ExcalidrawElement[], indices: readonly number[]) => {
  return indices.reduce<ElementsMap>((acc, index) => {
    const element = elements[index];
    acc.set(element.id, element);
    return acc;
  }, new Map());
};

const shiftElementsByOne = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  direction: Direction,
): ExcalidrawElement[] => {
  logZ("shiftElementsByOne:start", {
    direction,
    total: elements.length,
  });
  const indicesToMove = getIndicesToMove(elements, appState);
  const targetElementsMap = getTargetElementsMap(elements, indicesToMove);
  let groupedIndices = toContiguousGroups(indicesToMove);

  if (direction === "right") {
    groupedIndices = groupedIndices.reverse();
  }

  const selectedFrames = new Set(
    indicesToMove.filter((idx) => isFrameLikeElement(elements[idx])).map((idx) => elements[idx].id),
  );

  let nextElements = elements as ExcalidrawElement[];

  groupedIndices.forEach((indices) => {
    const leadingIndex = indices[0];
    const trailingIndex = indices[indices.length - 1];
    const boundaryIndex = direction === "left" ? leadingIndex : trailingIndex;

    const containingFrame = indices.some((idx) => {
      const el = elements[idx];
      return el.frameId && selectedFrames.has(el.frameId);
    })
      ? null
      : elements[boundaryIndex]?.frameId;

    const targetIndex = getTargetIndex(appState, elements, boundaryIndex, direction, containingFrame ?? null);
    logZ("shiftElementsByOne:segment", {
      direction,
      indices,
      containingFrame,
      targetIndex,
    });
    if (targetIndex === -1 || boundaryIndex === targetIndex) {
      return;
    }

    const leadingElements = direction === "left" ? nextElements.slice(0, targetIndex) : nextElements.slice(0, leadingIndex);
    const targetElements = nextElements.slice(leadingIndex, trailingIndex + 1);
    const displacedElements =
      direction === "left"
        ? nextElements.slice(targetIndex, leadingIndex)
        : nextElements.slice(trailingIndex + 1, targetIndex + 1);
    const trailingElements = direction === "left"
      ? nextElements.slice(trailingIndex + 1)
      : nextElements.slice(targetIndex + 1);

    nextElements =
      direction === "left"
        ? [...leadingElements, ...targetElements, ...displacedElements, ...trailingElements]
        : [...leadingElements, ...displacedElements, ...targetElements, ...trailingElements];
  });

  syncMovedIndices(nextElements, targetElementsMap);
  logZ("shiftElementsByOne:end", {
    direction,
    movedCount: indicesToMove.length,
    resultLength: nextElements.length,
  });
  return nextElements;
};

const shiftElementsToEnd: ShiftFn = (elements, appState, direction, containingFrame, elementsToBeMoved) => {
  logZ("shiftElementsToEnd:start", {
    direction,
    total: elements.length,
    containingFrame,
    explicitMoveCount: elementsToBeMoved?.length ?? null,
  });
  const indicesToMove = getIndicesToMove(elements, appState, elementsToBeMoved);
  const targetElementsMap = getTargetElementsMap(elements, indicesToMove);
  const displacedElements: ExcalidrawElement[] = [];
  let leadingIndex: number;
  let trailingIndex: number;

  if (direction === "left") {
    if (containingFrame) {
      leadingIndex = findIndex(elements, (el: ExcalidrawElement) => isOfTargetFrame(el, containingFrame));
    } else if (appState.editingGroupId) {
      const groupElements = getElementsInGroup(elements, appState.editingGroupId);
      if (!groupElements.length) return elements.slice() as ExcalidrawElement[];
      leadingIndex = elements.indexOf(groupElements[0]);
    } else {
      leadingIndex = 0;
    }
    trailingIndex = indicesToMove[indicesToMove.length - 1];
  } else {
    if (containingFrame) {
      trailingIndex = findLastIndex(elements, (el: ExcalidrawElement) => isOfTargetFrame(el, containingFrame));
    } else if (appState.editingGroupId) {
      const groupElements = getElementsInGroup(elements, appState.editingGroupId);
      if (!groupElements.length) return elements.slice() as ExcalidrawElement[];
      trailingIndex = elements.indexOf(groupElements[groupElements.length - 1]);
    } else {
      trailingIndex = elements.length - 1;
    }
    leadingIndex = indicesToMove[0];
  }

  if (leadingIndex === -1) {
    leadingIndex = 0;
  }

  for (let idx = leadingIndex; idx < trailingIndex + 1; idx += 1) {
    if (!indicesToMove.includes(idx)) {
      displacedElements.push(elements[idx]);
    }
  }

  const targetElements = Array.from(targetElementsMap.values());
  const leadingElements = elements.slice(0, leadingIndex);
  const trailingElements = elements.slice(trailingIndex + 1);

  const nextElements =
    direction === "left"
      ? [...leadingElements, ...targetElements, ...displacedElements, ...trailingElements]
      : [...leadingElements, ...displacedElements, ...targetElements, ...trailingElements];

  syncMovedIndices(nextElements, targetElementsMap);
  logZ("shiftElementsToEnd:end", {
    direction,
    containingFrame,
    movedCount: indicesToMove.length,
    resultLength: nextElements.length,
  });
  return nextElements;
};

const shiftElementsAccountingForFrames = (
  allElements: readonly ExcalidrawElement[],
  appState: AppState,
  direction: Direction,
  shiftFunction: ShiftFn,
) => {
  logZ("shiftElementsAccountingForFrames:start", {
    direction,
    total: allElements.length,
  });
  const elementsToMove = arrayToMap(
    getSelectedElements(allElements, appState, {
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    }),
  );

  const frameAwareContiguousElementsToMove: {
    regularElements: ExcalidrawElement[];
    frameChildren: FrameChildrenMap;
  } = { regularElements: [], frameChildren: new Map() };

  const fullySelectedFrames = new Set<string>();
  for (const element of allElements) {
    if (elementsToMove.has(element.id) && isFrameLikeElement(element)) {
      fullySelectedFrames.add(element.id);
    }
  }

  for (const element of allElements) {
    if (elementsToMove.has(element.id)) {
      if (isFrameLikeElement(element) || (element.frameId && fullySelectedFrames.has(element.frameId))) {
        frameAwareContiguousElementsToMove.regularElements.push(element);
      } else if (!element.frameId) {
        frameAwareContiguousElementsToMove.regularElements.push(element);
      } else {
        const frameChildren = frameAwareContiguousElementsToMove.frameChildren.get(element.frameId) || [];
        frameChildren.push(element);
        frameAwareContiguousElementsToMove.frameChildren.set(element.frameId, frameChildren);
      }
    }
  }

  let nextElements = allElements as ExcalidrawElement[];
  const frameChildrenSets = Array.from(frameAwareContiguousElementsToMove.frameChildren.entries());
  for (const [frameId, children] of frameChildrenSets) {
    nextElements = shiftFunction(allElements, appState, direction, frameId, children);
  }

  return shiftFunction(
    nextElements,
    appState,
    direction,
    null,
    frameAwareContiguousElementsToMove.regularElements,
  );
};

export const moveOneLeft = (allElements: readonly ExcalidrawElement[], appState: AppState) => {
  return shiftElementsByOne(allElements, appState, "left");
};

export const moveOneRight = (allElements: readonly ExcalidrawElement[], appState: AppState) => {
  return shiftElementsByOne(allElements, appState, "right");
};

export const moveAllLeft = (allElements: readonly ExcalidrawElement[], appState: AppState) => {
  return shiftElementsAccountingForFrames(allElements, appState, "left", shiftElementsToEnd);
};

export const moveAllRight = (allElements: readonly ExcalidrawElement[], appState: AppState) => {
  return shiftElementsAccountingForFrames(allElements, appState, "right", shiftElementsToEnd);
};
