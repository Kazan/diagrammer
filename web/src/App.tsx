import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  MIME_TYPES,
  THEME,
  WelcomeScreen,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { ChromeOverlay } from "./components/ChromeOverlay";
import { type ToolType } from "./components/CustomToolbar";
import { SelectionPropertiesRail } from "./components/SelectionPropertiesRail";
import type { SelectionInfo } from "./components/SelectionFlyout";
import { type StatusMessage } from "./components/NativeStatus";
import { useNativeBridge, useNativeBridgeCallbacks } from "./hooks/useNativeBridge";
import { useNativeFileHandles } from "./hooks/useNativeFileHandles";
import { useNativePickers } from "./hooks/useNativePickers";
import { useNativeMessageHandlers } from "./hooks/useNativeMessageHandlers";
import { useSceneChangeSubscription } from "./hooks/useSceneChangeSubscription";
import { useSceneSerialization } from "./hooks/useSceneSerialization";
import { useExportActions } from "./hooks/useExportActions";
import { useSceneHydration } from "./hooks/useSceneHydration";
import type { NativeFileHandle } from "./native-bridge";

import {
  applyRestoredScene,
  buildDefaultLocalAppStateOverrides,
  restoreSceneForApp,
} from "./excalidraw-restore";

import { computeSceneSignature, stripExtension } from "./scene-utils";

