import { Minus, Plus } from "lucide-react";
import type { PointerEvent } from "react";

export type ZoomControlsProps = {
  zoom: { value: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToContent: () => void;
  disabled?: boolean;
};

/**
 * Zoom control buttons: minus, percentage display, and plus.
 * Single click on percentage resets to 100%, double-click zooms to fit content.
 */
export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToContent,
  disabled = false,
}: ZoomControlsProps) {
  const percent = `${Math.round((zoom?.value ?? 1) * 100)}%`;

  /**
   * Prevent default on pointerDown to avoid ghost clicks and
   * ensure consistent behavior across eInk devices (Nova Boox, etc.)
   */
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleCenterPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    // Ignore if this looks like part of a double-tap sequence
    if (event.detail > 1) return;
    onResetZoom();
  };

  const handleCenterDoubleClick = () => {
    onZoomToContent();
  };

  return (
    <div className="zoom-controls__group" role="group" aria-label="Zoom in/out">
      <button
        type="button"
        className="zoom-controls__btn"
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          e.preventDefault();
          onZoomOut();
        }}
        aria-label="Zoom out"
        disabled={disabled}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="zoom-controls__btn zoom-controls__btn--label"
        onPointerDown={handlePointerDown}
        onPointerUp={handleCenterPointerUp}
        onDoubleClick={handleCenterDoubleClick}
        aria-label="Reset zoom or zoom to scene"
        disabled={disabled}
      >
        {percent}
      </button>
      <button
        type="button"
        className="zoom-controls__btn"
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          e.preventDefault();
          onZoomIn();
        }}
        aria-label="Zoom in"
        disabled={disabled}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
