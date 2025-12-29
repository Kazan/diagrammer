import { useCallback, useRef } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  applyRestoredScene,
  buildDefaultLocalAppStateOverrides,
  restoreSceneForApp,
} from "../excalidraw-restore";
import { computeSceneSignature } from "../scene-utils";
import type { StatusMessage } from "../components/NativeStatus";

type WebFallbackParams = {
  api: ExcalidrawImperativeAPI | null;
  setStatus: (status: StatusMessage | null) => void;
  setCurrentFileName: (name: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setHasSceneContent: (hasContent: boolean) => void;
  suppressNextDirtyRef: React.MutableRefObject<boolean>;
  prevSceneSigRef: React.MutableRefObject<string | null>;
  prevNonEmptySceneRef: React.MutableRefObject<boolean>;
  resetHistoryFromCurrentScene: () => void;
};

/**
 * Provides fallback file operations for web browsers when native bridge is unavailable.
 * - Open: Uses file input to upload .excalidraw files
 * - Save: Downloads the scene as .excalidraw JSON file
 */
export function useWebFallbackActions({
  api,
  setStatus,
  setCurrentFileName,
  setIsDirty,
  setHasSceneContent,
  suppressNextDirtyRef,
  prevSceneSigRef,
  prevNonEmptySceneRef,
  resetHistoryFromCurrentScene,
}: WebFallbackParams) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Triggers a browser file dialog to upload an .excalidraw file.
   */
  const openFileWithBrowser = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  /**
   * Handles the file input change event to load the selected file.
   */
  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!api) {
        setStatus({ text: "Canvas not ready", tone: "warn" });
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || !Array.isArray(parsed.elements)) {
          setStatus({ text: "Invalid scene file", tone: "err" });
          return;
        }

        const restored = restoreSceneForApp(
          parsed,
          buildDefaultLocalAppStateOverrides()
        );
        applyRestoredScene(api, restored);

        const elements = api.getSceneElements();
        if (elements.length) {
          api.scrollToContent(elements, { fitToViewport: true, animate: false });
        }

        prevSceneSigRef.current = computeSceneSignature(
          api.getSceneElements(),
          api.getAppState()
        );
        const hasVisibleElements = elements.some((el) => !el.isDeleted);
        prevNonEmptySceneRef.current = hasVisibleElements;
        setHasSceneContent(hasVisibleElements);
        suppressNextDirtyRef.current = true;
        resetHistoryFromCurrentScene();
        setIsDirty(false);

        // Extract filename without extension
        const displayName = file.name.replace(/\.excalidraw$/i, "");
        setCurrentFileName(displayName);
        setStatus({ text: `Loaded: ${displayName}`, tone: "ok" });
      } catch (err) {
        console.error("Failed to load file:", err);
        setStatus({ text: `Failed to load file: ${String(err)}`, tone: "err" });
      }
    },
    [
      api,
      prevNonEmptySceneRef,
      prevSceneSigRef,
      resetHistoryFromCurrentScene,
      setCurrentFileName,
      setHasSceneContent,
      setIsDirty,
      setStatus,
      suppressNextDirtyRef,
    ]
  );

  /**
   * Saves the scene using the File System Access API if available,
   * otherwise falls back to downloading as a .excalidraw JSON file.
   * Returns the chosen filename (without extension) or null if cancelled.
   */
  const saveSceneWithPicker = useCallback(
    async (json: string, suggestedName: string): Promise<string | null> => {
      const filename = suggestedName.endsWith(".excalidraw")
        ? suggestedName
        : `${suggestedName}.excalidraw`;

      // Try File System Access API first (modern browsers)
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            // excludeAcceptAllOption forces the user to use the specified file type
            excludeAcceptAllOption: true,
            types: [
              {
                description: "Excalidraw Scene",
                accept: { "application/json": [".excalidraw"] },
              },
            ],
          });

          const writable = await handle.createWritable();
          await writable.write(json);
          await writable.close();

          // The browser should enforce .excalidraw extension with excludeAcceptAllOption
          const savedName = (handle.name as string).replace(/\.excalidraw$/i, "");
          setStatus({ text: `Saved: ${handle.name}`, tone: "ok" });
          setIsDirty(false);
          return savedName;
        } catch (err: any) {
          // User cancelled the picker
          if (err?.name === "AbortError") {
            setStatus({ text: "Save cancelled", tone: "warn" });
            return null;
          }
          console.warn("File System Access API failed, falling back to download:", err);
          // Fall through to download fallback
        }
      }

      // Fallback: use anchor download
      try {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setStatus({ text: `Downloaded: ${filename}`, tone: "ok" });
        setIsDirty(false);
        return suggestedName.replace(/\.excalidraw$/i, "");
      } catch (err) {
        console.error("Download failed:", err);
        setStatus({ text: `Download failed: ${String(err)}`, tone: "err" });
        return null;
      }
    },
    [setIsDirty, setStatus]
  );

  /**
   * Downloads the scene as a .excalidraw JSON file (legacy method, uses anchor).
   */
  const downloadScene = useCallback(
    (json: string, filename: string) => {
      void saveSceneWithPicker(json, filename);
    },
    [saveSceneWithPicker]
  );

  /**
   * Downloads a data URL as a file.
   */
  const downloadDataUrl = useCallback(
    (dataUrl: string, filename: string, mimeType: string) => {
      try {
        // Convert data URL to blob
        const byteString = atob(dataUrl.split(",")[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeType });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setStatus({ text: `Downloaded: ${filename}`, tone: "ok" });
      } catch (err) {
        console.error("Download failed:", err);
        setStatus({ text: `Download failed: ${String(err)}`, tone: "err" });
      }
    },
    [setStatus]
  );

  return {
    fileInputRef,
    openFileWithBrowser,
    handleFileInputChange,
    saveSceneWithPicker,
    downloadScene,
    downloadDataUrl,
  } as const;
}
