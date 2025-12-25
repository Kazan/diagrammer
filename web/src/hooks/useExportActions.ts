import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { NativeBridge } from "../native-bridge";

type MinimalElementBounds = { x: number; y: number; width: number; height: number };

const computeSceneBounds = (elements: ReadonlyArray<MinimalElementBounds>) => {
  if (!elements.length) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    longestSide: Math.max(maxX - minX, maxY - minY),
  } as const;
};

const computeExportScale = (elements: ReadonlyArray<MinimalElementBounds>) => {
  const dprFallback = Math.max(4, (window.devicePixelRatio || 1) * 4);
  const bounds = computeSceneBounds(elements);
  if (!bounds) {
    return dprFallback;
  }
  const targetLongest = 2400; // aim for at least ~2.4k px on the long edge
  const bboxScale = targetLongest / Math.max(bounds.longestSide, 1);
  return Math.max(dprFallback, Math.min(bboxScale, 32));
};

const logExportMetrics = (
  mode: "png" | "svg",
  params: {
    elements: ReadonlyArray<MinimalElementBounds>;
    exportPadding: number;
    exportScale: number;
  },
) => {
  const bounds = computeSceneBounds(params.elements);
  const paddedWidth = bounds ? bounds.width + params.exportPadding * 2 : 0;
  const paddedHeight = bounds ? bounds.height + params.exportPadding * 2 : 0;
  const expectedWidthPx = Math.round(paddedWidth * params.exportScale);
  const expectedHeightPx = Math.round(paddedHeight * params.exportScale);
  const payload = {
    mode,
    elements: params.elements.length,
    exportScale: params.exportScale,
    exportPadding: params.exportPadding,
    bounds,
    expectedPixelSize: {
      width: expectedWidthPx,
      height: expectedHeightPx,
      megapixels: Number(((expectedWidthPx * expectedHeightPx) / 1_000_000).toFixed(2)),
    },
  } as const;
  // Log as stringified JSON so Android logcat filters (DiagrammerWebView/NativeBridge) can capture a single line.
  console.log(`[export-metrics][${mode}] ${JSON.stringify(payload)}`);
};

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

  const measureDataUrlImage = useCallback((dataUrl: string) => {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Unable to measure image"));
      img.src = dataUrl;
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
      const exportPadding = 32;
      const exportScale = computeExportScale(elements);
      logExportMetrics("png", { elements, exportPadding, exportScale });
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: appState.theme === "dark",
          exportEmbedScene: true,
          exportScale,
        },
        files,
        exportPadding,
        getDimensions: (w: number, h: number) => ({
          width: Math.round(w * exportScale),
          height: Math.round(h * exportScale),
          scale: exportScale,
        }),
        mimeType: "image/png",
      });
      const dataUrl = await blobToDataUrl(blob);
      const pngDims = await measureDataUrlImage(dataUrl);
      console.log(
        `[export-payload][png] ${JSON.stringify({
          bytes: blob.size,
          dataUrlLength: dataUrl.length,
          naturalWidth: pngDims.width,
          naturalHeight: pngDims.height,
          megapixels: Number(((pngDims.width * pngDims.height) / 1_000_000).toFixed(2)),
        })}`,
      );
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
      const exportPadding = 32;
      const exportScale = computeExportScale(elements);
      logExportMetrics("svg", { elements, exportPadding, exportScale });
      const svg = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportEmbedScene: true,
          exportWithDarkMode: appState.theme === "dark",
          exportScale,
        },
        files,
      });
      const serialized = new XMLSerializer().serializeToString(svg);
      const dataUrl = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(serialized)))}`;
      console.log(
        `[export-payload][svg] ${JSON.stringify({
          serializedLength: serialized.length,
          dataUrlLength: dataUrl.length,
        })}`,
      );
      nativeBridge.exportSvg(dataUrl);
    } catch (err) {
      setStatus({ text: `SVG export failed: ${String(err)}`, tone: "err" });
    } finally {
      setExporting(null);
    }
  }, [api, nativeBridge, setExporting, setStatus]);

  return { handleExportPng, handleExportSvg } as const;
}
