import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { CustomToolbar, type ToolType } from "./components/CustomToolbar";

const EMPTY_SCENE = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ecececff",
    theme: "dark" as const,
  },
  files: {},
};

const statusColors = {
  ok: "#3fcf8e",
  warn: "#f59e0b",
  err: "#ef4444",
};

function NativeStatus({ present }: { present: boolean }) {
  const color = present ? statusColors.ok : statusColors.warn;
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${color}66`,
        background: "#0b1220cc",
        color,
        fontSize: 12,
        letterSpacing: 0.2,
      }}
    >
      NativeBridge: {present ? "ready" : "not available"}
    </div>
  );
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [nativePresent, setNativePresent] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>("rectangle");
  const HIDE_BUILTIN_TOOLBAR = false;

  useEffect(() => {
    setNativePresent(Boolean((window as any).NativeBridge));
  }, []);

  const initialData = useMemo(() => EMPTY_SCENE, []);

  useEffect(() => {
    if (!api) {
      return undefined;
    }
    const unsubscribe = api.onChange((_, appState) => {
      const tool = appState.activeTool?.type as ToolType | undefined;
      if (tool) {
        setActiveTool(tool);
      }
    });
    return () => unsubscribe();
  }, [api]);

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
        background: "#0b1220",
        color: "#e2e8f0",
      }}
    >
      <Excalidraw
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
      <NativeStatus present={nativePresent} />
    </div>
  );
}
