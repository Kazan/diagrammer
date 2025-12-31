import { Minus, Plus } from "lucide-react";
import type { PointerEvent } from "react";

export type UiScaleControlsProps = {
  scale: number;
  onScaleUp: () => void;
  onScaleDown: () => void;
  onReset: () => void;
  minScale?: number;
  maxScale?: number;
};

/**
 * UI scale controls for adjusting the size of UI elements.
 * This affects buttons, toolbars, and other chrome - not the canvas content.
 */
export function UiScaleControls({
  scale,
  onScaleUp,
  onScaleDown,
  onReset,
  minScale = 0.75,
  maxScale = 1.5,
}: UiScaleControlsProps) {
  const percent = `${Math.round(scale * 100)}%`;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleCenterPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.detail > 1) return;
    onReset();
  };

  return (
    <div className="ui-scale-controls" role="group" aria-label="UI size controls">
      <span className="ui-scale-controls__label">UI</span>
      <button
        type="button"
        className="ui-scale-controls__btn"
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          e.preventDefault();
          onScaleDown();
        }}
        aria-label="Decrease UI size"
        disabled={scale <= minScale}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="ui-scale-controls__btn ui-scale-controls__btn--label"
        onPointerDown={handlePointerDown}
        onPointerUp={handleCenterPointerUp}
        aria-label="Reset UI size"
      >
        {percent}
      </button>
      <button
        type="button"
        className="ui-scale-controls__btn"
        onPointerDown={handlePointerDown}
        onPointerUp={(e) => {
          e.preventDefault();
          onScaleUp();
        }}
        aria-label="Increase UI size"
        disabled={scale >= maxScale}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
