export type LocalSceneEntry = { name: string; scene: string; updated: number };

export const loadLocalSceneEntries = (storageKey: string): LocalSceneEntry[] => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) =>
      typeof entry?.name === "string" && typeof entry?.scene === "string" && typeof entry?.updated === "number",
    );
  } catch (_err) {
    return [];
  }
};

export const persistLocalSceneEntries = (storageKey: string, entries: LocalSceneEntry[]) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch (_err) {
    // ignore
  }
};
