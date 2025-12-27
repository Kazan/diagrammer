import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NativeBridge, NativeFileHandle } from "../native-bridge";
import { buildSceneSaveEnvelope, stripExtension } from "../scene-utils";

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

  type WriteParams =
    | { type: "write"; data?: unknown; position?: number }
    | { type: "truncate"; size?: number };

  const isWriteParams = (chunk: unknown): chunk is WriteParams => {
    return Boolean(chunk && typeof chunk === "object" && "type" in (chunk as Record<string, unknown>));
  };

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

          const normalizeToString = async (value: unknown): Promise<string> => {
            if (typeof value === "string") return value;
            if (value instanceof Blob) return await value.text();
            if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
            if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as ArrayBufferView);
            if (value && typeof value === "object") {
              const maybeText = (value as { text?: unknown }).text;
              if (typeof maybeText === "function") {
                return await (maybeText as () => Promise<string>).call(value);
              }
              const maybeData = (value as { data?: unknown }).data;
              if (typeof maybeData !== "undefined") return normalizeToString(maybeData);
            }
            return JSON.stringify(value);
          };

          currentContent = "";

          const writable = new WritableStream<unknown>({
            async write(chunk: unknown) {
              if (isWriteParams(chunk)) {
                if (chunk.type === "write") {
                  const data = chunk.data;
                  const position = chunk.position;
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
                if (chunk.type === "truncate") {
                  const size = chunk.size ?? 0;
                  currentContent = currentContent.slice(0, Math.max(0, size));
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
              const envelope = await buildSceneSaveEnvelope(currentContent, fileName);
              const serialized = JSON.stringify(envelope);
              if (hasCurrentFileRef.current) {
                if (nativeBridge.persistSceneToCurrentDocument) {
                  nativeBridge.persistSceneToCurrentDocument(serialized);
                } else if (nativeBridge.saveSceneToCurrentDocument) {
                  nativeBridge.saveSceneToCurrentDocument(envelope.json);
                } else if (nativeBridge.persistScene) {
                  nativeBridge.persistScene(serialized);
                } else {
                  nativeBridge.saveScene?.(envelope.json);
                }
              } else {
                if (nativeBridge.persistSceneToDocument) {
                  nativeBridge.persistSceneToDocument(serialized);
                } else if (nativeBridge.saveSceneToDocument) {
                  nativeBridge.saveSceneToDocument(envelope.json);
                } else if (nativeBridge.persistScene) {
                  nativeBridge.persistScene(serialized);
                } else {
                  nativeBridge.saveScene?.(envelope.json);
                }
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
