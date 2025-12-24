import { Minus, Plus, Undo2 } from "lucide-react";

export type ZoomControlsProps = {
  zoom: { value: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onUndo: () => void;
};

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onCenter, onUndo }: ZoomControlsProps) {
  const percent = `${Math.round((zoom?.value ?? 1) * 100)}%`;
  return (
    <div className="zoom-controls" role="toolbar" aria-label="Zoom controls">
      <div className="zoom-controls__group" role="group" aria-label="Zoom in/out">
        <button type="button" className="zoom-controls__btn" onClick={onZoomOut} aria-label="Zoom out">
          <Minus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="zoom-controls__btn zoom-controls__btn--label" onClick={onCenter} aria-label="Zoom to fit">
          {percent}
        </button>
        <button type="button" className="zoom-controls__btn" onClick={onZoomIn} aria-label="Zoom in">
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="zoom-controls__btn zoom-controls__undo" onClick={onUndo} aria-label="Undo">
        <Undo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
