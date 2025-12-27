import type { SceneSaveEnvelope } from "./scene-utils";

export type NativeBridgeEvent =
  | {
      event: "onSaveComplete";
      success: boolean;
      fileName?: string;
      message?: string;
    }
  | {
      event: "onExportComplete";
      success: boolean;
      message?: string;
    }
  | {
      event: "onNativeMessage";
      success?: boolean;
      message?: string;
    }
  | {
      event?: string;
      success?: boolean;
      message?: string;
      fileName?: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object");
};

export const isNativeBridgeEvent = (value: unknown): value is NativeBridgeEvent => {
  if (!isRecord(value)) return false;
  if ("event" in value && typeof value.event !== "undefined" && typeof value.event !== "string") return false;
  if ("success" in value && typeof value.success !== "undefined" && typeof value.success !== "boolean") return false;
  if ("message" in value && typeof value.message !== "undefined" && typeof value.message !== "string") return false;
  if ("fileName" in value && typeof value.fileName !== "undefined" && typeof value.fileName !== "string") return false;
  return true;
};

export type NativeBridge = {
  // Stateless, metadata-rich saves (preferred)
  persistScene?: (payload: SceneSaveEnvelope | string) => void;
  persistSceneToDocument?: (payload: SceneSaveEnvelope | string) => void;
  persistSceneToCurrentDocument?: (payload: SceneSaveEnvelope | string) => void;
  // Legacy string-only saves
  saveScene?: (json: string) => void;
  saveSceneToDocument?: (json: string) => void;
  saveSceneToCurrentDocument?: (json: string) => void;
  openSceneFromDocument?: () => void;
  loadScene?: () => string | null;
  getCurrentFileName?: () => string | null;
  exportPng?: (dataUrl: string) => void;
  exportSvg?: (dataUrl: string) => void;
};

export type NativeBridgeCallbacks = {
  /**
   * NOTE: values come from the native layer (Android WebView) and must be treated as untrusted.
   * We intentionally accept unknown here and validate in our bridge glue.
   */
  onNativeMessage?: (payload: unknown) => void;
  onSceneLoaded?: (sceneJson: unknown, fileName?: unknown) => void;
};

export type NativeFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableStream<any>>;
};
