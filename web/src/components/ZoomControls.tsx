import { Minus, Plus, Undo2 } from "lucide-react";
import type { MouseEvent } from "react";

export type ZoomControlsProps = {
  zoom: { value: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToContent: () => void;
  onUndo: () => void;
  canUndo: boolean;
  hasSceneContent: boolean;
};

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToContent,
  onUndo,
  canUndo,
  hasSceneContent,
}: ZoomControlsProps) {
  const percent = `${Math.round((zoom?.value ?? 1) * 100)}%`;

  const handleCenterClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return; // ignore the two click events that accompany a double-click
    onResetZoom();
  };

  const handleCenterDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onZoomToContent();
  };

  return (
    <div className="zoom-controls" role="toolbar" aria-label="Zoom controls">
      <div className="zoom-controls__group" role="group" aria-label="Zoom in/out">
        <button
          type="button"
          className="zoom-controls__btn"
          onClick={onZoomOut}
          aria-label="Zoom out"
          disabled={!hasSceneContent}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="zoom-controls__btn zoom-controls__btn--label"
          onClick={handleCenterClick}
          onDoubleClick={handleCenterDoubleClick}
          aria-label="Reset zoom or zoom to scene"
          disabled={!hasSceneContent}
        >
          {percent}
        </button>
        <button
          type="button"
          className="zoom-controls__btn"
          onClick={onZoomIn}
          aria-label="Zoom in"
          disabled={!hasSceneContent}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className={`zoom-controls__btn zoom-controls__undo${canUndo ? " zoom-controls__undo--active" : ""}`}
        onClick={onUndo}
        aria-label="Undo"
        disabled={!canUndo}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
