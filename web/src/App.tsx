import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { ChromeOverlay } from "./components/ChromeOverlay";
import { type ToolType } from "./components/CustomToolbar";
import { type StatusMessage } from "./components/NativeStatus";
import { useNativeBridge, useNativeBridgeCallbacks } from "./hooks/useNativeBridge";
import { useNativeFileHandles } from "./hooks/useNativeFileHandles";
import { useNativePickers } from "./hooks/useNativePickers";
import { useNativeMessageHandlers } from "./hooks/useNativeMessageHandlers";
import { useSceneChangeSubscription } from "./hooks/useSceneChangeSubscription";
import { useSceneSerialization } from "./hooks/useSceneSerialization";
import { useExportActions } from "./hooks/useExportActions";
import { useSceneHydration } from "./hooks/useSceneHydration";
import { useNativeSceneLoader } from "./hooks/useNativeSceneLoader";
import type { NativeFileHandle } from "./native-bridge";

import { computeSceneSignature, stripExtension } from "./scene-utils";

export default function App() {
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
  const HIDE_BUILTIN_TOOLBAR = false;
  const lastDialogRef = useRef<string | null>(null);
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
        parsed: any;
        sig: string;
        hasElements: boolean;
      }
    | null
  >(null);

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
    // Ensure a clean slate even if the WebView kept localStorage (e.g., across reinstalls on some devices).
    try {
      window.localStorage.clear();
    } catch (_err) {
      // ignore if storage unavailable
    }
  }, []);

  const { buildSceneEnvelope } = useSceneSerialization(api);

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

  const performSave = useCallback(async () => {
    if (!api || (!nativeBridge?.persistScene && !nativeBridge?.saveScene)) return;
    try {
      const envelope = await buildSceneEnvelope({ suggestedName: currentFileName });
      const serialized = JSON.stringify(envelope);
      if (nativeBridge.persistScene) {
        nativeBridge.persistScene(serialized);
      } else {
        nativeBridge.saveScene?.(envelope.json);
      }
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, buildSceneEnvelope, currentFileName, nativeBridge, setStatus]);

  const handleSaveNow = useCallback(() => {
    if (!nativeBridge?.persistScene && !nativeBridge?.saveScene) {
      setStatus({ text: "Native save unavailable", tone: "warn" });
      return;
    }
    void performSave();
  }, [nativeBridge, performSave, setStatus]);

  const handleSaveToDocument = useCallback(async () => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.persistSceneToDocument && !nativeBridge?.saveSceneToDocument) {
      setStatus({ text: "Native document picker unavailable", tone: "warn" });
      return;
    }
    try {
      const envelope = await buildSceneEnvelope({ suggestedName: currentFileName });
      const serialized = JSON.stringify(envelope);
      if (nativeBridge.persistSceneToDocument) {
        nativeBridge.persistSceneToDocument(serialized);
      } else {
        nativeBridge.saveSceneToDocument?.(envelope.json);
      }
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, buildSceneEnvelope, currentFileName, nativeBridge, setStatus]);

  const handleOpenFromOverlay = useCallback(() => {
    const opened = handleOpenWithNativePicker();
    if (!opened) {
      setStatus({ text: "Native picker unavailable", tone: "warn" });
    }
  }, [handleOpenWithNativePicker, setStatus]);

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
    lastDialogRef,
    handleSaveToDocument,
    handleOpenWithNativePicker,
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
    const parsed = pending.parsed ?? (() => {
      try {
        return JSON.parse(pending.sceneJson);
      } catch (_err) {
        return null;
      }
    })();
    if (!parsed) {
      setStatus({ text: "Load failed: invalid scene", tone: "err" });
      return;
    }
    sceneLoadInProgressRef.current = true;
    api.updateScene(parsed);
    const elements = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    prevSceneSigRef.current = computeSceneSignature(elements, appState);
    prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
    suppressNextDirtyRef.current = true;
    expectedSceneSigRef.current = prevSceneSigRef.current;
    loadSkipRef.current = 3;
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
    sceneLoadInProgressRef,
    setCurrentFileName,
    setIsDirty,
    setStatus,
    suppressNextDirtyRef,
  ]);

  // Autosave temporarily disabled to avoid spamming native save notifications
  // and interfering with explicit save/load actions. Re-enable with a debounced
  // onChange hook if needed, but ensure native UX can tolerate the frequency.

  const { handleLoadFromNative } = useNativeSceneLoader({
    api,
    nativeBridge,
    setStatus,
    setIsDirty,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
  });
  const { handleExportPng, handleExportSvg } = useExportActions(
    api,
    nativeBridge,
    setStatus,
    setExporting,
  );

  const handleSelectTool = (tool: ToolType) => {
    setActiveTool(tool);
    apiRef.current?.setActiveTool({ type: tool });
  };

  return (
    <div className={`app-shell${HIDE_BUILTIN_TOOLBAR ? " hide-builtin-toolbar" : ""}`}>
      <Excalidraw
        theme="light"
        initialData={initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          setApi(api);
          api.setActiveTool({ type: "selection" });
        }}
      >
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
      <ChromeOverlay
        fileName={currentFileName}
        isDirty={isDirty}
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
      />
    </div>
  );
}