export default function App() {
  const LOCAL_SCENE_KEY = "diagrammer.localScene";
  const LOCAL_FS_KEY = "diagrammer.localFs";
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const { nativeBridge, nativePresent } = useNativeBridge({});
  const initialStoredName = useMemo(
    () => stripExtension(window.NativeBridge?.getCurrentFileName?.() ?? ""),
    []
  );
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("selection");
  const [currentFileName, setCurrentFileName] = useState(initialStoredName || "Unsaved");
  const [isDirty, setIsDirty] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [zoom, setZoom] = useState<{ value: number }>({ value: 1 });
  const lastZoomRef = useRef(1);
  const HIDE_DEFAULT_PROPS_FLYOUT = false;
  const openFileResolveRef = useRef<((handles: NativeFileHandle[]) => void) | null>(null);
  const openFileRejectRef = useRef<((reason: any) => void) | null>(null);
  const prevNonEmptySceneRef = useRef(false);
  const hydratedSceneRef = useRef(false);
  const sceneLoadInProgressRef = useRef(false);
  const expectedSceneSigRef = useRef<string | null>(null);
  const loadSkipRef = useRef(0);
  const suppressNextDirtyRef = useRef(false);
  const prevSceneSigRef = useRef<string | null>(null);
  type SceneSnapshot = {
    elements: ReturnType<ExcalidrawImperativeAPI["getSceneElementsIncludingDeleted"]>;
    appState: ReturnType<ExcalidrawImperativeAPI["getAppState"]>;
    files: ReturnType<ExcalidrawImperativeAPI["getFiles"]>;
  };
  const MAX_HISTORY_ENTRIES = 50;
  const historyRef = useRef<SceneSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const historySigRef = useRef<string | null>(null);
  const historyApplyingRef = useRef(false);
  const pendingHistoryRef = useRef<SceneSnapshot | null>(null);
  const pendingHistorySigRef = useRef<string | null>(null);
  const pointerInteractionRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const pendingSceneRef = useRef<
    | {
        sceneJson: string;
        displayName: string;
        parsedScene: unknown;
        sig: string;
        hasElements: boolean;
      }
    | null
  >(null);

  type LocalEntry = { name: string; scene: string; updated: number };

  const loadLocalEntries = useCallback((): LocalEntry[] => {
    try {
      const raw = window.localStorage.getItem(LOCAL_FS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e) => typeof e?.name === "string" && typeof e?.scene === "string" && typeof e?.updated === "number");
    } catch (_err) {
      return [];
    }
  }, [LOCAL_FS_KEY]);

  const persistLocalEntries = useCallback(
    (entries: LocalEntry[]) => {
      try {
        window.localStorage.setItem(LOCAL_FS_KEY, JSON.stringify(entries));
      } catch (_err) {
        // ignore
      }
    },
    [LOCAL_FS_KEY]
  );

  const {
    createNativeFileHandle,
    syncFileHandle,
    applyFileHandleToAppState,
    clearFileAssociation,
    currentFileHandleRef,
    hasCurrentFileRef,
  } = useNativeFileHandles({
    api,
    nativeBridge,
    initialFileName: initialStoredName || "Unsaved",
    setCurrentFileName,
    suppressNextDirtyRef,
  });

  const { initialData } = useSceneHydration({
    api,
    setStatus,
    setIsDirty,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    hydratedSceneRef,
  });

  useEffect(() => {
    // Preserve localStorage for browser fallback; clear only in native contexts.
    if (window.NativeBridge) {
      try {
        const prefix = "diagrammer.";
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keys.push(key);
          }
        }
        for (const key of keys) {
          window.localStorage.removeItem(key);
        }
      } catch (_err) {
        // ignore if storage unavailable
      }
    }
  }, []);

  const { buildSceneEnvelope } = useSceneSerialization(api);

  const excalidrawUIOptions = useMemo(
    () => ({
      canvasActions: {
        changeViewBackgroundColor: false,
        clearCanvas: false,
        export: false as const,
        loadScene: false,
        saveAsImage: false,
        saveToActiveFile: false,
        toggleTheme: null,
      },
      tools: {
        image: false,
      },
    }),
    [],
  );

  const toNormalizedZoomValue = useCallback((value: number): NormalizedZoomValue => {
    return value as NormalizedZoomValue;
  }, []);

  const toImageMimeType = useCallback((value: string): BinaryFileData["mimeType"] => {
    if (value && value.startsWith("image/")) {
      return value as BinaryFileData["mimeType"];
    }
    return MIME_TYPES.png;
  }, []);

  const cloneSnapshot = useCallback((): SceneSnapshot | null => {
    if (!api) return null;
    return {
      elements: structuredClone(api.getSceneElementsIncludingDeleted()),
      appState: structuredClone(api.getAppState()),
      files: structuredClone(api.getFiles()),
    };
  }, [api]);

  const commitSnapshot = useCallback((snapshot: SceneSnapshot, sig: string) => {
    const capped = historyRef.current.slice(0, historyIndexRef.current + 1);
    capped.push(snapshot);
    const overflow = capped.length - MAX_HISTORY_ENTRIES;
    if (overflow > 0) {
      capped.splice(0, overflow);
    }
    historyRef.current = capped;
    historyIndexRef.current = capped.length - 1;
    historySigRef.current = sig;
    setCanUndo(historyIndexRef.current > 0);
  }, []);

  const resetHistoryFromCurrentScene = useCallback(() => {
    const snapshot = cloneSnapshot();
    if (!snapshot) return;
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    historySigRef.current = computeSceneSignature(snapshot.elements, snapshot.appState);
    pendingHistoryRef.current = null;
    pendingHistorySigRef.current = null;
    pointerInteractionRef.current = false;
    setCanUndo(false);
  }, [cloneSnapshot]);

  useEffect(() => {
    if (!api) return undefined;
    resetHistoryFromCurrentScene();
    const unsubscribe = api.onChange((elements, appState) => {
      if (historyApplyingRef.current) return;
      if (sceneLoadInProgressRef.current || loadSkipRef.current > 0) return;
      const isInteracting = Boolean(
        appState.selectedElementsAreBeingDragged ||
          appState.multiElement ||
          appState.editingLinearElement ||
          appState.editingTextElement,
      );
      const sig = computeSceneSignature(elements, appState);
      if (historySigRef.current === sig) {
        pendingHistoryRef.current = null;
        pendingHistorySigRef.current = null;
        return;
      }
      const snapshot = cloneSnapshot();
      if (!snapshot) return;
      if (isInteracting || pointerInteractionRef.current) {
        pendingHistoryRef.current = snapshot;
        pendingHistorySigRef.current = sig;
        return;
      }
      const nextSnapshot = pendingHistoryRef.current ?? snapshot;
      const nextSig = pendingHistorySigRef.current ?? sig;
      commitSnapshot(nextSnapshot, nextSig);
      pendingHistoryRef.current = null;
      pendingHistorySigRef.current = null;
    });
    return () => unsubscribe();
  }, [
    api,
    cloneSnapshot,
    commitSnapshot,
    resetHistoryFromCurrentScene,
    sceneLoadInProgressRef,
    loadSkipRef,
  ]);

  const { openWithNativePicker } = useNativePickers({
    nativeBridge,
    currentFileName,
    createNativeFileHandle,
    applyFileHandleToAppState,
    openFileResolveRef,
    openFileRejectRef,
    api,
  });

  const handleOpenWithNativePicker = useCallback(() => {
    if (!nativeBridge?.openSceneFromDocument) return false;
    void openWithNativePicker().catch((err) => {
      console.warn("Native open failed", err);
      setStatus({ text: `Open failed: ${String(err?.message ?? err)}`, tone: "err" });
    });
    return true;
  }, [nativeBridge, openWithNativePicker, setStatus]);

  const handleOpenLocalFallback = useCallback(() => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return false;
    }
    try {
      const entries = loadLocalEntries();
      if (!entries.length) {
        setStatus({ text: "No local scenes found", tone: "warn" });
        return false;
      }
      const names = entries.map((e) => e.name).join(", ");
      const choice = window.prompt(`Open local scene (available: ${names})`, entries[entries.length - 1]?.name ?? "");
      if (!choice) return false;
      const entry = entries.find((e) => e.name === choice.trim());
      if (!entry) {
        setStatus({ text: "Scene not found", tone: "warn" });
        return false;
      }
      const parsed = JSON.parse(entry.scene);
      const restored = restoreSceneForApp(
        parsed,
        buildDefaultLocalAppStateOverrides({
          viewBackgroundColor: "#ffffff",
          objectsSnapModeEnabled: true,
          zoomValue: 1,
        }),
      );
      applyRestoredScene(api, restored);
      const elements = api.getSceneElements();
      if (elements.length) {
        api.scrollToContent(elements, { fitToViewport: true, animate: false });
      }
      prevSceneSigRef.current = computeSceneSignature(api.getSceneElements(), api.getAppState());
      prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
      suppressNextDirtyRef.current = true;
      resetHistoryFromCurrentScene();
      setIsDirty(false);
      setCurrentFileName(choice.trim());
      setStatus({ text: `Loaded ${choice.trim()} from local storage`, tone: "ok" });
      return true;
    } catch (err) {
      console.warn("Local load failed", err);
      setStatus({ text: "Local load failed", tone: "err" });
      return false;
    }
  }, [api, loadLocalEntries, resetHistoryFromCurrentScene, setCurrentFileName, setIsDirty, setStatus]);

  const performSave = useCallback(async () => {
    if (!api) return;
    try {
      const envelope = await buildSceneEnvelope({ suggestedName: currentFileName });
      const serialized = JSON.stringify(envelope);

      if (hasCurrentFileRef.current) {
        if (nativeBridge?.persistSceneToCurrentDocument) {
          nativeBridge.persistSceneToCurrentDocument(serialized);
          return;
        }
        if (nativeBridge?.saveSceneToCurrentDocument) {
          nativeBridge.saveSceneToCurrentDocument(envelope.json);
          return;
        }
      }

      if (nativeBridge?.persistScene) {
        nativeBridge.persistScene(serialized);
        return;
      }
      if (nativeBridge?.saveScene) {
        nativeBridge.saveScene(envelope.json);
        return;
      }

      try {
        const name = window.prompt("Save local scene as", currentFileName || "Untitled")?.trim();
        if (!name) {
          setStatus({ text: "Save cancelled", tone: "warn" });
          return;
        }
        const entries = loadLocalEntries();
        const nextEntries = entries.filter((e) => e.name !== name);
        nextEntries.push({ name, scene: envelope.json, updated: Date.now() });
        persistLocalEntries(nextEntries);
        window.localStorage.setItem(LOCAL_SCENE_KEY, envelope.json);
        setStatus({ text: `Saved ${name} locally`, tone: "ok" });
        setIsDirty(false);
        setCurrentFileName(name);
      } catch (_err) {
        setStatus({ text: "Save failed (storage)", tone: "err" });
      }
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [LOCAL_SCENE_KEY, api, buildSceneEnvelope, currentFileName, hasCurrentFileRef, loadLocalEntries, nativeBridge, persistLocalEntries, setCurrentFileName, setIsDirty, setStatus]);

  const handleSaveNow = useCallback(() => {
    void performSave();
  }, [performSave]);

  const handleSaveToDocument = useCallback(async () => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    try {
      const envelope = await buildSceneEnvelope({ suggestedName: currentFileName });
      const serialized = JSON.stringify(envelope);
      if (nativeBridge?.persistSceneToDocument || nativeBridge?.saveSceneToDocument) {
        if (nativeBridge.persistSceneToDocument) {
          nativeBridge.persistSceneToDocument(serialized);
        } else {
          nativeBridge.saveSceneToDocument?.(envelope.json);
        }
        hasCurrentFileRef.current = true;
        return;
      }

      const name = window.prompt("Save local scene as", currentFileName || "Untitled")?.trim();
      if (!name) {
        setStatus({ text: "Save cancelled", tone: "warn" });
        return;
      }
      const entries = loadLocalEntries();
      const nextEntries = entries.filter((e) => e.name !== name);
      nextEntries.push({ name, scene: envelope.json, updated: Date.now() });
      persistLocalEntries(nextEntries);
      window.localStorage.setItem(LOCAL_SCENE_KEY, envelope.json);
      setStatus({ text: `Saved ${name} locally`, tone: "ok" });
      setIsDirty(false);
      setCurrentFileName(name);
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [LOCAL_SCENE_KEY, api, buildSceneEnvelope, currentFileName, hasCurrentFileRef, loadLocalEntries, nativeBridge, persistLocalEntries, setCurrentFileName, setIsDirty, setStatus]);

  const handleOpenFromOverlay = useCallback(() => {
    // Prefer native picker when available; otherwise use local storage fallback.
    if (nativePresent) {
      const opened = handleOpenWithNativePicker();
      if (!opened) {
        const localOpened = handleOpenLocalFallback();
        if (!localOpened) {
          setStatus({ text: "Native picker unavailable", tone: "warn" });
        }
      }
      return;
    }
    const localOpened = handleOpenLocalFallback();
    if (!localOpened) {
      setStatus({ text: "No local scenes found", tone: "warn" });
    }
  }, [handleOpenLocalFallback, handleOpenWithNativePicker, nativePresent, setStatus]);

  const handleSelectionChange = useCallback(
    ({ elements, viewportBounds }: { elements: ExcalidrawElement[]; viewportBounds: SelectionInfo["viewportBounds"] }) => {
      if (!elements.length) {
        setSelectionInfo(null);
        return;
      }
      setSelectionInfo({ elements, viewportBounds });
    },
    [],
  );

  useSceneChangeSubscription({
    api,
    setActiveTool,
    setCurrentFileName,
    setIsDirty,
    setStatus,
    clearFileAssociation,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    hydratedSceneRef,
    sceneLoadInProgressRef,
    expectedSceneSigRef,
    loadSkipRef,
    handleSaveToDocument,
    handleOpenWithNativePicker,
    onSelectionChange: handleSelectionChange,
  });

  const nativeCallbacks = useNativeMessageHandlers({
    api,
    currentFileName,
    syncFileHandle,
    setLastSaved,
    setIsDirty,
    setStatus,
    setCurrentFileName,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    nativeBridge,
    openFileResolveRef,
    openFileRejectRef,
    sceneLoadInProgressRef,
    expectedSceneSigRef,
    loadSkipRef,
    pendingSceneRef,
  });

  useNativeBridgeCallbacks(nativeCallbacks);

  useEffect(() => {
    if (!status) return undefined;
    const id = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (!api) return;
    const pending = pendingSceneRef.current;
    if (!pending) return;
    pendingSceneRef.current = null;

    const isRecord = (value: unknown): value is Record<string, unknown> => {
      return Boolean(value && typeof value === "object");
    };
    const isValidSceneData = (value: unknown): value is Record<string, unknown> => {
      if (!isRecord(value)) return false;
      return Array.isArray(value["elements"]);
    };

    const parsedScene = (() => {
      if (isValidSceneData(pending.parsedScene)) return pending.parsedScene;
      try {
        const next = JSON.parse(pending.sceneJson);
        return isValidSceneData(next) ? next : null;
      } catch (_err) {
        return null;
      }
    })();

    if (!parsedScene) {
      setStatus({ text: "Load failed: invalid scene", tone: "err" });
      return;
    }
    sceneLoadInProgressRef.current = true;
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
    const appState = api.getAppState();
    prevSceneSigRef.current = computeSceneSignature(elements, appState);
    prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
    suppressNextDirtyRef.current = true;
    expectedSceneSigRef.current = prevSceneSigRef.current;
    loadSkipRef.current = 3;
    resetHistoryFromCurrentScene();
    setIsDirty(false);
    setCurrentFileName(pending.displayName);
    setStatus({ text: `Loaded: ${pending.displayName}`, tone: "ok" });
    sceneLoadInProgressRef.current = false;
  }, [
    api,
    expectedSceneSigRef,
    loadSkipRef,
    prevNonEmptySceneRef,
    prevSceneSigRef,
    resetHistoryFromCurrentScene,
    sceneLoadInProgressRef,
    setCurrentFileName,
    setIsDirty,
    setStatus,
    suppressNextDirtyRef,
  ]);

  useEffect(() => {
    if (!api) return;
    api.setActiveTool({ type: "selection" });

    // Default new linear elements (lines/arrows) to sharp edges instead of rounded.
    const appState = api.getAppState();
    if (appState.currentItemRoundness !== "sharp") {
      api.updateScene({
        appState: { ...appState, currentItemRoundness: "sharp" },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }

    const unsubscribe = api.onChange((_elements, appState) => {
      const nextZoom = appState?.zoom?.value ?? 1;
      if (Math.abs(nextZoom - lastZoomRef.current) > 0.0001) {
        lastZoomRef.current = nextZoom;
        setZoom({ value: nextZoom });
      }
    });
    return () => unsubscribe();
  }, [api]);

  useEffect(() => {
    if (!api) return undefined;
    const unsubDown = api.onPointerDown?.(() => {
      pointerInteractionRef.current = true;
    });
    const unsubUp = api.onPointerUp?.(() => {
      pointerInteractionRef.current = false;
      if (historyApplyingRef.current) return;
      if (pendingHistoryRef.current && pendingHistorySigRef.current) {
        commitSnapshot(pendingHistoryRef.current, pendingHistorySigRef.current);
        pendingHistoryRef.current = null;
        pendingHistorySigRef.current = null;
      }
    });
    return () => {
      unsubDown?.();
      unsubUp?.();
    };
  }, [api, commitSnapshot]);

  // Autosave temporarily disabled to avoid spamming native save notifications
  // and interfering with explicit save/load actions. Re-enable with a debounced
  // onChange hook if needed, but ensure native UX can tolerate the frequency.

  const { handleExportPng, handleExportSvg } = useExportActions(
    api,
    nativeBridge,
    setStatus,
    setExporting,
  );

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
  }, [toNormalizedZoomValue]);

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
  }, [toNormalizedZoomValue]);

  const handleResetZoom = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    const next = 1;
    instance.updateScene({
      appState: { ...instance.getAppState(), zoom: { value: toNormalizedZoomValue(next) } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    lastZoomRef.current = next;
    setZoom({ value: next });
  }, [toNormalizedZoomValue]);

  const handleZoomToContent = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    const elements = instance.getSceneElements();
    if (!elements.length) {
      setStatus({ text: "Nothing to focus", tone: "warn" });
      return;
    }
    instance.scrollToContent(elements, { fitToViewport: true, animate: true });
  }, [setStatus]);

  const handleUndo = useCallback(() => {
    if (!api) return;
    const targetIndex = historyIndexRef.current - 1;
    const snapshot = historyRef.current[targetIndex];
    if (!snapshot) {
      setStatus({ text: "Nothing to undo", tone: "warn" });
      return;
    }
    historyApplyingRef.current = true;
    try {
      const files = structuredClone(snapshot.files);
      api.updateScene({
        elements: structuredClone(snapshot.elements),
        appState: structuredClone(snapshot.appState),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.addFiles(Object.values(files));
      historyIndexRef.current = targetIndex;
      historySigRef.current = computeSceneSignature(snapshot.elements, snapshot.appState);
      pendingHistoryRef.current = null;
      pendingHistorySigRef.current = null;
      pointerInteractionRef.current = false;
      setCanUndo(historyIndexRef.current > 0);
    } finally {
      window.requestAnimationFrame(() => {
        historyApplyingRef.current = false;
      });
    }
  }, [api, setStatus]);

  const handleSelectTool = (tool: ToolType) => {
    if (tool === "image") {
      setActiveTool("image");
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
        imageInputRef.current.click();
      }
      return;
    }
    setActiveTool(tool);
    apiRef.current?.setActiveTool({ type: tool });
  };

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!api) return;
      const toDataUrl = (input: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Unable to read image"));
          reader.readAsDataURL(input);
        });

      const loadImageDimensions = (dataUrl: string) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          img.onerror = () => reject(new Error("Unable to load image"));
          img.src = dataUrl;
        });

      try {
        const dataURL = (await toDataUrl(file)) as DataURL;
        const { width, height } = await loadImageDimensions(dataURL);
        const fileId = (`image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) as FileId;
        const now = Date.now();
        api.addFiles([
          {
            id: fileId,
            dataURL,
            mimeType: toImageMimeType(file.type),
            created: now,
            lastRetrieved: now,
          },
        ]);

        if (import.meta.env.DEV) {
          requestAnimationFrame(() => {
            const files = api.getFiles();
            if (!files[fileId]) {
              console.warn("[ImageInsert] addFiles() missing fileId", { fileId, knownFileIds: Object.keys(files) });
            }
            const hasElement = api
              .getSceneElementsIncludingDeleted()
              .some(
                (el) =>
                  el.type === "image" &&
                  "fileId" in el &&
                  typeof el.fileId === "string" &&
                  el.fileId === fileId,
              );
            if (!hasElement) {
              console.warn("[ImageInsert] Missing image element with fileId", { fileId });
            }
          });
        }

        const appState = api.getAppState();
        const zoom = appState.zoom?.value ?? 1;
        const offsetLeft = appState.offsetLeft ?? 0;
        const offsetTop = appState.offsetTop ?? 0;
        const scrollX = appState.scrollX ?? 0;
        const scrollY = appState.scrollY ?? 0;
        const centerX = (window.innerWidth / 2 - offsetLeft) / zoom - scrollX;
        const centerY = (window.innerHeight / 2 - offsetTop) / zoom - scrollY;
        const [imageElement] = convertToExcalidrawElements([
          {
            type: "image",
            fileId,
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            angle: 0,
          },
        ]);

        api.updateScene({
          elements: [...api.getSceneElements(), imageElement as ExcalidrawElement],
          appState: {
            selectedElementIds: { [imageElement.id]: true },
            selectedGroupIds: {},
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        setActiveTool("selection");
        apiRef.current?.setActiveTool({ type: "selection" });
        setStatus({ text: `Inserted image${file.name ? `: ${file.name}` : ""}`, tone: "ok" });
      } catch (err) {
        setStatus({ text: `Image insert failed: ${String((err as Error)?.message ?? err)}`, tone: "err" });
      }
    },
    [api, setStatus, toImageMimeType]
  );

  const handleImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void handleImageFile(file);
    },
    [handleImageFile]
  );

  return (
    <div className={`app-shell${HIDE_DEFAULT_PROPS_FLYOUT ? " hide-default-props" : ""}`}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageInputChange}
        aria-label="Insert image"
      />
      <Excalidraw
        theme={THEME.LIGHT}
        initialData={initialData}
        objectsSnapModeEnabled
        UIOptions={excalidrawUIOptions}
        handleKeyboardGlobally={false}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          setApi(api);
        }}
      >
        {/* Override Excalidraw's fallback MainMenu to avoid rendering built-in load/save/export items. */}
        <MainMenu />
        {/* Render a stripped-down welcome screen so the default menu items stay hidden */}
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo />
            <WelcomeScreen.Center.Heading>
              Start drawing whenever you like
            </WelcomeScreen.Center.Heading>
            {/* No menu items rendered here on purpose */}
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
      <SelectionPropertiesRail selection={selectionInfo} api={api} />
      <ChromeOverlay
        fileName={currentFileName}
        isDirty={isDirty}
        canSave={hasCurrentFileRef.current}
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        nativePresent={nativePresent}
        lastSaved={lastSaved}
        status={status}
        onOpen={handleOpenFromOverlay}
        onSaveNow={handleSaveNow}
        onSaveToDocument={handleSaveToDocument}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        exporting={exporting}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onZoomToContent={handleZoomToContent}
        onUndo={handleUndo}
        canUndo={canUndo}
      />
    </div>
  );
}
