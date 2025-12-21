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
