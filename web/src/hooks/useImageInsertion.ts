import { useCallback, useRef, type MutableRefObject, type ChangeEvent } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { BinaryFileData, DataURL, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { ToolType } from "../components/CustomToolbar";
import type { StatusMessage } from "../components/NativeStatus";

export function useImageInsertion(options: {
  api: ExcalidrawImperativeAPI | null;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  setActiveTool: (tool: ToolType) => void;
  setStatus: (status: StatusMessage) => void;
}) {
  const { api, apiRef, setActiveTool, setStatus } = options;
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const toImageMimeType = useCallback((value: string): BinaryFileData["mimeType"] => {
    if (value && value.startsWith("image/")) {
      return value as BinaryFileData["mimeType"];
    }
    return "image/png";
  }, []);

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!api) return;
      const toDataUrl = (input: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Unable to read image"));
          reader.readAsDataURL(input);
        });

      const loadImageDimensions = (dataUrl: string) =>
        new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          img.onerror = () => reject(new Error("Unable to load image"));
          img.src = dataUrl;
        });

      try {
        const dataURL = (await toDataUrl(file)) as DataURL;
        const { width, height } = await loadImageDimensions(dataURL);
        const fileId = (`image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) as FileId;
        const now = Date.now();
        api.addFiles([
          {
            id: fileId,
            dataURL,
            mimeType: toImageMimeType(file.type),
            created: now,
            lastRetrieved: now,
          },
        ]);

        if (import.meta.env.DEV) {
          requestAnimationFrame(() => {
            const files = api.getFiles();
            if (!files[fileId]) {
              console.warn("[ImageInsert] addFiles() missing fileId", { fileId, knownFileIds: Object.keys(files) });
            }
            const hasElement = api
              .getSceneElementsIncludingDeleted()
              .some(
                (el) =>
                  el.type === "image" &&
                  "fileId" in el &&
                  typeof el.fileId === "string" &&
                  el.fileId === fileId,
              );
            if (!hasElement) {
              console.warn("[ImageInsert] Missing image element with fileId", { fileId });
            }
          });
        }

        const appState = api.getAppState();
        const zoom = appState.zoom?.value ?? 1;
        const offsetLeft = appState.offsetLeft ?? 0;
        const offsetTop = appState.offsetTop ?? 0;
        const scrollX = appState.scrollX ?? 0;
        const scrollY = appState.scrollY ?? 0;
        const centerX = (window.innerWidth / 2 - offsetLeft) / zoom - scrollX;
        const centerY = (window.innerHeight / 2 - offsetTop) / zoom - scrollY;
        const [imageElement] = convertToExcalidrawElements([
          {
            type: "image",
            fileId,
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            angle: 0,
          },
        ]);

        api.updateScene({
          elements: [...api.getSceneElements(), imageElement as ExcalidrawElement],
          appState: {
            selectedElementIds: { [imageElement.id]: true },
            selectedGroupIds: {},
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        setActiveTool("selection");
        apiRef.current?.setActiveTool({ type: "selection" });
        setStatus({ text: `Inserted image${file.name ? `: ${file.name}` : ""}`, tone: "ok" });
      } catch (err) {
        setStatus({ text: `Image insert failed: ${String((err as Error)?.message ?? err)}`, tone: "err" });
      }
    },
    [api, apiRef, setActiveTool, setStatus, toImageMimeType],
  );

  const handleImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void handleImageFile(file);
    },
    [handleImageFile],
  );

  const startImageInsertion = useCallback(() => {
    const target = imageInputRef.current;
    if (!target) return;
    target.value = "";
    target.click();
  }, []);

  return { imageInputRef, handleImageInputChange, startImageInsertion } as const;
}
