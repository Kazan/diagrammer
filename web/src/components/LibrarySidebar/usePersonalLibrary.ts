import { useState, useCallback, useEffect } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LibraryItem } from "./types";

const STORAGE_KEY = "diagrammer.personalLibrary";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
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

  const addItem = useCallback((elements: readonly ExcalidrawElement[]) => {
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
  }, []);

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
    isEmpty: items.length === 0,
  };
}
