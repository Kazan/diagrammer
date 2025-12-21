import type { NativeBridge, NativeBridgeCallbacks } from "./native-bridge";

declare global {
  interface Window {
    NativeBridge?: NativeBridge;
    NativeBridgeCallbacks?: NativeBridgeCallbacks;
  }
}

export {};
