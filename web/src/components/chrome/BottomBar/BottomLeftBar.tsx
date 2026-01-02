import type { ReactNode } from "react";

export type BottomLeftBarProps = {
  children: ReactNode;
};

/**
 * Container component for the bottom-left corner of the screen.
 * Provides fixed positioning and proper z-index stacking.
 *
 * Usage:
 * ```tsx
 * <BottomLeftBar>
 *   <ZoomButtonGroup ... />
 *   <UndoButton ... />
 * </BottomLeftBar>
 * ```
 */
export function BottomLeftBar({ children }: BottomLeftBarProps) {
  return (
    <div className="zoom-controls" role="toolbar" aria-label="Canvas controls">
      {children}
    </div>
  );
}
