import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { serializeAsJSON } from "@excalidraw/excalidraw";

export function useSceneSerialization(api: ExcalidrawImperativeAPI | null) {
  const serializeScenePayload = useCallback(
    (opts?: { includeDeleted?: boolean }) => {
      if (!api) {
        throw new Error("Canvas not ready");
      }
      const includeDeleted = opts?.includeDeleted ?? true;
      const elements = includeDeleted
        ? api.getSceneElementsIncludingDeleted()
        : api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      return serializeAsJSON(elements, appState, files, "local");
    },
    [api]
  );

  return { serializeScenePayload } as const;
}
