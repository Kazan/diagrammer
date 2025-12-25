import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  EMPTY_SCENE,
  computeSceneSignature,
  computeSceneSignatureFromScene,
} from "../scene-utils";

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

  const startupScene = useMemo(() => {
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

  const initialData = useMemo(() => startupScene ?? EMPTY_SCENE, [startupScene]);
  const [pendingScene, setPendingScene] = useState(startupScene);

  useEffect(() => {
    if (!api) return;
    const elements = api.getSceneElements();
    hydratedSceneRef.current = true;
    prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
    prevSceneSigRef.current = computeSceneSignature(elements, api.getAppState());
  }, [api, hydratedSceneRef, prevNonEmptySceneRef, prevSceneSigRef]);

  useEffect(() => {
    if (!api || !pendingScene) return;
    api.resetScene(pendingScene as any, { resetLoadingState: true, replaceFiles: true });
    const elements = Array.isArray((pendingScene as any)?.elements)
      ? (pendingScene as any).elements.filter((el: any) => !el.isDeleted)
      : [];
    if (elements.length) {
      api.scrollToContent(elements as any, { fitToViewport: true, animate: false });
    }
    setPendingScene(null);
    hydratedSceneRef.current = true;
    prevNonEmptySceneRef.current = Array.isArray((pendingScene as any)?.elements)
      ? (pendingScene as any).elements.some((el: any) => !el.isDeleted)
      : false;
    setIsDirty(false);
    suppressNextDirtyRef.current = true;
    prevSceneSigRef.current = computeSceneSignatureFromScene(pendingScene);
    setStatus({ text: "Restored previous drawing", tone: "ok" });
  }, [
    api,
    pendingScene,
    computeSceneSignatureFromScene,
    hydratedSceneRef,
    prevNonEmptySceneRef,
    prevSceneSigRef,
    setIsDirty,
    setStatus,
    suppressNextDirtyRef,
  ]);

  return { initialData } as const;
}
