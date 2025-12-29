import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { NativeBridge } from "@/native-bridge";
import type { LibraryCategory, LibraryItem, RawLibraryFile, RawLibraryItem } from "./types";

// Extend window with NativeBridge (from native-bridge.ts)
declare global {
  interface Window {
    NativeBridge?: NativeBridge;
  }
}

/**
 * Metadata about an available library (no content loaded yet).
 */
export interface LibraryMeta {
  /** Unique identifier derived from filename */
  id: string;
  /** Display name (Title Case from filename) */
  name: string;
  /** URL to fetch the library content */
  url: string;
  /** Asset path for native apps (relative to assets folder) */
  assetPath: string;
}

/**
 * Auto-discover library files at build time.
 * Only captures paths/URLs, content is NOT loaded.
 * Files are in public/libs/ and served at /libs/ at runtime.
 */
const libraryAssets = import.meta.glob<string>(
  "/libs/*.excalidrawlib",
  { query: "?url", import: "default", eager: true }
);

/**
 * Extracts display name from filename.
 * e.g., "aws-architecture-icons" -> "AWS Architecture Icons"
 */
function extractLibraryName(filename: string): string {
  const basename = filename.replace(".excalidrawlib", "");
  return basename
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extracts ID from filename.
 */
function extractLibraryId(filename: string): string {
  return filename.replace(".excalidrawlib", "");
}

/**
 * Build manifest of available libraries from discovered files.
 * This runs at module load time but only captures metadata, not content.
 */
function buildLibraryManifest(): LibraryMeta[] {
  const manifest: LibraryMeta[] = [];

  for (const [path, resolvedUrl] of Object.entries(libraryAssets)) {
    const filename = path.split("/").pop() ?? "";
    if (!filename) continue;

    // Vite serves public assets from root, so strip the /public prefix
    const servedUrl = resolvedUrl.replace(/^\/public/, "");

    manifest.push({
      id: extractLibraryId(filename),
      name: extractLibraryName(filename),
      url: servedUrl,
      assetPath: `libs/${filename}`,
    });
  }

  console.log(
    "[LibraryLoader] Manifest:",
    manifest.map((m) => m.name)
  );

  return manifest;
}

/** Cached manifest of available libraries */
let manifestCache: LibraryMeta[] | null = null;

/**
 * Returns metadata for all available libraries.
 * This is synchronous and doesn't load any content.
 */
export function getLibraryManifest(): LibraryMeta[] {
  if (manifestCache === null) {
    manifestCache = buildLibraryManifest();
  }
  return manifestCache;
}

/**
 * Exposes the manifest for native bridge consumption.
 * Android can read this to know what libraries are available and their asset paths.
 */
export function getLibraryManifestForNative(): Array<{ id: string; name: string; assetPath: string }> {
  return getLibraryManifest().map(({ id, name, assetPath }) => ({
    id,
    name,
    assetPath,
  }));
}

// ============================================================================
// Content Loading (Lazy)
// ============================================================================

/** Cache for loaded library content */
const contentCache = new Map<string, LibraryCategory>();

/** In-flight fetch promises to avoid duplicate requests */
const fetchInFlight = new Map<string, Promise<LibraryCategory | null>>();

/**
 * Extracts a display name from library item elements.
 */
function extractItemName(
  elements: readonly ExcalidrawElement[],
  index: number
): string {
  for (const el of elements) {
    if (el.type === "text" && "text" in el) {
      const text = (el as ExcalidrawElement & { text: string }).text?.trim();
      if (text) {
        return text.length > 32 ? text.slice(0, 29) + "…" : text;
      }
    }
  }
  return `Item ${index + 1}`;
}

/**
 * Generates a unique ID for a library item.
 */
function generateItemId(libraryId: string, index: number): string {
  return `${libraryId}-item-${index}`;
}

/**
 * Type guard for new format library items.
 */
function isRawLibraryItem(
  item: ExcalidrawElement[] | RawLibraryItem
): item is RawLibraryItem {
  return (
    !Array.isArray(item) &&
    typeof item === "object" &&
    "elements" in item &&
    Array.isArray(item.elements)
  );
}

/**
 * Normalizes a raw library item into our internal structure.
 */
function normalizeLibraryItem(
  rawItem: ExcalidrawElement[] | RawLibraryItem,
  libraryId: string,
  index: number
): LibraryItem {
  if (isRawLibraryItem(rawItem)) {
    return {
      id: rawItem.id ?? generateItemId(libraryId, index),
      name: rawItem.name ?? extractItemName(rawItem.elements, index),
      elements: rawItem.elements,
      libraryId,
    };
  }

  return {
    id: generateItemId(libraryId, index),
    name: extractItemName(rawItem, index),
    elements: rawItem,
    libraryId,
  };
}

/**
 * Parses raw library JSON into a LibraryCategory.
 */
function parseLibraryContent(
  id: string,
  name: string,
  content: string
): LibraryCategory | null {
  try {
    const raw: RawLibraryFile = JSON.parse(content);

    if (raw.type !== "excalidrawlib") {
      console.warn(`[LibraryLoader] Invalid format for ${name}`);
      return null;
    }

    const rawItems = raw.library ?? raw.libraryItems;

    if (!Array.isArray(rawItems)) {
      console.warn(`[LibraryLoader] No items in ${name}`);
      return null;
    }

    const items: LibraryItem[] = rawItems
      .map((rawItem, index) => normalizeLibraryItem(rawItem, id, index))
      .filter((item) => item.elements.length > 0);

    console.log(
      `[LibraryLoader] Loaded ${name}: ${rawItems.length} -> ${items.length} items`
    );

    return { id, name, items };
  } catch (err) {
    console.error(`[LibraryLoader] Parse failed for ${name}:`, err);
    return null;
  }
}

/**
 * Fetches and parses a library by its metadata.
 * Returns cached content if already loaded.
 */
export async function loadLibrary(meta: LibraryMeta): Promise<LibraryCategory | null> {
  // Return cached
  if (contentCache.has(meta.id)) {
    return contentCache.get(meta.id)!;
  }

  // Return in-flight promise if already fetching
  if (fetchInFlight.has(meta.id)) {
    return fetchInFlight.get(meta.id)!;
  }

  // Start fetch
  const fetchPromise = (async () => {
    try {
      // Check if native bridge provides content loader
      if (window.NativeBridge?.loadLibraryAsset) {
        const content = await window.NativeBridge.loadLibraryAsset(meta.assetPath);
        if (content) {
          const category = parseLibraryContent(meta.id, meta.name, content);
          if (category) {
            contentCache.set(meta.id, category);
          }
          return category;
        }
      }

      // Web fallback: fetch from URL
      const response = await fetch(meta.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();
      const category = parseLibraryContent(meta.id, meta.name, content);

      if (category) {
        contentCache.set(meta.id, category);
      }

      return category;
    } catch (err) {
      console.error(`[LibraryLoader] Failed to load ${meta.name}:`, err);
      return null;
    } finally {
      fetchInFlight.delete(meta.id);
    }
  })();

  fetchInFlight.set(meta.id, fetchPromise);
  return fetchPromise;
}

/**
 * Checks if a library's content is already loaded.
 */
export function isLibraryLoaded(libraryId: string): boolean {
  return contentCache.has(libraryId);
}

/**
 * Gets loaded library content (or null if not loaded).
 */
export function getLoadedLibrary(libraryId: string): LibraryCategory | null {
  return contentCache.get(libraryId) ?? null;
}

/**
 * Clears all caches (useful for testing).
 */
export function clearLibraryCache(): void {
  manifestCache = null;
  contentCache.clear();
  fetchInFlight.clear();
}

/**
 * Loads all libraries. Returns array of successfully loaded categories.
 */
export async function loadAllLibraries(): Promise<LibraryCategory[]> {
  const manifest = getLibraryManifest();
  const results = await Promise.all(manifest.map(loadLibrary));
  return results.filter((lib): lib is LibraryCategory => lib !== null);
}
