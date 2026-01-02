import type { NativeBridge, NativeBridgeCallbacks } from "./native-bridge";
import type { NativeFileHandle } from "./native-bridge";

declare global {
  interface Window {
    NativeBridge?: NativeBridge;
    NativeBridgeCallbacks?: NativeBridgeCallbacks;

    /**
     * Injected by Android native layer before page load.
     * Used to detect native context synchronously on startup.
     */
    __NATIVE_PRESENT__?: boolean;
    __NATIVE_APP_VERSION__?: string;
    __NATIVE_BUILD_LABEL__?: string;
    __NATIVE_GIT_HASH__?: string;
    __NATIVE_PLATFORM__?: "android" | string;

    /**
     * Whether the device supports Boox native stylus drawing.
     * Injected by Android native layer for Boox/Onyx e-ink devices.
     */
    __NATIVE_HAS_BOOX_DRAWING__?: boolean;

    /**
     * Called by Android native layer when a native drawing is complete.
     * Receives the PNG as a base64 data URL along with dimensions.
     */
    insertNativeDrawing?: (dataUrl: string, width: number, height: number) => void;

    /**
     * Called by Android native layer when native drawing is cancelled.
     */
    cancelNativeDrawing?: () => void;

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
