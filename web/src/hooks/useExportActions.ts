import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { NativeBridge } from "../native-bridge";

export function useExportActions(
  api: ExcalidrawImperativeAPI | null,
  nativeBridge: NativeBridge | undefined,
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void,
  setExporting: (mode: "png" | "svg" | null) => void,
) {
  const blobToDataUrl = useCallback((blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Unable to read image"));
      reader.readAsDataURL(blob);
    });
  }, []);

  const handleExportPng = useCallback(async () => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.exportPng) {
      setStatus({ text: "PNG export unavailable", tone: "warn" });
      return;
    }
    setExporting("png");
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: appState.theme === "dark",
          exportEmbedScene: true,
        },
        files,
        mimeType: "image/png",
      });
      const dataUrl = await blobToDataUrl(blob);
      nativeBridge.exportPng(dataUrl);
    } catch (err) {
      setStatus({ text: `PNG export failed: ${String(err)}`, tone: "err" });
    } finally {
      setExporting(null);
    }
  }, [api, blobToDataUrl, nativeBridge, setExporting, setStatus]);

  const handleExportSvg = useCallback(async () => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.exportSvg) {
      setStatus({ text: "SVG export unavailable", tone: "warn" });
      return;
    }
    setExporting("svg");
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      const svg = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportEmbedScene: true,
          exportWithDarkMode: appState.theme === "dark",
        },
        files,
      });
      const serialized = new XMLSerializer().serializeToString(svg);
      const dataUrl = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(serialized)))}`;
      nativeBridge.exportSvg(dataUrl);
    } catch (err) {
      setStatus({ text: `SVG export failed: ${String(err)}`, tone: "err" });
    } finally {
      setExporting(null);
    }
  }, [api, nativeBridge, setExporting, setStatus]);

  return { handleExportPng, handleExportSvg } as const;
}
