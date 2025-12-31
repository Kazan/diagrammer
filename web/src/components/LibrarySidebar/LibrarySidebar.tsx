import { useState, useCallback, useEffect } from "react";
import { XIcon, SearchIcon } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibrarySidebarConfig, LibraryCategory } from "./types";
import { loadAllLibraries } from "./loader";
import { useLibrarySearch } from "./useLibrarySearch";
import { insertLibraryItem } from "./insertLibraryItem";
import { LibrarySection } from "./LibrarySection";
import { LibraryTrigger } from "./LibraryTrigger";
import { PersonalLibrarySection } from "./PersonalLibrarySection";
import { usePersonalLibrary } from "./usePersonalLibrary";

interface LibrarySidebarProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  config?: LibrarySidebarConfig;
  /** External signal to close the sidebar */
  closeSignal?: number;
}

export function LibrarySidebar({
  excalidrawAPI,
  config = {},
  closeSignal,
}: LibrarySidebarProps) {
  const { columns = 4, itemSize = 64 } = config;

  const [isOpen, setIsOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibraryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastExpandedId, setLastExpandedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("diagrammer.lastLibrarySection");
    } catch {
      return null;
    }
  });

  // Personal library hook
  const personalLibrary = usePersonalLibrary();

  // Track selected elements from the canvas
  const [selectedElements, setSelectedElements] = useState<readonly ExcalidrawElement[]>([]);

  // Update selected elements when sidebar opens or API changes
  useEffect(() => {
    if (!excalidrawAPI || !isOpen) {
      setSelectedElements([]);
      return;
    }

    // Get initial selection
    const appState = excalidrawAPI.getAppState();
    const elements = excalidrawAPI.getSceneElements();
    const selected = elements.filter(
      (el) => appState.selectedElementIds[el.id] && !el.isDeleted
    );
    setSelectedElements(selected);

    // Subscribe to state changes to track selection
    // We re-check on each re-render cycle when open
    const interval = setInterval(() => {
      if (!excalidrawAPI) return;
      const currentAppState = excalidrawAPI.getAppState();
      const currentElements = excalidrawAPI.getSceneElements();
      const currentSelected = currentElements.filter(
        (el) => currentAppState.selectedElementIds[el.id] && !el.isDeleted
      );
      setSelectedElements(currentSelected);
    }, 200);

    return () => clearInterval(interval);
  }, [excalidrawAPI, isOpen]);

  // Persist last expanded section
  const handleSectionToggle = useCallback((categoryId: string, isExpanded: boolean) => {
    if (isExpanded) {
      setLastExpandedId(categoryId);
      try {
        localStorage.setItem("diagrammer.lastLibrarySection", categoryId);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  // Load libraries lazily when sidebar first opens
  useEffect(() => {
    if (isOpen && libraries.length === 0 && !isLoading && !loadError) {
      setIsLoading(true);
      loadAllLibraries()
        .then((loaded: LibraryCategory[]) => {
          setLibraries(loaded);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          console.error("[LibrarySidebar] Failed to load:", err);
          setLoadError("Failed to load libraries");
          setIsLoading(false);
        });
    }
  }, [isOpen, libraries.length, isLoading, loadError]);

  // Search filtering
  const {
    query,
    setQuery,
    filteredLibraries,
    autoExpandedIds,
    isSearching,
    clearSearch,
  } = useLibrarySearch(libraries);

  // Close sidebar when external signal changes
  useEffect(() => {
    if (closeSignal !== undefined && closeSignal > 0 && isOpen) {
      setIsOpen(false);
      clearSearch();
    }
  }, [closeSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle item insertion
  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (!excalidrawAPI) return;
      insertLibraryItem(excalidrawAPI, item.elements);
    },
    [excalidrawAPI]
  );

  // Handle adding selection to personal library
  const handleAddToPersonalLibrary = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (elements.length === 0) return;
      personalLibrary.addItem(elements);

      // Deselect elements on canvas so the preview disappears
      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          appState: { selectedElementIds: {} },
        });
      }
      setSelectedElements([]);
    },
    [personalLibrary, excalidrawAPI]
  );

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Calculate panel width based on grid configuration
  const panelWidth = columns * itemSize + (columns - 1) * 8 + 32; // grid + gaps + padding

  return (
    <>
      {/* Edge trigger button */}
      <LibraryTrigger onClick={toggleSidebar} isOpen={isOpen} />

      {/* Sidebar panel - no CSS transform scaling, dimensions adjusted for UI scale */}
      <div
        data-slot="library-sidebar"
        className={cn(
          "fixed right-0 z-[var(--z-chrome)]",
          "flex flex-col",
          "bg-[var(--flyout-bg)] border border-r-0 border-[var(--flyout-border)] rounded-l-2xl",
          "transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          top: 76,
          bottom: 76,
          width: panelWidth,
          ["--library-panel-width" as string]: `${panelWidth}px`,
        }}
        aria-hidden={!isOpen}
      >
        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--flyout-item-border)]">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--muted-text)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items..."
              className={cn(
                "w-full h-9 pl-9 pr-3 rounded-lg",
                "border border-[var(--tile-border)]",
                "bg-[var(--tile-bg)] text-[var(--flyout-text)]",
                "placeholder:text-[var(--muted-text)]",
                "focus:outline-2 focus:outline-[var(--accent-color)]",
                "transition-colors duration-100"
              )}
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2",
                  "flex items-center justify-center size-5 rounded",
                  "text-[var(--muted-text)] hover:text-[var(--flyout-text)]",
                  "hover:bg-[var(--tile-hover-bg)]",
                  "transition-colors duration-100"
                )}
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-[var(--muted-text)] text-sm">
                Loading libraries...
              </div>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-red-500 text-sm">{loadError}</div>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  setLibraries([]);
                }}
                className="mt-2 text-xs text-[var(--accent-color)] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filteredLibraries.length === 0 && personalLibrary.isEmpty && selectedElements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-[var(--muted-text)] text-sm">
                {isSearching ? "No items found" : "No libraries available"}
              </div>
              {isSearching && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="mt-2 text-xs text-[var(--accent-color)] hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Personal Library section - always at top */}
              <PersonalLibrarySection
                items={personalLibrary.items}
                columns={columns}
                itemSize={itemSize}
                onItemClick={handleItemClick}
                onAddItem={handleAddToPersonalLibrary}
                onRemoveItem={personalLibrary.removeItem}
                selectedElements={selectedElements}
                defaultOpen={lastExpandedId === "personal" || selectedElements.length > 0}
                onToggle={(isExpanded) => handleSectionToggle("personal", isExpanded)}
              />
              {/* Other library sections */}
              {filteredLibraries.map((category) => (
                <LibrarySection
                  key={category.id}
                  category={category}
                  columns={columns}
                  itemSize={itemSize}
                  onItemClick={handleItemClick}
                  forceExpanded={autoExpandedIds.has(category.id)}
                  defaultOpen={category.id === lastExpandedId}
                  onToggle={(isExpanded) => handleSectionToggle(category.id, isExpanded)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
