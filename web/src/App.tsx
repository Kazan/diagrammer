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
  const HIDE_BUILTIN_TOOLBAR = false;
  const lastDialogRef = useRef<string | null>(null);
  const openFileResolveRef = useRef<((handles: any[]) => void) | null>(null);
  const openFileRejectRef = useRef<((reason: any) => void) | null>(null);
  const currentFileHandleRef = useRef<any | null>(null);
  const hasCurrentFileRef = useRef(initialStoredName !== "Unsaved");

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
          return {
            write: async (
              data:
                | Blob
                | string
                | ArrayBuffer
                | ArrayBufferView
                | { text?: () => Promise<string> }
                | { type?: string; data?: unknown }
            ) => {
              const normalizeToString = async (value: any): Promise<string> => {
                if (typeof value === "string") return value;
                if (value instanceof Blob) return await value.text();
                if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
                if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as ArrayBufferView);
                if (typeof value?.text === "function") return await value.text();
                return JSON.stringify(value);
              };

              const payload = typeof data === "object" && data !== null && "type" in data
                ? (data as any).data ?? data
                : data;

              currentContent = await normalizeToString(payload);
            },
            close: async () => {
              if (!nativeBridge) {
                throw new Error("Native file save unavailable");
              }
              if (hasCurrentFileRef.current) {
                nativeBridge.saveSceneToCurrentDocument(currentContent);
              } else {
                nativeBridge.saveSceneToDocument(currentContent);
              }
            },
            abort: async () => {
              currentContent = fileContent;
            },
          };
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

  useEffect(() => {
    if (!api) return;
    if (hasCurrentFileRef.current && !currentFileHandleRef.current && currentFileName !== "Unsaved") {
      const handle = createNativeFileHandle(currentFileName);
      applyFileHandleToAppState(handle);
    }
  }, [api, applyFileHandleToAppState, createNativeFileHandle, currentFileName]);

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
      const elements = api.getSceneElementsIncludingDeleted();
      const appState = api.getAppState();
      const files = api.getFiles();
      const payload = serializeAsJSON(elements, appState, files, "local");
      nativeBridge.saveScene(payload);
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge]);

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
      const elements = api.getSceneElementsIncludingDeleted();
      const appState = api.getAppState();
      const files = api.getFiles();
      const payload = serializeAsJSON(elements, appState, files, "local");
      nativeBridge.saveSceneToDocument(payload);
    } catch (err) {
      setStatus({ text: `Save failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge]);

  useEffect(() => {
    if (!api) return undefined;
    const unsubscribe = api.onChange((_, appState) => {
      const tool = appState.activeTool?.type as ToolType | undefined;
      if (tool) {
        setActiveTool(tool);
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
      if (payload.event === "onSaveComplete") {
        const resolvedName = payload.fileName?.trim() ? payload.fileName : currentFileName;
        const displayName = stripExtension(resolvedName);
        if (payload.success) {
          setLastSaved(new Date());
          setCurrentFileName(displayName);
          const handle = createNativeFileHandle(displayName || "Untitled");
          applyFileHandleToAppState(handle);
          hasCurrentFileRef.current = true;
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
    [applyFileHandleToAppState, createNativeFileHandle, currentFileName]
  );

  useEffect(() => {
    window.NativeBridgeCallbacks = {
      onNativeMessage: handleNativeMessage,
      onSceneLoaded: (sceneJson: string, fileName?: string) => {
        const resolvedName = fileName?.trim() ? fileName : "Unsaved";
        const displayName = stripExtension(resolvedName);
        const handle = createNativeFileHandle(displayName, sceneJson);
        if (openFileResolveRef.current) {
          openFileResolveRef.current([handle]);
          setCurrentFileName(displayName);
          if (api) {
            applyFileHandleToAppState(handle);
          }
          hasCurrentFileRef.current = true;
        } else if (api) {
          try {
            const parsed = JSON.parse(sceneJson);
            api.updateScene(parsed);
            applyFileHandleToAppState(handle);
            setCurrentFileName(displayName);
            hasCurrentFileRef.current = true;
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
  }, [api, applyFileHandleToAppState, createNativeFileHandle, handleNativeMessage]);

  useEffect(() => {
    if (!status) return undefined;
    const id = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (!api || !pendingScene) return;
    api.updateScene(pendingScene);
    setPendingScene(null);
    setStatus({ text: "Restored previous drawing", tone: "ok" });
  }, [api, pendingScene]);

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
      setStatus({ text: "Loaded saved drawing", tone: "ok" });
    } catch (err) {
      setStatus({ text: `Load failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge]);

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
      <div className="file-chip" aria-label="Current file">
        {currentFileName || "Unsaved"}
      </div>
      <CustomToolbar activeTool={activeTool} onSelect={handleSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
    </div>
  );
}
