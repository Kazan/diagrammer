import type { NativeBridge, NativeBridgeCallbacks } from "./native-bridge";
import type { NativeFileHandle } from "./native-bridge";

declare global {
  interface Window {
    NativeBridge?: NativeBridge;
    NativeBridgeCallbacks?: NativeBridgeCallbacks;

    /**
     * Optional file picker APIs (overridden in Android WebView to route through the native bridge).
     * We intentionally keep these types broad because the browser versions (if present) return
     * platform file handles, while our native shim returns bridge-backed handles.
     */
    showOpenFilePicker?: (...args: unknown[]) => Promise<unknown>;
    showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<NativeFileHandle>;
  }
}

export {};
