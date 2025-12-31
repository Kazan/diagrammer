import { useState, useCallback, useEffect } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LibraryItem } from "./types";

const STORAGE_KEY = "diagrammer.personalLibrary";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Create a fingerprint for an element based on its visual properties.
 * Ignores IDs, timestamps, and position (we normalize position).
 */
function elementFingerprint(el: ExcalidrawElement): string {
  // Extract relevant visual properties (exclude id, seed, version, versionNonce, updated, etc.)
  const props = {
    type: el.type,
    width: Math.round(el.width),
    height: Math.round(el.height),
    angle: el.angle,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    fillStyle: el.fillStyle,
    strokeWidth: el.strokeWidth,
    strokeStyle: el.strokeStyle,
    roughness: el.roughness,
    opacity: el.opacity,
    // Type-specific properties
    ...(el.type === "text" && { text: (el as { text?: string }).text, fontSize: (el as { fontSize?: number }).fontSize }),
    ...(el.type === "line" || el.type === "arrow" ? { points: (el as { points?: readonly (readonly [number, number])[] }).points } : {}),
  };
  return JSON.stringify(props);
}

/**
 * Create a fingerprint for a group of elements.
 * Normalizes positions relative to the bounding box origin.
 */
function elementsFingerprint(elements: readonly ExcalidrawElement[]): string {
  if (elements.length === 0) return "";

  // Find bounding box to normalize positions
  const minX = Math.min(...elements.map((el) => el.x));
  const minY = Math.min(...elements.map((el) => el.y));

  // Create fingerprints with normalized positions, sorted for consistency
  const fingerprints = elements
    .map((el) => {
      const relX = Math.round(el.x - minX);
      const relY = Math.round(el.y - minY);
      return `${relX},${relY}:${elementFingerprint(el)}`;
    })
    .sort();

  return fingerprints.join("|");
}

/**
 * Group elements together so they act as one unit when reinserted.
 * If already a single element or already grouped, returns as-is.
 */
function groupElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  if (elements.length === 0) return [];
  if (elements.length === 1) return [...elements] as ExcalidrawElement[];

  // Check if all elements already share the same groupId
  const existingGroupIds = elements
    .flatMap((el) => el.groupIds || [])
    .filter((id, i, arr) => arr.indexOf(id) === i);

  // If there's already a common group that contains all elements, no need to add another
  const allShareGroup = existingGroupIds.some((gid) =>
    elements.every((el) => el.groupIds?.includes(gid))
  );

  if (allShareGroup) {
    return [...elements] as ExcalidrawElement[];
  }

  // Create a new group ID and add it to all elements
  const newGroupId = randomId();
  return elements.map((el) => ({
    ...el,
    groupIds: [...(el.groupIds || []), newGroupId],
  })) as ExcalidrawElement[];
}

/**
 * Hook to manage the personal library stored in localStorage.
 */
export function usePersonalLibrary() {
  const [items, setItems] = useState<LibraryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as LibraryItem[];
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  // Persist to localStorage whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage errors
    }
  }, [items]);

  /**
   * Check if elements already exist in the library (by visual fingerprint).
   */
  const hasItem = useCallback(
    (elements: readonly ExcalidrawElement[]): boolean => {
      if (elements.length === 0) return false;
      const fingerprint = elementsFingerprint(elements);
      return items.some((item) => elementsFingerprint(item.elements) === fingerprint);
    },
    [items]
  );

  /**
   * Find the ID of a matching item in the library (by visual fingerprint).
   * Returns null if no match found.
   */
  const findMatchingItemId = useCallback(
    (elements: readonly ExcalidrawElement[]): string | null => {
      if (elements.length === 0) return null;
      const fingerprint = elementsFingerprint(elements);
      const match = items.find((item) => elementsFingerprint(item.elements) === fingerprint);
      return match?.id ?? null;
    },
    [items]
  );

  /**
   * Add elements to the library. Returns false if duplicate detected.
   */
  const addItem = useCallback(
    (elements: readonly ExcalidrawElement[]): boolean => {
      if (elements.length === 0) return false;

      const fingerprint = elementsFingerprint(elements);

      // Check for duplicate
      const isDuplicate = items.some(
        (item) => elementsFingerprint(item.elements) === fingerprint
      );
      if (isDuplicate) {
        return false;
      }

      const id = `personal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Try to extract a name from text elements
      const textEl = elements.find((el) => el.type === "text") as { text?: string } | undefined;
      const baseName = textEl?.text?.slice(0, 30);

      // Group elements so they come as one unit when reinserted
      const groupedElements = groupElements(elements);

      setItems((prev) => {
        const name = baseName || `Item ${prev.length + 1}`;
        const newItem: LibraryItem = {
          id,
          name,
          elements: groupedElements,
          libraryId: "personal",
        };
        return [newItem, ...prev];
      });

      return true;
    },
    [items]
  );

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    addItem,
    removeItem,
    clearAll,
    hasItem,
    findMatchingItemId,
    isEmpty: items.length === 0,
  };
}
