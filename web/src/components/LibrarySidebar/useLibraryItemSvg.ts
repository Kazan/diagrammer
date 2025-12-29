import { useState, useEffect, useTransition } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

// Module-level cache for SVG strings keyed by item ID
const svgCache = new Map<string, string>();

/**
 * Hook to render library item elements as an SVG string.
 * Uses module-level caching and React transitions for smooth loading.
 */
export function useLibraryItemSvg(
  itemId: string,
  elements: readonly ExcalidrawElement[]
): { svg: string | null; isPending: boolean } {
  const [svg, setSvg] = useState<string | null>(() => svgCache.get(itemId) ?? null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Return cached value if available
    if (svgCache.has(itemId)) {
      setSvg(svgCache.get(itemId)!);
      return;
    }

    // Skip if no elements
    if (elements.length === 0) {
      setSvg(null);
      return;
    }

    let cancelled = false;

    const generateSvg = async () => {
      try {
        const svgElement = await exportToSvg({
          elements: elements as ExcalidrawElement[],
          appState: {
            exportBackground: false,
            viewBackgroundColor: "transparent",
          },
          files: null,
        });

        if (cancelled) return;

        const svgString = svgElement.outerHTML;
        svgCache.set(itemId, svgString);

        startTransition(() => {
          setSvg(svgString);
        });
      } catch (err) {
        console.error(`Failed to generate SVG for item ${itemId}:`, err);
      }
    };

    generateSvg();

    return () => {
      cancelled = true;
    };
  }, [itemId, elements]);

  return { svg, isPending };
}

/**
 * Preloads SVG for multiple library items.
 * Useful for batch loading when sidebar opens.
 */
export async function preloadLibraryItemSvgs(
  items: Array<{ id: string; elements: readonly ExcalidrawElement[] }>
): Promise<void> {
  const uncachedItems = items.filter((item) => !svgCache.has(item.id));

  await Promise.all(
    uncachedItems.map(async (item) => {
      if (item.elements.length === 0) return;

      try {
        const svgElement = await exportToSvg({
          elements: item.elements as ExcalidrawElement[],
          appState: {
            exportBackground: false,
            viewBackgroundColor: "transparent",
          },
          files: null,
        });

        svgCache.set(item.id, svgElement.outerHTML);
      } catch (err) {
        console.error(`Failed to preload SVG for item ${item.id}:`, err);
      }
    })
  );
}

/**
 * Clears the SVG cache (useful for testing or memory management).
 */
export function clearSvgCache(): void {
  svgCache.clear();
}
