import { Undo2 } from "lucide-react";
import type { PointerEvent } from "react";

export type HistoryControlsProps = {
  onUndo: () => void;
  canUndo: boolean;
};

/**
 * History controls for the bottom bar.
 * Currently contains only the undo action, but designed to hold
 * additional history actions (e.g., redo) in the future.
 */
export function HistoryControls({ onUndo, canUndo }: HistoryControlsProps) {
  /**
   * Prevent default on pointerDown to avoid ghost clicks and
   * ensure consistent behavior across eInk devices (Nova Boox, etc.)
   */
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <button
      type="button"
      className={`zoom-controls__btn zoom-controls__undo${canUndo ? " zoom-controls__undo--active" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => {
        e.preventDefault();
        onUndo();
      }}
      aria-label="Undo"
      disabled={!canUndo}
    >
      <Undo2 size={16} aria-hidden="true" />
    </button>
  );
}
