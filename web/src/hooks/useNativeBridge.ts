import { useEffect, useMemo, useState } from "react";
import { isNativeBridgeEvent, type NativeBridge, type NativeBridgeCallbacks, type NativeBridgeEvent } from "../native-bridge";

type Handlers = {
  onNativeMessage?: (payload?: NativeBridgeEvent) => void;
  onSceneLoaded?: (sceneJson: string, fileName?: string) => void;
};

const emptyCallbacks: NativeBridgeCallbacks = {};

/**
 * Check if we're running inside the native Android wrapper.
 * This uses the injected `__NATIVE_PRESENT__` flag which is set
 * by the Android WebViewClient before the page loads.
 */
export function isNativeContext(): boolean {
  return typeof window !== "undefined" && window.__NATIVE_PRESENT__ === true;
}

/**
 * Get the native platform if running in native context.
 */
export function getNativePlatform(): string | undefined {
  return typeof window !== "undefined" ? window.__NATIVE_PLATFORM__ : undefined;
}

/**
 * Get the native app version if running in native context.
 */
export function getNativeAppVersion(): string | undefined {
  return typeof window !== "undefined" ? window.__NATIVE_APP_VERSION__ : undefined;
}

export function useNativeBridge(handlers: Handlers) {
  const [nativeBridge, setNativeBridge] = useState<NativeBridge | undefined>();
  // Use injected __NATIVE_PRESENT__ for initial state (synchronous detection)
  const [nativePresent, setNativePresent] = useState(() => isNativeContext());

  const callbacks = useMemo<NativeBridgeCallbacks>(() => {
    if (!handlers.onNativeMessage && !handlers.onSceneLoaded) return emptyCallbacks;
    return {
      onNativeMessage: (payload: unknown) => {
        if (!handlers.onNativeMessage) return;
        if (isNativeBridgeEvent(payload)) {
          handlers.onNativeMessage(payload);
          return;
        }
        console.warn("[NativeBridge] Invalid event payload", payload);
        handlers.onNativeMessage({
          event: "onNativeMessage",
          success: false,
          message: "Invalid native event payload",
        });
      },
      onSceneLoaded: (sceneJson: unknown, fileName?: unknown) => {
        if (!handlers.onSceneLoaded) return;
        if (typeof sceneJson === "string") {
          handlers.onSceneLoaded(sceneJson, typeof fileName === "string" ? fileName : undefined);
          return;
        }
        console.warn("[NativeBridge] Invalid scene payload", { sceneJson, fileName });
        // Signal failure via native-message channel so open flows can be rejected.
        handlers.onNativeMessage?.({
          event: "onNativeMessage",
          success: false,
          message: "Invalid native scene payload",
        });
      },
    };
  }, [handlers.onNativeMessage, handlers.onSceneLoaded]);

  useEffect(() => {
    const bridge = window.NativeBridge;
    setNativeBridge(bridge);
    // Also verify with bridge presence (belt and suspenders)
    setNativePresent(isNativeContext() || Boolean(bridge));
  }, []);

  useEffect(() => {
    if (callbacks === emptyCallbacks) return undefined;
    window.NativeBridgeCallbacks = callbacks;
    return () => {
      if (window.NativeBridgeCallbacks) {
        delete window.NativeBridgeCallbacks;
      }
    };
  }, [callbacks]);

  return { nativeBridge, nativePresent } as const;
}

export function useNativeBridgeCallbacks(callbacks: NativeBridgeCallbacks) {
  useEffect(() => {
    window.NativeBridgeCallbacks = callbacks;
    return () => {
      if (window.NativeBridgeCallbacks) {
        delete window.NativeBridgeCallbacks;
      }
    };
  }, [callbacks]);
}
