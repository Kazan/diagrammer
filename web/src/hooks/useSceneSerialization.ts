import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import { buildSceneSaveEnvelope, type SceneSaveEnvelope } from "../scene-utils";

export function useSceneSerialization(api: ExcalidrawImperativeAPI | null) {
  const serializeScenePayload = useCallback(
    () => {
      if (!api) {
        throw new Error("Canvas not ready");
      }
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      return serializeAsJSON(elements, appState, files, "local");
    },
    [api]
  );

  const buildSceneEnvelope = useCallback(
    async (opts?: { suggestedName?: string }): Promise<SceneSaveEnvelope> => {
      const json = serializeScenePayload();
      return buildSceneSaveEnvelope(json, opts?.suggestedName);
    },
    [serializeScenePayload]
  );

  return { buildSceneEnvelope } as const;
}
