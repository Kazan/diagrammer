import { useCallback, useEffect, useState } from "react";

const FOCUS_MODE_KEY = "diagrammer.focusMode";

/**
 * Hook to manage focus mode (hide all UI except toggle button).
 * Persists the preference to localStorage and applies it via data attribute on document.
 */
export function useFocusMode() {
  const [isFocusMode, setIsFocusMode] = useState(() => {
    try {
      const stored = localStorage.getItem(FOCUS_MODE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  // Apply focus mode data attribute to document element
  useEffect(() => {
    if (isFocusMode) {
      document.documentElement.setAttribute("data-focus-mode", "true");
    } else {
      document.documentElement.removeAttribute("data-focus-mode");
    }

    try {
      localStorage.setItem(FOCUS_MODE_KEY, String(isFocusMode));
    } catch {
      // Ignore localStorage errors
    }
  }, [isFocusMode]);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  const enableFocusMode = useCallback(() => {
    setIsFocusMode(true);
  }, []);

  const disableFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  return {
    isFocusMode,
    toggleFocusMode,
    enableFocusMode,
    disableFocusMode,
  } as const;
}
