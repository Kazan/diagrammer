import { useCallback, useMemo, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  isNativeBridgeEvent,
  type NativeBridge,
  type NativeBridgeCallbacks,
  type NativeBridgeEvent,
  type NativeFileHandle,
} from "../native-bridge";
import { EMPTY_SCENE_SIG, computeSceneSignature, stripExtension } from "../scene-utils";
import { applyRestoredScene, buildDefaultLocalAppStateOverrides, restoreSceneForApp } from "../excalidraw-restore";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object");
};

const isValidSceneData = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  return Array.isArray(value["elements"]);
};

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
  sceneLoadInProgressRef: MutableRefObject<boolean>;
  expectedSceneSigRef: MutableRefObject<string | null>;
  loadSkipRef: MutableRefObject<number>;
  pendingSceneRef: MutableRefObject<
    | {
        sceneJson: string;
        displayName: string;
        parsedScene: unknown;
        sig: string;
        hasElements: boolean;
      }
    | null
  >;
  setCurrentFileName: (name: string) => void;
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
    pendingSceneRef,
    setCurrentFileName,
    openFileRejectRef,
    openFileResolveRef,
    sceneLoadInProgressRef,
    expectedSceneSigRef,
    loadSkipRef,
    nativeBridge,
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
      let parsedScene: unknown = null;
      let nextSig = EMPTY_SCENE_SIG;
      let hasElements = false;
      try {
        parsedScene = JSON.parse(sceneJson);
        if (!isValidSceneData(parsedScene)) {
          parsedScene = null;
          throw new Error("Invalid scene payload");
        }

        const restoredForSig = restoreSceneForApp(
          parsedScene,
          buildDefaultLocalAppStateOverrides({
            viewBackgroundColor: "#ffffff",
            objectsSnapModeEnabled: true,
            zoomValue: 1,
          }),
        );
        nextSig = computeSceneSignature(restoredForSig.elements, restoredForSig.appState);
        hasElements = restoredForSig.elements.some((el) => !el.isDeleted);
      } catch (_err) {
        parsedScene = null;
        nextSig = EMPTY_SCENE_SIG;
        hasElements = false;
      }

      const parsedName = (() => {
        if (!isRecord(parsedScene)) return undefined;
        const appState = parsedScene["appState"];
        if (!isRecord(appState)) return undefined;
        const name = appState["name"];
        return typeof name === "string" ? name.trim() : undefined;
      })();

      console.log("[NativeBridge] onSceneLoaded", {
        fileName,
        bytes: sceneJson.length,
        parsedName,
      });

      const resolvedName = fileName?.trim()
        ? fileName
        : nativeBridge?.getCurrentFileName?.()?.trim() || parsedName || "Unsaved";
      const displayName = stripExtension(resolvedName);
      const handle = syncFileHandle(displayName, sceneJson, true, { suppressDirty: true });
      console.log("[NativeBridge] syncFileHandle", { displayName });

      sceneLoadInProgressRef.current = true;
      // Seed signature and suppress dirty before updating the scene so the first onChange
      // (triggered by updateScene) is ignored, and we overwrite the signature with the
      // canonical post-normalization one right after.
      suppressNextDirtyRef.current = true;
      prevSceneSigRef.current = nextSig;
      prevNonEmptySceneRef.current = hasElements;
      setIsDirty(false);
      expectedSceneSigRef.current = nextSig;
      loadSkipRef.current = 3;
      setCurrentFileName(displayName);

      const applySceneToCanvas = () => {
        if (api) {
          if (parsedScene) {
            const restored = restoreSceneForApp(
              parsedScene,
              buildDefaultLocalAppStateOverrides({
                viewBackgroundColor: "#ffffff",
                objectsSnapModeEnabled: true,
                zoomValue: 1,
              }),
            );
            applyRestoredScene(api, restored);
            const elements = api.getSceneElementsIncludingDeleted();
            const visible = api.getSceneElements();
            if (visible.length) {
              api.scrollToContent(visible, { fitToViewport: false, animate: false });
            }
            prevSceneSigRef.current = computeSceneSignature(elements, api.getAppState());
            prevNonEmptySceneRef.current = visible.length > 0;
            suppressNextDirtyRef.current = true;
            expectedSceneSigRef.current = prevSceneSigRef.current;
            loadSkipRef.current = 3;
            setIsDirty(false);
            setCurrentFileName(displayName);
            setStatus({ text: `Loaded${displayName !== "Unsaved" ? `: ${displayName}` : ""}`, tone: "ok" });
          } else {
            setStatus({ text: "Load failed: invalid scene", tone: "err" });
          }
          return;
        }

        pendingSceneRef.current = {
          sceneJson,
          displayName,
          parsedScene,
          sig: nextSig,
          hasElements,
        };
        console.log("[NativeBridge] queued scene until canvas ready", {
          bytes: sceneJson.length,
          displayName,
        });
      };

      applySceneToCanvas();

      if (openFileResolveRef.current) {
        openFileResolveRef.current([handle]);
      }
      sceneLoadInProgressRef.current = false;
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
      pendingSceneRef,
      setIsDirty,
      setStatus,
      suppressNextDirtyRef,
      syncFileHandle,
    ],
  );

  const nativeCallbacks = useMemo<NativeBridgeCallbacks>(() => {
    return {
      onNativeMessage: (payload: unknown) => {
        if (isNativeBridgeEvent(payload)) {
          handleNativeMessage(payload);
          return;
        }
        console.warn("[NativeBridge] Invalid event payload", payload);
        handleNativeMessage({
          event: "onNativeMessage",
          success: false,
          message: "Invalid native event payload",
        });
      },
      onSceneLoaded: (sceneJson: unknown, fileName?: unknown) => {
        if (typeof sceneJson === "string") {
          handleSceneLoaded(sceneJson, typeof fileName === "string" ? fileName : undefined);
          return;
        }
        console.warn("[NativeBridge] Invalid scene payload", { sceneJson, fileName });
        // Signal failure via native-message channel so open flows can be rejected.
        handleNativeMessage({
          event: "onNativeMessage",
          success: false,
          message: "Invalid native scene payload",
        });
      },
    };
  }, [handleNativeMessage, handleSceneLoaded]);

  return nativeCallbacks;
}
