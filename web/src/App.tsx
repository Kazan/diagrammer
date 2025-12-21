import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  WelcomeScreen,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { CustomToolbar, type ToolType } from "./components/CustomToolbar";

const EMPTY_SCENE = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ecececff",
    theme: "light" as const,
  },
  files: {},
};

const statusColors = {
  ok: "#3fcf8e",
  warn: "#f59e0b",
  err: "#ef4444",
};

type StatusMessage = { text: string; tone: keyof typeof statusColors };

const stripExtension = (name?: string | null) => {
  if (!name) return "Unsaved";
  const trimmed = name.replace(/\.(excalidraw(?:\.json)?|json)$/i, "");
  return trimmed || "Unsaved";
};

function NativeStatus({
  present,
  lastSaved,
  status,
}: {
  present: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
}) {
  const color = present ? statusColors.ok : statusColors.warn;
  return (
    <div className="native-status" style={{ borderColor: `${color}66`, color }}>
      <div className="native-status__row">
        <span className="native-status__dot" style={{ backgroundColor: color }} />
        NativeBridge: {present ? "ready" : "not available"}
      </div>
      {lastSaved ? (
        <div className="native-status__meta">Saved at {lastSaved.toLocaleTimeString()}</div>
      ) : (
        <div className="native-status__meta">No saves yet</div>
      )}
      {status ? (
        <div className="native-status__banner" style={{ borderColor: `${statusColors[status.tone]}66` }}>
          {status.text}
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [nativePresent, setNativePresent] = useState(false);
  const [nativeBridge, setNativeBridge] = useState<Window["NativeBridge"]>();
  const startupScene = useMemo(() => {
    const saved = window.NativeBridge?.loadScene?.();
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (err) {
      console.warn("Failed to parse saved scene", err);
      return null;
    }
  }, []);
  const initialStoredName = useMemo(
    () => stripExtension(window.NativeBridge?.getCurrentFileName?.() ?? ""),
    []
  );
  const [pendingScene, setPendingScene] = useState(startupScene);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("rectangle");
  const [currentFileName, setCurrentFileName] = useState(initialStoredName || "Unsaved");
  const [isDirty, setIsDirty] = useState(false);
  const HIDE_BUILTIN_TOOLBAR = false;
  const lastDialogRef = useRef<string | null>(null);
  const openFileResolveRef = useRef<((handles: any[]) => void) | null>(null);
  const openFileRejectRef = useRef<((reason: any) => void) | null>(null);
  const currentFileHandleRef = useRef<any | null>(null);
  const hasCurrentFileRef = useRef(initialStoredName !== "Unsaved");
  const prevNonEmptySceneRef = useRef(false);
  const hydratedSceneRef = useRef(false);
  const suppressNextDirtyRef = useRef(false);
  const prevSceneSigRef = useRef<string | null>(null);

  useEffect(() => {
    // Ensure a clean slate even if the WebView kept localStorage (e.g., across reinstalls on some devices).
    try {
      window.localStorage.clear();
    } catch (_err) {
      // ignore if storage unavailable
    }
  }, []);

  useEffect(() => {
    const bridge = window.NativeBridge;
    setNativeBridge(bridge);
    setNativePresent(Boolean(bridge));
  }, []);

  useEffect(() => {
    if (!nativeBridge?.openSceneFromDocument) return undefined;
    const originalShowPicker = (window as any).showOpenFilePicker;
    (window as any).showOpenFilePicker = () =>
      new Promise((resolve, reject) => {
        openFileResolveRef.current = (handles) => {
          resolve(handles);
          openFileResolveRef.current = null;
          openFileRejectRef.current = null;
        };
        openFileRejectRef.current = (reason) => {
          reject(reason);
          openFileResolveRef.current = null;
          openFileRejectRef.current = null;
        };
        nativeBridge.openSceneFromDocument();
      });
    return () => {
      (window as any).showOpenFilePicker = originalShowPicker;
    };
  }, [nativeBridge]);

  const initialData = useMemo(() => startupScene ?? EMPTY_SCENE, [startupScene]);

  const computeSceneSignature = useCallback((elements: any[], appState: any) => {
    const elemSig = elements
      .map((el) => `${el.id}:${el.version}:${el.isDeleted ? 1 : 0}`)
      .join("|");
    const appSig = [
      appState?.viewBackgroundColor ?? "",
      appState?.theme ?? "",
      appState?.gridSize ?? "",
    ].join(":");
    return `${elemSig}::${appSig}`;
  }, []);

  const computeSceneSignatureFromScene = useCallback(
    (scene: any) => computeSceneSignature(scene?.elements ?? [], scene?.appState ?? {}),
    [computeSceneSignature]
  );

  const EMPTY_SCENE_SIG = useMemo(
    () => computeSceneSignature(EMPTY_SCENE.elements, EMPTY_SCENE.appState),
    [computeSceneSignature]
  );

  const clearFileAssociation = useCallback(() => {
    hasCurrentFileRef.current = false;
    currentFileHandleRef.current = null;
    if (api) {
      const appState = api.getAppState();
      api.updateScene({ appState: { ...appState, fileHandle: null } });
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const elements = api.getSceneElements();
    hydratedSceneRef.current = true;
    prevNonEmptySceneRef.current = elements.length > 0;
    prevSceneSigRef.current = computeSceneSignature(elements, api.getAppState());
  }, [api, computeSceneSignature]);

  const serializeScenePayload = useCallback(
    (opts?: { includeDeleted?: boolean }) => {
      if (!api) {
        throw new Error("Canvas not ready");
      }
      const includeDeleted = opts?.includeDeleted ?? true;
      const elements = includeDeleted
        ? api.getSceneElementsIncludingDeleted()
        : api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      return serializeAsJSON(elements, appState, files, "local");
    },
    [api]
  );

  const createNativeFileHandle = useCallback(
    (rawName: string, fileContent = "") => {
      const baseName = stripExtension(rawName);
      const fileName = `${baseName}.excalidraw`;
      let currentContent = fileContent;
      return {
        kind: "file" as const,
        name: fileName,
        async getFile() {
          return new File([currentContent], fileName, { type: "application/json" });
        },
        async createWritable() {
          if (!window.WritableStream) {
            throw new Error("WritableStream unavailable");
          }

          const normalizeToString = async (value: any): Promise<string> => {
            if (typeof value === "string") return value;
            if (value instanceof Blob) return await value.text();
            if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
            if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as ArrayBufferView);
            if (typeof value?.text === "function") return await value.text();
            if (typeof value?.data !== "undefined") return normalizeToString(value.data);
            return JSON.stringify(value);
          };

          const writable = new WritableStream<string>({
            async write(chunk) {
              currentContent = await normalizeToString(chunk);
            },
            async close() {
              if (!nativeBridge) {
                throw new Error("Native file save unavailable");
              }
              console.log("[NativeBridge] close() invoked", {
                hasCurrentFile: hasCurrentFileRef.current,
                name: fileName,
              });
              if (hasCurrentFileRef.current) {
                console.log("[NativeBridge] saveSceneToCurrentDocument ->", {
                  bytes: currentContent.length,
                  name: fileName,
                });
                nativeBridge.saveSceneToCurrentDocument(currentContent);
              } else {
                console.log("[NativeBridge] saveSceneToDocument ->", {
                  bytes: currentContent.length,
                  name: fileName,
                });
                nativeBridge.saveSceneToDocument(currentContent);
              }
            },
            abort() {
              currentContent = fileContent;
            },
          });

          return writable;
        },
      };
    },
    [nativeBridge]
  );

  const applyFileHandleToAppState = useCallback(
    (handle: any) => {
      if (!api) return;
      currentFileHandleRef.current = handle;
      const appState = api.getAppState();
      api.updateScene({ appState: { ...appState, fileHandle: handle } });
    },
    [api]
  );

  const syncFileHandle = useCallback(
    (rawName: string, fileContent = "", hasFileHandle = true) => {
      const displayName = stripExtension(rawName || "Unsaved");
      const handle = createNativeFileHandle(displayName || "Unsaved", fileContent);
      currentFileHandleRef.current = handle;
      hasCurrentFileRef.current = hasFileHandle;
      setCurrentFileName(displayName || "Unsaved");
      if (api) {
        applyFileHandleToAppState(handle);
      }
      return handle;
    },
    [api, applyFileHandleToAppState, createNativeFileHandle]
  );

  useEffect(() => {
    if (!api) return;
    if (hasCurrentFileRef.current && !currentFileHandleRef.current && currentFileName !== "Unsaved") {
      syncFileHandle(currentFileName, "", hasCurrentFileRef.current);
    }
  }, [api, currentFileName, syncFileHandle]);

  useEffect(() => {
    if (!nativeBridge || !api) return undefined;
    const originalSavePicker = (window as any).showSaveFilePicker;
    (window as any).showSaveFilePicker = async (opts?: { suggestedName?: string }) => {
      const base = stripExtension(opts?.suggestedName || currentFileName || "diagram");
      const handle = createNativeFileHandle(base);
      currentFileHandleRef.current = handle;
      applyFileHandleToAppState(handle);
      return handle;
    };
    return () => {
      (window as any).showSaveFilePicker = originalSavePicker;
    };
  }, [api, applyFileHandleToAppState, createNativeFileHandle, currentFileName, nativeBridge]);

  const performSave = useCallback(() => {
    if (!api || !nativeBridge?.saveScene) return;
    try {
      const payload = serializeScenePayload();
      nativeBridge.saveScene(payload);
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge, serializeScenePayload]);


  const handleSaveNow = useCallback(() => {
    if (!nativeBridge?.saveScene) {
      setStatus({ text: "Native save unavailable", tone: "warn" });
      return;
    }
    performSave();
  }, [nativeBridge, performSave]);

  const handleSaveToDocument = useCallback(() => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.saveSceneToDocument) {
      setStatus({ text: "Native document picker unavailable", tone: "warn" });
      return;
    }
    try {
      nativeBridge.saveSceneToDocument(serializeScenePayload());
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge, serializeScenePayload]);

  useEffect(() => {
    if (!api) return undefined;
    const unsubscribe = api.onChange((elements, appState) => {
      const tool = appState.activeTool?.type as ToolType | undefined;
      if (tool) {
        setActiveTool(tool);
      }

      const isCleared = hydratedSceneRef.current && prevNonEmptySceneRef.current && elements.length === 0;
      prevNonEmptySceneRef.current = elements.length > 0;
      if (hydratedSceneRef.current) {
        const sig = computeSceneSignature(elements, appState);
        if (suppressNextDirtyRef.current) {
          suppressNextDirtyRef.current = false;
        } else if (prevSceneSigRef.current && sig !== prevSceneSigRef.current) {
          setIsDirty(true);
        }
        if (elements.length === 0 && sig === EMPTY_SCENE_SIG && prevSceneSigRef.current !== EMPTY_SCENE_SIG) {
          setCurrentFileName("Unsaved");
          setIsDirty(false);
          suppressNextDirtyRef.current = true;
          prevSceneSigRef.current = EMPTY_SCENE_SIG;
          prevNonEmptySceneRef.current = false;
          clearFileAssociation();
          setStatus({ text: "Canvas cleared", tone: "warn" });
        }
      }
      if (isCleared) {
        setCurrentFileName("Unsaved");
        setIsDirty(false);
        suppressNextDirtyRef.current = true;
        prevSceneSigRef.current = computeSceneSignature([], {
          ...appState,
          viewBackgroundColor: EMPTY_SCENE.appState.viewBackgroundColor,
          theme: EMPTY_SCENE.appState.theme,
        });
        setStatus({ text: "Canvas cleared", tone: "warn" });
      }

      const dialogName = appState.openDialog?.name ?? null;
      if (dialogName !== lastDialogRef.current) {
        lastDialogRef.current = dialogName;
        if (dialogName === "jsonExport") {
          handleSaveToDocument();
          api.updateScene({ appState: { ...appState, openDialog: null } });
        }
      }
    });
    return () => unsubscribe();
  }, [api, handleSaveToDocument]);

  const handleNativeMessage = useCallback(
    (payload?: { event?: string; success?: boolean; message?: string; fileName?: string }) => {
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
              prevSceneSigRef.current = computeSceneSignature(
                api.getSceneElementsIncludingDeleted(),
                api.getAppState()
              );
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
            new DOMException(payload.message ?? "Open canceled", "AbortError")
          );
          openFileResolveRef.current = null;
          openFileRejectRef.current = null;
        }
      }
      setStatus({ text: payload.message ?? "Native event", tone: "warn" });
    },
    [currentFileName, syncFileHandle]
  );

  useEffect(() => {
    window.NativeBridgeCallbacks = {
      onNativeMessage: handleNativeMessage,
      onSceneLoaded: (sceneJson: string, fileName?: string) => {
        console.log("[NativeBridge] onSceneLoaded", { fileName, bytes: sceneJson.length });
        const resolvedName = fileName?.trim() ? fileName : "Unsaved";
        const displayName = stripExtension(resolvedName);
        const handle = syncFileHandle(displayName, sceneJson, true);
        if (openFileResolveRef.current) {
          openFileResolveRef.current([handle]);
        } else if (api) {
          try {
            const parsed = JSON.parse(sceneJson);
            api.updateScene(parsed);
            setIsDirty(false);
            suppressNextDirtyRef.current = true;
            prevSceneSigRef.current = computeSceneSignatureFromScene(parsed);
            setStatus({ text: `Loaded${displayName !== "Unsaved" ? `: ${displayName}` : ""}`, tone: "ok" });
          } catch (err) {
            setStatus({ text: `Load failed: ${String(err)}`, tone: "err" });
          }
        }
        openFileResolveRef.current = null;
        openFileRejectRef.current = null;
      },
    };
    return () => {
      if (window.NativeBridgeCallbacks) {
        delete window.NativeBridgeCallbacks;
      }
    };
  }, [api, handleNativeMessage, syncFileHandle]);

  useEffect(() => {
    if (!status) return undefined;
    const id = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (!api || !pendingScene) return;
    api.updateScene(pendingScene);
    setPendingScene(null);
    hydratedSceneRef.current = true;
    prevNonEmptySceneRef.current = Array.isArray((pendingScene as any)?.elements)
      ? (pendingScene as any).elements.length > 0
      : false;
    setIsDirty(false);
    suppressNextDirtyRef.current = true;
    prevSceneSigRef.current = computeSceneSignatureFromScene(pendingScene);
    setStatus({ text: "Restored previous drawing", tone: "ok" });
  }, [api, pendingScene, computeSceneSignatureFromScene]);

  // Autosave temporarily disabled to avoid spamming native save notifications
  // and interfering with explicit save/load actions. Re-enable with a debounced
  // onChange hook if needed, but ensure native UX can tolerate the frequency.

  const handleLoadFromNative = useCallback(() => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.loadScene) {
      setStatus({ text: "Native loader unavailable", tone: "warn" });
      return;
    }
    const saved = nativeBridge.loadScene();
    if (!saved) {
      setStatus({ text: "No saved drawing found", tone: "warn" });
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      api.updateScene(parsed);
      setIsDirty(false);
      suppressNextDirtyRef.current = true;
      prevSceneSigRef.current = computeSceneSignatureFromScene(parsed);
      setStatus({ text: "Loaded saved drawing", tone: "ok" });
    } catch (err) {
      setStatus({ text: `Load failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge, computeSceneSignatureFromScene]);

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
  }, [api, blobToDataUrl, nativeBridge]);

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
  }, [api, nativeBridge]);

  const handleSelectTool = (tool: ToolType) => {
    setActiveTool(tool);
    apiRef.current?.setActiveTool({ type: tool });
  };

  return (
    <div
      className={HIDE_BUILTIN_TOOLBAR ? "hide-builtin-toolbar" : undefined}
      style={{
        height: "100vh",
        width: "100vw",
        background: "#f5f5f5",
        color: "#0f172a",
      }}
    >
      <Excalidraw
        theme="light"
        initialData={initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          setApi(api);
          api.setActiveTool({ type: "rectangle" });
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
      <div className={`file-chip${isDirty ? " is-dirty" : ""}`} aria-label="Current file">
        {currentFileName || "Unsaved"}
        {isDirty ? " *" : ""}
      </div>
      <CustomToolbar activeTool={activeTool} onSelect={handleSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
    </div>
  );
}
