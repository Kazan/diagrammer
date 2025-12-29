import { useMemo, useState, useCallback } from "react";
import type { LibraryCategory, LibraryItem } from "./types";

interface UseLibrarySearchResult {
  /** Current search query */
  query: string;
  /** Set search query */
  setQuery: (query: string) => void;
  /** Filtered libraries (categories with matching items only) */
  filteredLibraries: LibraryCategory[];
  /** Set of library IDs that should auto-expand due to search matches */
  autoExpandedIds: Set<string>;
  /** Whether search is active */
  isSearching: boolean;
  /** Clear search */
  clearSearch: () => void;
}

/**
 * Hook to filter library items by search query.
 * When searching, auto-expands sections with matching items.
 */
export function useLibrarySearch(
  libraries: LibraryCategory[]
): UseLibrarySearchResult {
  const [query, setQuery] = useState("");

  const clearSearch = useCallback(() => {
    setQuery("");
  }, []);

  const { filteredLibraries, autoExpandedIds, isSearching } = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return {
        filteredLibraries: libraries,
        autoExpandedIds: new Set<string>(),
        isSearching: false,
      };
    }

    const expandedIds = new Set<string>();
    const filtered: LibraryCategory[] = [];

    for (const category of libraries) {
      const matchingItems = category.items.filter((item) =>
        item.name.toLowerCase().includes(trimmedQuery)
      );

      if (matchingItems.length > 0) {
        filtered.push({
          ...category,
          items: matchingItems,
        });
        expandedIds.add(category.id);
      }
    }

    return {
      filteredLibraries: filtered,
      autoExpandedIds: expandedIds,
      isSearching: true,
    };
  }, [libraries, query]);

  return {
    query,
    setQuery,
    filteredLibraries,
    autoExpandedIds,
    isSearching,
    clearSearch,
  };
}
