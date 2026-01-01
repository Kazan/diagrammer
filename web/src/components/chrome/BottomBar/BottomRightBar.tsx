import type { ReactNode } from "react";

export type BottomRightBarProps = {
  children: ReactNode;
};

/**
 * Container component for the bottom-right corner of the screen.
 * Provides fixed positioning and proper z-index stacking.
 */
export function BottomRightBar({ children }: BottomRightBarProps) {
  return (
    <div className="bottom-right-bar" role="toolbar" aria-label="UI controls">
      {children}
    </div>
  );
}
