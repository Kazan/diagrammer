import { useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NativeBridge, NativeFileHandle } from "../native-bridge";
import { stripExtension } from "../scene-utils";

type Options = {
  nativeBridge?: NativeBridge;
  currentFileName: string;
  createNativeFileHandle: (rawName: string) => NativeFileHandle;
  applyFileHandleToAppState: (handle: NativeFileHandle) => void;
  openFileResolveRef: React.MutableRefObject<((handles: NativeFileHandle[]) => void) | null>;
  openFileRejectRef: React.MutableRefObject<((reason: any) => void) | null>;
  api: ExcalidrawImperativeAPI | null;
};

export function useNativePickers({
  nativeBridge,
  currentFileName,
  createNativeFileHandle,
  applyFileHandleToAppState,
  openFileResolveRef,
  openFileRejectRef,
  api,
}: Options) {
  // Hook the native open picker
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
        nativeBridge?.openSceneFromDocument?.();
      });
    return () => {
      (window as any).showOpenFilePicker = originalShowPicker;
    };
  }, [nativeBridge, openFileRejectRef, openFileResolveRef]);

  // Hook the native save picker
  useEffect(() => {
    if (!nativeBridge || !api) return undefined;
    const originalSavePicker = (window as any).showSaveFilePicker;
    (window as any).showSaveFilePicker = async (opts?: { suggestedName?: string }) => {
      const base = stripExtension(opts?.suggestedName || currentFileName || "diagram");
      const handle = createNativeFileHandle(base);
      applyFileHandleToAppState(handle);
      return handle;
    };
    return () => {
      (window as any).showSaveFilePicker = originalSavePicker;
    };
  }, [api, applyFileHandleToAppState, createNativeFileHandle, currentFileName, nativeBridge]);
}
