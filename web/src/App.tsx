import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  THEME,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
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
import { useSceneHistory } from "./hooks/useSceneHistory";
import { useZoomControls } from "./hooks/useZoomControls";
import { useImageInsertion } from "./hooks/useImageInsertion";
import { useExplicitStyleDefaults } from "./hooks/useExplicitStyleDefaults";
import type { NativeFileHandle } from "./native-bridge";
import { loadLocalSceneEntries, persistLocalSceneEntries, type LocalSceneEntry } from "./local-scenes";

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
  const [hasSceneContent, setHasSceneContent] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
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

  const loadLocalEntries = useCallback((): LocalSceneEntry[] => loadLocalSceneEntries(LOCAL_FS_KEY), [LOCAL_FS_KEY]);

  const persistLocalEntries = useCallback(
    (entries: LocalSceneEntry[]) => persistLocalSceneEntries(LOCAL_FS_KEY, entries),
    [LOCAL_FS_KEY],
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

  const { canUndo, handleUndo, resetHistoryFromCurrentScene } = useSceneHistory({
    api,
    sceneLoadInProgressRef,
    loadSkipRef,
    setStatus,
  });

  const { zoom, handleZoomIn, handleZoomOut, handleResetZoom, handleZoomToContent } = useZoomControls({
    api,
    apiRef,
    setStatus,
  });

  const { imageInputRef, handleImageInputChange, startImageInsertion } = useImageInsertion({
    api,
    apiRef,
    setActiveTool,
    setStatus,
  });

  const { captureStyleChange } = useExplicitStyleDefaults({ api });

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

  useEffect(() => {
    if (!api) return;
    const hasVisibleElements = api.getSceneElements().some((el) => !el.isDeleted);
    setHasSceneContent(hasVisibleElements);
  }, [api]);

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
      const hasVisibleElements = elements.some((el) => !el.isDeleted);
      prevNonEmptySceneRef.current = hasVisibleElements;
      setHasSceneContent(hasVisibleElements);
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

      // Log for debugging on problematic devices
      console.log(`[save] envelope: jsonLen=${envelope.json.length}, serializedLen=${serialized.length}, byteLen=${envelope.byteLength}`);

      if (hasCurrentFileRef.current) {
        if (nativeBridge?.persistSceneToCurrentDocument) {
          console.log("[save] calling persistSceneToCurrentDocument");
          nativeBridge.persistSceneToCurrentDocument(serialized);
          return;
        }
        if (nativeBridge?.saveSceneToCurrentDocument) {
          console.log("[save] calling saveSceneToCurrentDocument (legacy)");
          nativeBridge.saveSceneToCurrentDocument(envelope.json);
          return;
        }
      }

      if (nativeBridge?.persistScene) {
        console.log("[save] calling persistScene");
        nativeBridge.persistScene(serialized);
        return;
      }
      if (nativeBridge?.saveScene) {
        console.log("[save] calling saveScene (legacy)");
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
      console.error("[save] failed:", err);
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

      // Log for debugging on problematic devices
      console.log(`[saveToDocument] envelope: jsonLen=${envelope.json.length}, serializedLen=${serialized.length}, byteLen=${envelope.byteLength}`);

      if (nativeBridge?.persistSceneToDocument || nativeBridge?.saveSceneToDocument) {
        if (nativeBridge.persistSceneToDocument) {
          console.log("[saveToDocument] calling persistSceneToDocument");
          nativeBridge.persistSceneToDocument(serialized);
        } else {
          console.log("[saveToDocument] calling saveSceneToDocument (legacy)");
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
      console.error("[saveToDocument] failed:", err);
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [LOCAL_SCENE_KEY, api, buildSceneEnvelope, currentFileName, hasCurrentFileRef, loadLocalEntries, nativeBridge, persistLocalEntries, setCurrentFileName, setIsDirty, setStatus]);

  const handleCopySource = useCallback(async () => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    try {
      const envelope = await buildSceneEnvelope({ suggestedName: currentFileName });
      const sceneJson = envelope.json;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sceneJson);
      } else if (typeof document !== "undefined" && typeof document.execCommand === "function") {
        const textarea = document.createElement("textarea");
        textarea.value = sceneJson;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!successful) {
          throw new Error("Clipboard fallback failed");
        }
      } else {
        throw new Error("Clipboard not available");
      }
      setStatus({ text: "Scene source copied to clipboard", tone: "ok" });
    } catch (err) {
      console.error("Copy failed", err);
      setStatus({ text: `Copy failed: ${String(err)}`, tone: "err" });
    }
  }, [api, buildSceneEnvelope, currentFileName, setStatus]);

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
    setHasSceneContent,
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
    const hasVisibleElements = elements.some((el) => !el.isDeleted);
    prevSceneSigRef.current = computeSceneSignature(elements, appState);
    prevNonEmptySceneRef.current = hasVisibleElements;
    setHasSceneContent(hasVisibleElements);
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
  }, [api]);

  // Autosave temporarily disabled to avoid spamming native save notifications
  // and interfering with explicit save/load actions. Re-enable with a debounced
  // onChange hook if needed, but ensure native UX can tolerate the frequency.

  const { handleExportPng, handleExportSvg } = useExportActions(
    api,
    nativeBridge,
    setStatus,
    setExporting,
  );

  const handleClear = useCallback(() => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    api.resetScene({ resetLoadingState: true });
  }, [api, setStatus]);

  const handleSelectTool = (tool: ToolType) => {
    if (tool === "image") {
      setActiveTool("image");
      startImageInsertion();
      return;
    }
    setActiveTool(tool);
    apiRef.current?.setActiveTool({ type: tool });
  };

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
      <div className="excalidraw-container">
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
      </div>
      <SelectionPropertiesRail selection={selectionInfo} api={api} onStyleCapture={captureStyleChange} />
      <ChromeOverlay
        fileName={currentFileName}
        isDirty={isDirty}
        canSave={hasCurrentFileRef.current}
        hasSceneContent={hasSceneContent}
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        nativePresent={nativePresent}
        lastSaved={lastSaved}
        status={status}
        onOpen={handleOpenFromOverlay}
        onSaveNow={handleSaveNow}
        onSaveToDocument={handleSaveToDocument}
        onCopySource={handleCopySource}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onClear={handleClear}
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
