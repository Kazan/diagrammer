import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import { buildSceneSaveEnvelope, type SceneSaveEnvelope } from "../scene-utils";

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

  const buildSceneEnvelope = useCallback(
    async (opts?: { includeDeleted?: boolean; suggestedName?: string }): Promise<SceneSaveEnvelope> => {
      const json = serializeScenePayload(opts);
      return buildSceneSaveEnvelope(json, opts?.suggestedName);
    },
    [serializeScenePayload]
  );

  return { serializeScenePayload, buildSceneEnvelope } as const;
}
