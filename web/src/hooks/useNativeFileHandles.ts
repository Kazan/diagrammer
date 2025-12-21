import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NativeBridge, NativeFileHandle } from "../native-bridge";
import { stripExtension } from "../scene-utils";

type Options = {
  api: ExcalidrawImperativeAPI | null;
  nativeBridge?: NativeBridge;
  initialFileName: string;
  setCurrentFileName: (name: string) => void;
  suppressNextDirtyRef: MutableRefObject<boolean>;
};

export function useNativeFileHandles({
  api,
  nativeBridge,
  initialFileName,
  setCurrentFileName,
  suppressNextDirtyRef,
}: Options) {
  const currentFileHandleRef = useRef<NativeFileHandle | null>(null);
  const hasCurrentFileRef = useRef(initialFileName !== "Unsaved");

  const createNativeFileHandle = useCallback(
    (rawName: string, fileContent = ""): NativeFileHandle => {
      const baseName = stripExtension(rawName);
      const fileName = `${baseName}.excalidraw`;
      let currentContent = fileContent;
      return {
        kind: "file",
        name: fileName,
        async getFile() {
          return new File([currentContent], fileName, { type: "application/json" });
        },
        async createWritable() {
          if (!window.WritableStream) {
            throw new Error("WritableStream unavailable");
          }

          const normalizeToString = async (value: any): Promise<string> => {
            if (typeof value === "string") return value;
            if (value instanceof Blob) return await value.text();
            if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
            if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as ArrayBufferView);
            if (typeof value?.text === "function") return await value.text();
            if (typeof value?.data !== "undefined") return normalizeToString(value.data);
            return JSON.stringify(value);
          };

          currentContent = "";

          const writable = new WritableStream<any>({
            async write(chunk: any) {
              const isWriteParams = chunk && typeof chunk === "object" && "type" in chunk;
              if (isWriteParams) {
                const kind = (chunk as any).type;
                if (kind === "write") {
                  const data = (chunk as any).data;
                  const position = (chunk as any).position;
                  const text = await normalizeToString(data);
                  if (typeof position === "number" && position >= 0) {
                    const prefix = currentContent.slice(0, position);
                    const suffix = currentContent.slice(position + text.length);
                    currentContent = `${prefix}${text}${suffix}`;
                  } else {
                    currentContent += text;
                  }
                  return;
                }
                if (kind === "truncate") {
                  const size = (chunk as any).size ?? 0;
                  currentContent = currentContent.slice(0, size);
                  return;
                }
              }
              const text = await normalizeToString(chunk);
              currentContent += text;
            },
            async close() {
              if (!nativeBridge) {
                throw new Error("Native file save unavailable");
              }
              if (hasCurrentFileRef.current) {
                nativeBridge?.saveSceneToCurrentDocument?.(currentContent);
              } else {
                nativeBridge?.saveSceneToDocument?.(currentContent);
              }
            },
            abort() {
              currentContent = fileContent;
            },
          });

          return writable;
        },
      };
    },
    [nativeBridge]
  );

  const applyFileHandleToAppState = useCallback(
    (handle: NativeFileHandle, opts?: { suppressDirty?: boolean }) => {
      if (!api) return;
      if (opts?.suppressDirty) {
        suppressNextDirtyRef.current = true;
      }
      currentFileHandleRef.current = handle;
      const appState = api.getAppState();
      api.updateScene({ appState: { ...appState, fileHandle: handle } });
    },
    [api, suppressNextDirtyRef]
  );

  const syncFileHandle = useCallback(
    (
      rawName: string,
      fileContent = "",
      hasFileHandle = true,
      opts?: { suppressDirty?: boolean },
    ) => {
      const displayName = stripExtension(rawName || "Unsaved");
      const handle = createNativeFileHandle(displayName || "Unsaved", fileContent);
      currentFileHandleRef.current = handle;
      hasCurrentFileRef.current = hasFileHandle;
      setCurrentFileName(displayName || "Unsaved");
      if (api) {
        applyFileHandleToAppState(handle, opts);
      }
      return handle;
    },
    [api, applyFileHandleToAppState, createNativeFileHandle, setCurrentFileName]
  );

  const clearFileAssociation = useCallback(() => {
    hasCurrentFileRef.current = false;
    currentFileHandleRef.current = null;
    if (api) {
      const appState = api.getAppState();
      api.updateScene({ appState: { ...appState, fileHandle: null } });
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    if (hasCurrentFileRef.current && !currentFileHandleRef.current && initialFileName !== "Unsaved") {
      syncFileHandle(initialFileName, "", hasCurrentFileRef.current);
    }
  }, [api, initialFileName, syncFileHandle]);

  return {
    createNativeFileHandle,
    syncFileHandle,
    applyFileHandleToAppState,
    clearFileAssociation,
    currentFileHandleRef,
    hasCurrentFileRef,
  } as const;
}
