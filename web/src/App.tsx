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
  const [pendingScene, setPendingScene] = useState(startupScene);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("rectangle");
  const HIDE_BUILTIN_TOOLBAR = false;
  const lastDialogRef = useRef<string | null>(null);
  const openFileResolveRef = useRef<((handles: any[]) => void) | null>(null);
  const openFileRejectRef = useRef<((reason: any) => void) | null>(null);

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
    (payload?: { event?: string; success?: boolean; message?: string }) => {
      if (!payload) return;
      if (payload.event === "onSaveComplete") {
        if (payload.success) {
          setLastSaved(new Date());
          setStatus({ text: "Saved to device", tone: "ok" });
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
    []
  );

  useEffect(() => {
    window.NativeBridgeCallbacks = {
      onNativeMessage: handleNativeMessage,
      onSceneLoaded: (sceneJson: string) => {
        if (openFileResolveRef.current) {
          const file = new File([sceneJson], "diagram.excalidraw", {
            type: "application/json",
          });
          const handle = {
            kind: "file" as const,
            name: file.name,
            getFile: async () => file,
          };
          openFileResolveRef.current([handle]);
        } else if (api) {
          try {
            const parsed = JSON.parse(sceneJson);
            api.updateScene(parsed);
            setStatus({ text: "Loaded from file", tone: "ok" });
          } catch (err) {
            setStatus({ text: `Load failed: ${String(err)}`, tone: "err" });
          }
        }
        openFileResolveRef.current = null;
        openFileRejectRef.current = null;
      },
    };
    return () => {
      if (window.NativeBridgeCallbacks?.onNativeMessage === handleNativeMessage) {
        delete window.NativeBridgeCallbacks;
      }
    };
  }, [api, handleNativeMessage]);

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

  const saveTimeoutRef = useRef<number>();

  const scheduleSave = useCallback(() => {
    if (!nativeBridge?.saveScene) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(performSave, 600);
  }, [nativeBridge, performSave]);

  useEffect(() => {
    if (!api) return undefined;
    const unsubscribe = api.onChange(() => scheduleSave());
    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [api, scheduleSave]);

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
      <CustomToolbar activeTool={activeTool} onSelect={handleSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
    </div>
  );
}
