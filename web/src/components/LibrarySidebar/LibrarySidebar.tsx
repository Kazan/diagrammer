import { useState, useCallback, useEffect } from "react";
import { XIcon, SearchIcon } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibrarySidebarConfig, LibraryCategory } from "./types";
import { loadAllLibraries } from "./loader";
import { useLibrarySearch } from "./useLibrarySearch";
import { insertLibraryItem } from "./insertLibraryItem";
import { LibrarySection } from "./LibrarySection";
import { LibraryTrigger } from "./LibraryTrigger";

interface LibrarySidebarProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  config?: LibrarySidebarConfig;
}

export function LibrarySidebar({
  excalidrawAPI,
  config = {},
}: LibrarySidebarProps) {
  const { columns = 4, itemSize = 64 } = config;

  const [isOpen, setIsOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibraryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Handle item insertion
  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (!excalidrawAPI) return;
      insertLibraryItem(excalidrawAPI, item.elements);
    },
    [excalidrawAPI]
  );

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Close sidebar
  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    clearSearch();
  }, [clearSearch]);

  // Calculate panel width based on grid configuration
  const panelWidth = columns * itemSize + (columns - 1) * 8 + 32; // grid + gaps + padding

  return (
    <>
      {/* Edge trigger button */}
      <LibraryTrigger onClick={toggleSidebar} isOpen={isOpen} />

      {/* Sidebar panel */}
      <div
        className={cn(
          "fixed right-0 z-[var(--z-chrome)]",
          "flex flex-col",
          "bg-[var(--flyout-bg)] border-l border-[var(--flyout-border)]",
          "transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          top: "var(--tool-rail-top)",
          height: "calc(100vh - var(--tool-rail-top))",
          width: panelWidth,
          ["--library-panel-width" as string]: `${panelWidth}px`,
        }}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--flyout-item-border)]">
          <h2 className="text-base font-semibold text-[var(--flyout-text)]">
            Library
          </h2>
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close library sidebar"
            className={cn(
              "flex items-center justify-center size-8 rounded-md",
              "text-[var(--muted-text)] hover:text-[var(--flyout-text)]",
              "hover:bg-[var(--tile-hover-bg)]",
              "transition-colors duration-100",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]"
            )}
          >
            <XIcon className="size-5" />
          </button>
        </div>

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
          ) : filteredLibraries.length === 0 ? (
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
              {filteredLibraries.map((category, index) => (
                <LibrarySection
                  key={category.id}
                  category={category}
                  columns={columns}
                  itemSize={itemSize}
                  onItemClick={handleItemClick}
                  forceExpanded={autoExpandedIds.has(category.id)}
                  defaultOpen={index === 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
