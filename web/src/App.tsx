import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const EMPTY_SCENE = {
  elements: [],
  appState: {
    viewBackgroundColor: "#0f172a",
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
  const apiRef = useRef<any>(null);
  const [nativePresent, setNativePresent] = useState(false);

  useEffect(() => {
    setNativePresent(Boolean((window as any).NativeBridge));
  }, []);

  const initialData = useMemo(() => EMPTY_SCENE, []);

  return (
    <div
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
        }}
      />
      <NativeStatus present={nativePresent} />
    </div>
  );
}
