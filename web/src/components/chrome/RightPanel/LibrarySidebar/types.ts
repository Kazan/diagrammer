import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/**
 * A single item from an Excalidraw library.
 */
export interface LibraryItem {
  /** Unique identifier for this library item */
  id: string;
  /** Display name extracted from text elements or fallback "Item N" */
  name: string;
  /** The elements that compose this library item */
  elements: readonly ExcalidrawElement[];
  /** Source library category */
  libraryId: string;
}

/**
 * A category/library that groups multiple items.
 */
export interface LibraryCategory {
  /** Unique identifier (derived from filename or source) */
  id: string;
  /** Display name for the library */
  name: string;
  /** Items belonging to this library */
  items: LibraryItem[];
}

/**
 * Configuration options for the LibrarySidebar component.
 */
export interface LibrarySidebarConfig {
  /** Number of columns in the grid (default: 5) */
  columns?: number;
  /** Size of each item thumbnail in pixels (default: 64) */
  itemSize?: number;
}

/**
 * Raw library data format as found in .excalidrawlib files.
 * Library items can be either arrays of elements (old format)
 * or objects with id, elements, name, etc. (new format).
 *
 * Supports two key names:
 * - `library` (older format)
 * - `libraryItems` (newer format)
 */
export interface RawLibraryFile {
  type: "excalidrawlib";
  version: number;
  source?: string;
  /** Older format key */
  library?: Array<ExcalidrawElement[] | RawLibraryItem>;
  /** Newer format key */
  libraryItems?: Array<ExcalidrawElement[] | RawLibraryItem>;
}

/**
 * New format library item with metadata.
 */
export interface RawLibraryItem {
  id?: string;
  name?: string;
  status?: "published" | "unpublished";
  elements: ExcalidrawElement[];
  created?: number;
}
