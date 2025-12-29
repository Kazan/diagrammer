import { THEME } from "@excalidraw/excalidraw";
import { DEFAULT_SCENE_SETTINGS, getCanvasBackgroundColor } from "./scene-defaults";

export const EMPTY_SCENE = {
  elements: [],
  appState: {
    viewBackgroundColor: getCanvasBackgroundColor("grid"),
    theme: DEFAULT_SCENE_SETTINGS.theme,
    objectsSnapModeEnabled: DEFAULT_SCENE_SETTINGS.objectsSnapModeEnabled,
  },
  files: {},
};

export const stripExtension = (name?: string | null) => {
  if (!name) return "Unsaved";
  const trimmed = name.replace(/\.(excalidraw(?:\.json)?|json)$/i, "");
  return trimmed || "Unsaved";
};

export const computeSceneSignature = (elements: readonly any[], appState: any) => {
  const elemSig = elements
    .map((el) => `${el.id}:${el.version}:${el.isDeleted ? 1 : 0}`)
    .join("|");
  const appSig = [
    appState?.viewBackgroundColor ?? "",
    appState?.theme ?? "",
    appState?.gridSize ?? "",
  ].join(":");
  return `${elemSig}::${appSig}`;
};

export const EMPTY_SCENE_SIG = computeSceneSignature(EMPTY_SCENE.elements, EMPTY_SCENE.appState);

export type SceneSaveEnvelope = {
  json: string;
  byteLength: number;
  sha256?: string;
  suggestedName?: string;
  createdAt: number;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const buildSceneSaveEnvelope = async (
  json: string,
  suggestedName?: string,
): Promise<SceneSaveEnvelope> => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  let sha256: string | undefined;

  // Log envelope building for debugging on problematic devices
  console.log(`[scene-utils] buildSceneSaveEnvelope: jsonLen=${json.length}, byteLen=${bytes.byteLength}`);

  try {
    // crypto.subtle may not be available in insecure contexts or older WebViews
    if (window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      sha256 = toHex(digest);
      console.log(`[scene-utils] sha256 computed: ${sha256.slice(0, 16)}...`);
    } else {
      console.warn("[scene-utils] crypto.subtle not available, skipping sha256");
    }
  } catch (err) {
    console.warn("[scene-utils] sha256 computation failed:", err);
    sha256 = undefined;
  }

  const envelope = {
    json,
    byteLength: bytes.byteLength,
    sha256,
    suggestedName,
    createdAt: Date.now(),
  };

  console.log(`[scene-utils] envelope built: byteLen=${envelope.byteLength}, sha256=${envelope.sha256 ? "present" : "absent"}`);

  return envelope;
};
