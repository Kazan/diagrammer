import { useEffect, useMemo, useState } from "react";
import type { NativeBridge, NativeBridgeCallbacks, NativeBridgeEvent } from "../native-bridge";

type Handlers = {
  onNativeMessage?: (payload?: NativeBridgeEvent) => void;
  onSceneLoaded?: (sceneJson: string, fileName?: string) => void;
};

const emptyCallbacks: NativeBridgeCallbacks = {};

export function useNativeBridge(handlers: Handlers) {
  const [nativeBridge, setNativeBridge] = useState<NativeBridge | undefined>();
  const [nativePresent, setNativePresent] = useState(false);

  const callbacks = useMemo<NativeBridgeCallbacks>(() => {
    if (!handlers.onNativeMessage && !handlers.onSceneLoaded) return emptyCallbacks;
    return {
      onNativeMessage: handlers.onNativeMessage,
      onSceneLoaded: handlers.onSceneLoaded,
    };
  }, [handlers.onNativeMessage, handlers.onSceneLoaded]);

  useEffect(() => {
    const bridge = window.NativeBridge;
    setNativeBridge(bridge);
    setNativePresent(Boolean(bridge));
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
