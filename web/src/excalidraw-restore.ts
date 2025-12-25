import { CaptureUpdateAction, restore, THEME } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";

type RestoredScene = ReturnType<typeof restore>;
type RestoreInput = Parameters<typeof restore>[0];
type RestoreData = Exclude<RestoreInput, null>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object");
};

const getRestoreElements = (raw: Record<string, unknown>): RestoreData["elements"] | undefined => {
  const elements = raw["elements"];
  if (!Array.isArray(elements)) return undefined;
  return elements as RestoreData["elements"];
};

const getRestoreAppState = (raw: Record<string, unknown>): RestoreData["appState"] | undefined => {
  const appState = raw["appState"];
  if (!isRecord(appState)) return undefined;
  return appState as RestoreData["appState"];
};

const getRestoreFiles = (raw: Record<string, unknown>): RestoreData["files"] | undefined => {
  const files = raw["files"];
  if (!isRecord(files)) return undefined;
  return files as RestoreData["files"];
};

export function restoreSceneForApp(
  raw: unknown,
  localAppState?: Partial<AppState> | null,
): RestoredScene {
  if (!isRecord(raw)) {
    return restore(null, localAppState ?? null, null, {
      repairBindings: true,
      refreshDimensions: true,
    });
  }

  const data: RestoreData = {
    elements: getRestoreElements(raw) ?? ([] as unknown as RestoreData["elements"]),
    appState: getRestoreAppState(raw) ?? ({} as RestoreData["appState"]),
    files: getRestoreFiles(raw) ?? ({} as RestoreData["files"]),
  };

  return restore(data, localAppState ?? null, null, {
    repairBindings: true,
    refreshDimensions: true,
  });
}

export function buildDefaultLocalAppStateOverrides(opts?: {
  viewBackgroundColor?: string;
  objectsSnapModeEnabled?: boolean;
  zoomValue?: number;
}): Partial<AppState> {
  return {
    viewBackgroundColor: opts?.viewBackgroundColor ?? "#ffffff",
    objectsSnapModeEnabled: opts?.objectsSnapModeEnabled ?? true,
    theme: THEME.LIGHT,
    zoom: {
      value: ((opts?.zoomValue ?? 1) as NormalizedZoomValue),
    },
  };
}

export function applyRestoredScene(api: ExcalidrawImperativeAPI, restored: RestoredScene) {
  api.resetScene({ resetLoadingState: true });
  api.updateScene({
    elements: restored.elements,
    appState: restored.appState,
    captureUpdate: CaptureUpdateAction.NEVER,
  });

  const files = Object.values(restored.files ?? {});
  if (files.length) {
    api.addFiles(files);
  }
}
