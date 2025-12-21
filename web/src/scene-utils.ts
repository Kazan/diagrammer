export const EMPTY_SCENE = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ecececff",
    theme: "light" as const,
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

export const computeSceneSignatureFromScene = (scene: any) =>
  computeSceneSignature(scene?.elements ?? [], scene?.appState ?? {});

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
  try {
    if (window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      sha256 = toHex(digest);
    }
  } catch (_err) {
    sha256 = undefined;
  }

  return {
    json,
    byteLength: bytes.byteLength,
    sha256,
    suggestedName,
    createdAt: Date.now(),
  };
};
