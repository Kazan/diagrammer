import { useCallback, useMemo, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NativeBridge, NativeBridgeEvent, NativeFileHandle } from "../native-bridge";
import { EMPTY_SCENE_SIG, computeSceneSignature, computeSceneSignatureFromScene, stripExtension } from "../scene-utils";

export type NativeMessageDeps = {
  api: ExcalidrawImperativeAPI | null;
  currentFileName: string;
  syncFileHandle: (
    rawName: string,
    fileContent?: string,
    hasFileHandle?: boolean,
    opts?: { suppressDirty?: boolean },
  ) => NativeFileHandle;
  setLastSaved: (d: Date | null) => void;
  setIsDirty: (dirty: boolean) => void;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
  suppressNextDirtyRef: MutableRefObject<boolean>;
  prevSceneSigRef: MutableRefObject<string | null>;
  prevNonEmptySceneRef: MutableRefObject<boolean>;
  nativeBridge?: NativeBridge;
  openFileResolveRef: MutableRefObject<((handles: NativeFileHandle[]) => void) | null>;
  openFileRejectRef: MutableRefObject<((reason: any) => void) | null>;
};

export function useNativeMessageHandlers(deps: NativeMessageDeps) {
  const {
    api,
    currentFileName,
    syncFileHandle,
    setLastSaved,
    setIsDirty,
    setStatus,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    nativeBridge,
    openFileRejectRef,
    openFileResolveRef,
  } = deps;

  const handleNativeMessage = useCallback(
    (payload?: NativeBridgeEvent) => {
      if (!payload) return;
      console.log("[NativeBridge] onNativeMessage", payload);
      if (payload.event === "onSaveComplete") {
        const resolvedName = payload.fileName?.trim() ? payload.fileName : currentFileName;
        const displayName = stripExtension(resolvedName);
        if (payload.success) {
          setLastSaved(new Date());
          syncFileHandle(displayName || "Untitled", "", true);
          setIsDirty(false);
          suppressNextDirtyRef.current = true;
          if (api) {
            const elements = api.getSceneElementsIncludingDeleted();
            prevSceneSigRef.current = computeSceneSignature(elements, api.getAppState());
            prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
          }
          setStatus({ text: `Saved${displayName ? `: ${displayName}` : ""}`, tone: "ok" });
        } else {
          setStatus({
            text: `Save failed${payload.message ? `: ${payload.message}` : ""}`,
            tone: "err",
          });
        }
        return;
      }
      if (payload.event === "onExportComplete") {
        setStatus({
          text: payload.success
            ? "Exported to gallery"
            : `Export failed${payload.message ? `: ${payload.message}` : ""}`,
          tone: payload.success ? "ok" : "err",
        });
        return;
      }
      if (payload.event === "onNativeMessage" && payload.success === false) {
        if (openFileRejectRef.current) {
          openFileRejectRef.current(
            new DOMException(payload.message ?? "Open canceled", "AbortError"),
          );
          openFileResolveRef.current = null;
          openFileRejectRef.current = null;
        }
      }
      setStatus({ text: payload.message ?? "Native event", tone: "warn" });
    },
    [
      api,
      currentFileName,
      openFileRejectRef,
      openFileResolveRef,
      prevNonEmptySceneRef,
      prevSceneSigRef,
      setIsDirty,
      setLastSaved,
      setStatus,
      suppressNextDirtyRef,
      syncFileHandle,
    ],
  );

  const handleSceneLoaded = useCallback(
    (sceneJson: string, fileName?: string) => {
      console.log("[NativeBridge] onSceneLoaded", { fileName, bytes: sceneJson.length });
      let parsed: any = null;
      let nextSig = EMPTY_SCENE_SIG;
      let hasElements = false;
      try {
        parsed = JSON.parse(sceneJson);
        nextSig = computeSceneSignatureFromScene(parsed);
        hasElements = Array.isArray(parsed?.elements)
          ? parsed.elements.some((el: any) => !el.isDeleted)
          : false;
      } catch (_err) {
        parsed = null;
        nextSig = EMPTY_SCENE_SIG;
        hasElements = false;
      }

      const parsedName = parsed?.appState?.name?.trim();
      const resolvedName = fileName?.trim()
        ? fileName
        : nativeBridge?.getCurrentFileName?.()?.trim() || parsedName || "Unsaved";
      const displayName = stripExtension(resolvedName);
      const handle = syncFileHandle(displayName, sceneJson, true, { suppressDirty: true });

      suppressNextDirtyRef.current = true;
      setIsDirty(false);
      prevSceneSigRef.current = nextSig;
      prevNonEmptySceneRef.current = hasElements;

      if (openFileResolveRef.current) {
        openFileResolveRef.current([handle]);
      } else if (api) {
        if (parsed) {
          api.updateScene(parsed);
          const elements = api.getSceneElementsIncludingDeleted();
          const appState = api.getAppState();
          prevSceneSigRef.current = computeSceneSignature(elements, appState);
          prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
          suppressNextDirtyRef.current = true;
          setIsDirty(false);
          setStatus({ text: `Loaded${displayName !== "Unsaved" ? `: ${displayName}` : ""}`, tone: "ok" });
        } else {
          setStatus({ text: "Load failed: invalid scene", tone: "err" });
        }
      }
      openFileResolveRef.current = null;
      openFileRejectRef.current = null;
    },
    [
      api,
      nativeBridge,
      openFileRejectRef,
      openFileResolveRef,
      prevNonEmptySceneRef,
      prevSceneSigRef,
      setIsDirty,
      setStatus,
      suppressNextDirtyRef,
      syncFileHandle,
    ],
  );

  const nativeCallbacks = useMemo(
    () => ({ onNativeMessage: handleNativeMessage, onSceneLoaded: handleSceneLoaded }),
    [handleNativeMessage, handleSceneLoaded],
  );

  return nativeCallbacks;
}
