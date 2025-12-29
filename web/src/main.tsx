import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

/**
 * Detect if the app is running on an e-ink device.
 * Known e-ink device patterns:
 * - Boox devices (user agent contains "BOOX")
 * - Onyx devices (user agent contains "ONYX")
 * - reMarkable (user agent contains "reMarkable")
 * - Kindle (user agent contains "Kindle" or "Silk")
 * - Kobo devices (user agent contains "Kobo")
 * - PocketBook (user agent contains "PocketBook")
 */
function detectEinkDevice(): boolean {
  const ua = navigator.userAgent;
  const einkPatterns = [
    /\bBOOX\b/i,
    /\bONYX\b/i,
    /\breMarkable\b/i,
    /\bKindle\b/i,
    /\bSilk\b/i,
    /\bKobo\b/i,
    /\bPocketBook\b/i,
    /\bE[-_]?Ink\b/i,
    /\beReader\b/i,
  ];
  return einkPatterns.some((pattern) => pattern.test(ua));
}

// Apply e-ink class to document if detected
// This enables CSS optimizations for e-ink displays (disables backdrop blur)
if (detectEinkDevice()) {
  document.documentElement.classList.add("eink-device");
  console.info("[Diagrammer] E-ink device detected, applying optimizations");
}

// Global error handler for unhandled promise rejections and errors
// This helps catch issues on e-ink devices (e.g., Boox Air 4C) where
// unusual touch event behavior can cause unexpected errors
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Global] Unhandled promise rejection:", event.reason);
});

window.addEventListener("error", (event) => {
  console.error("[Global] Uncaught error:", event.error);
});

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
