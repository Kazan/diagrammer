import { useCallback, useEffect, useState } from "react";

const UI_SCALE_KEY = "diagrammer.uiScale";
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.1;

/**
 * Hook to manage UI element scaling.
 * Persists the scale preference to localStorage and applies it via CSS custom property.
 */
export function useUiScale() {
  const [scale, setScale] = useState(() => {
    try {
      const stored = localStorage.getItem(UI_SCALE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) {
          return parsed;
        }
      }
    } catch (_err) {
      // ignore localStorage errors
    }
    return DEFAULT_SCALE;
  });

  // Apply the scale to the document root as a CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    try {
      localStorage.setItem(UI_SCALE_KEY, String(scale));
    } catch (_err) {
      // ignore localStorage errors
    }
  }, [scale]);

  const handleScaleUp = useCallback(() => {
    setScale((prev) => Math.min(MAX_SCALE, Math.round((prev + SCALE_STEP) * 10) / 10));
  }, []);

  const handleScaleDown = useCallback(() => {
    setScale((prev) => Math.max(MIN_SCALE, Math.round((prev - SCALE_STEP) * 10) / 10));
  }, []);

  const handleReset = useCallback(() => {
    setScale(DEFAULT_SCALE);
  }, []);

  return {
    scale,
    handleScaleUp,
    handleScaleDown,
    handleReset,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  } as const;
}
