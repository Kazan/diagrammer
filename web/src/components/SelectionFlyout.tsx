import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type SelectionViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SelectionInfo = {
  elements: ReadonlyArray<ExcalidrawElement>;
  viewportBounds: SelectionViewport | null;
};
