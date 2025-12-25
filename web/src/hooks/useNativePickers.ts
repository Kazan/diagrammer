import { useCallback, useEffect } from "react";
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
  const openWithNativePicker = useCallback(() => {
    const bridge = nativeBridge;
    const openSceneFromDocument = bridge?.openSceneFromDocument;
    if (!bridge || !openSceneFromDocument) {
      return Promise.reject(new DOMException("Native open unavailable", "NotSupportedError"));
    }
    return new Promise<NativeFileHandle[]>((resolve, reject) => {
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
      // Call through the injected bridge instance to keep Java interface context intact.
      openSceneFromDocument.call(bridge);
    });
  }, [nativeBridge, openFileRejectRef, openFileResolveRef]);

  // Hook the native open picker
  useEffect(() => {
    if (!nativeBridge?.openSceneFromDocument) return undefined;
    const originalShowPicker = window.showOpenFilePicker;
    window.showOpenFilePicker = () => openWithNativePicker();
    return () => {
      window.showOpenFilePicker = originalShowPicker;
    };
  }, [nativeBridge, openWithNativePicker]);

  // Hook the native save picker
  useEffect(() => {
    if (!nativeBridge || !api) return undefined;
    const originalSavePicker = window.showSaveFilePicker;
    window.showSaveFilePicker = async (opts?: { suggestedName?: string }) => {
      const base = stripExtension(opts?.suggestedName || currentFileName || "diagram");
      const handle = createNativeFileHandle(base);
      applyFileHandleToAppState(handle);
      return handle;
    };
    return () => {
      window.showSaveFilePicker = originalSavePicker;
    };
  }, [api, applyFileHandleToAppState, createNativeFileHandle, currentFileName, nativeBridge]);

  return { openWithNativePicker } as const;
}
