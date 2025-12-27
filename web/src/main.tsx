import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
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
