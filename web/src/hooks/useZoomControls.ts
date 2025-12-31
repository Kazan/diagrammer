import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { fitSceneToViewport } from "../scene-view";

export function useZoomControls(options: {
  api: ExcalidrawImperativeAPI | null;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
}) {
  const { api, apiRef, setStatus } = options;
  const [zoom, setZoom] = useState<{ value: number }>({ value: 1 });
  const lastZoomRef = useRef(1);

  const toNormalizedZoomValue = useCallback((value: number): NormalizedZoomValue => {
    return value as NormalizedZoomValue;
  }, []);

  useEffect(() => {
    if (!api) return undefined;
    const unsubscribe = api.onChange((_elements, appState) => {
      const nextZoom = appState?.zoom?.value ?? 1;
      if (Math.abs(nextZoom - lastZoomRef.current) > 0.0001) {
        lastZoomRef.current = nextZoom;
        setZoom({ value: nextZoom });
      }
    });
    return () => unsubscribe();
  }, [api]);

  const handleZoomIn = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    const next = Math.min((instance.getAppState().zoom?.value ?? 1) * 1.1, 4);
    instance.updateScene({
      appState: { ...instance.getAppState(), zoom: { value: toNormalizedZoomValue(next) } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    lastZoomRef.current = next;
    setZoom({ value: next });
  }, [apiRef, toNormalizedZoomValue]);

  const handleZoomOut = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    const next = Math.max((instance.getAppState().zoom?.value ?? 1) / 1.1, 0.1);
    instance.updateScene({
      appState: { ...instance.getAppState(), zoom: { value: toNormalizedZoomValue(next) } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    lastZoomRef.current = next;
    setZoom({ value: next });
  }, [apiRef, toNormalizedZoomValue]);

  const handleResetZoom = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;

    // Reset zoom to 100%
    const next = 1;
    instance.updateScene({
      appState: { ...instance.getAppState(), zoom: { value: toNormalizedZoomValue(next) } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    lastZoomRef.current = next;
    setZoom({ value: next });

    // Center on selected elements, or the whole scene if nothing selected
    const appState = instance.getAppState();
    const selectedIds = Object.keys(appState.selectedElementIds || {});
    const allElements = instance.getSceneElements();

    if (selectedIds.length > 0) {
      // Center on selected elements
      const selectedElements = allElements.filter(el => selectedIds.includes(el.id));
      if (selectedElements.length > 0) {
        instance.scrollToContent(selectedElements, { fitToContent: true, animate: true });
      }
    } else if (allElements.length > 0) {
      // Center on whole scene
      instance.scrollToContent(allElements, { fitToContent: true, animate: true });
    }
  }, [apiRef, toNormalizedZoomValue]);

  const handleZoomToContent = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    const elements = instance.getSceneElements();
    if (!elements.length) {
      setStatus({ text: "Nothing to focus", tone: "warn" });
      return;
    }
    fitSceneToViewport(instance, elements, { animate: true });
  }, [apiRef, setStatus]);

  return { zoom, handleZoomIn, handleZoomOut, handleResetZoom, handleZoomToContent } as const;
}
