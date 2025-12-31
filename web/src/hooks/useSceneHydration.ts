import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { buildDefaultLocalAppStateOverrides, restoreSceneForApp } from "../excalidraw-restore";
import { computeSceneSignature } from "../scene-utils";
import { fitSceneToViewport } from "../scene-view";

export function useSceneHydration(options: {
  api: ExcalidrawImperativeAPI | null;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
  setIsDirty: (dirty: boolean) => void;
  suppressNextDirtyRef: MutableRefObject<boolean>;
  prevSceneSigRef: MutableRefObject<string | null>;
  prevNonEmptySceneRef: MutableRefObject<boolean>;
  hydratedSceneRef: MutableRefObject<boolean>;
}) {
  const {
    api,
    setStatus,
    setIsDirty,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    hydratedSceneRef,
  } = options;

  const LOCAL_SCENE_KEY = "diagrammer.localScene";
  const LOCAL_FS_KEY = "diagrammer.localFs";

  const startupRawScene = useMemo(() => {
    const saved = window.NativeBridge?.loadScene?.() ?? window.localStorage.getItem(LOCAL_SCENE_KEY);
    if (!saved) {
      try {
        const rawFs = window.localStorage.getItem(LOCAL_FS_KEY);
        const entries = rawFs ? JSON.parse(rawFs) : null;
        if (Array.isArray(entries) && entries.length) {
          const latest = entries.reduce((best: any, entry: any) => (best && best.updated > entry.updated ? best : entry));
          if (latest?.scene) return JSON.parse(latest.scene);
        }
      } catch (_err) {
        // ignore
      }
      return null;
    }
    try {
      return JSON.parse(saved);
    } catch (err) {
      console.warn("Failed to parse saved scene", err);
      return null;
    }
  }, [LOCAL_FS_KEY, LOCAL_SCENE_KEY]);

  const initialData = useMemo(() => {
    const localOverrides = buildDefaultLocalAppStateOverrides();
    const restored = restoreSceneForApp(startupRawScene, localOverrides);
    // Don't use scrollToContent here - we'll use fitSceneToViewport after API is ready
    // to properly account for UI insets (header, toolbar, etc.)
    return {
      ...restored,
      scrollToContent: false,
    };
  }, [startupRawScene]);

  const [didAnnounceRestore, setDidAnnounceRestore] = useState(false);
  const [didFitToViewport, setDidFitToViewport] = useState(false);

  useEffect(() => {
    if (!api) return;
    const elements = api.getSceneElements();
    hydratedSceneRef.current = true;
    prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
    prevSceneSigRef.current = computeSceneSignature(elements, api.getAppState());

    // Fit to viewport after hydration, accounting for UI chrome
    if (!didFitToViewport && elements.some((el) => !el.isDeleted)) {
      setDidFitToViewport(true);
      // Use requestAnimationFrame to ensure DOM has settled
      requestAnimationFrame(() => {
        fitSceneToViewport(api, elements, { animate: false });
      });
    }
  }, [api, didFitToViewport, hydratedSceneRef, prevNonEmptySceneRef, prevSceneSigRef]);

  useEffect(() => {
    if (!api || didAnnounceRestore) return;
    if (!startupRawScene) return;
    setDidAnnounceRestore(true);
    setIsDirty(false);
    suppressNextDirtyRef.current = true;
    setStatus({ text: "Restored previous drawing", tone: "ok" });
  }, [api, didAnnounceRestore, setIsDirty, setStatus, startupRawScene, suppressNextDirtyRef]);

  return { initialData } as const;
}
