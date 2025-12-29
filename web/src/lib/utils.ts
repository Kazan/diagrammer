import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses a color string and returns RGB values.
 * Supports hex (#rgb, #rrggbb), rgb(), rgba(), and named colors.
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Handle transparent
  if (color === "transparent") {
    return { r: 255, g: 255, b: 255, a: 0 };
  }

  // Handle hex colors
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  // Handle rgb/rgba
  const rgbaMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

/**
 * Calculates the relative luminance of a color.
 * Uses the sRGB luminance formula from WCAG 2.0.
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determines if a color should use dark text/icon for contrast.
 * Returns true for light colors, false for dark colors.
 * For transparent/semi-transparent colors, assumes a light background.
 */
export function shouldUseDarkForeground(color: string): boolean {
  const parsed = parseColor(color);
  if (!parsed) return false; // Default to light foreground for unparsable colors

  const { r, g, b, a } = parsed;

  // For very transparent colors (alpha < 0.5), assume light background
  if (a < 0.5) return true;

  // Blend with white background for semi-transparent colors
  const blendedR = r * a + 255 * (1 - a);
  const blendedG = g * a + 255 * (1 - a);
  const blendedB = b * a + 255 * (1 - a);

  const luminance = getLuminance(blendedR, blendedG, blendedB);

  // Use 0.5 as threshold (higher luminance = lighter color = needs dark foreground)
  return luminance > 0.5;
}

/**
 * Centers bound text elements within their container shapes.
 * This should be called after text dimensions change (e.g., font family, font size, alignment)
 * to ensure text stays centered in its container.
 *
 * @param elements - The scene elements (typically after restoreElements has recalculated dimensions)
 * @param affectedTextIds - Set of text element IDs that were modified
 * @returns Updated elements with text positions recentered in their containers
 */
export function recenterBoundTextInContainers(
  elements: ExcalidrawElement[],
  affectedTextIds: Set<string>,
): ExcalidrawElement[] {
  const elementsMap = new Map(elements.map((el) => [el.id, el]));

  return elements.map((el) => {
    // Only process text elements that were affected
    if (el.type !== "text" || !affectedTextIds.has(el.id)) return el;

    // Check if this text element has a container
    if (!("containerId" in el) || !el.containerId) return el;

    const container = elementsMap.get(el.containerId);
    if (!container || !("width" in container && "height" in container)) return el;

    // Calculate centered position within the container
    const newX = container.x + (container.width - el.width) / 2;
    const newY = container.y + (container.height - el.height) / 2;

    return {
      ...el,
      x: newX,
      y: newY,
    } as ExcalidrawElement;
  });
}
