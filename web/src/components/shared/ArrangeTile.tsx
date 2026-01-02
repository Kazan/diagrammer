import { useRef } from "react";
import type React from "react";
import { RailButton } from "@/components/ui/tool-rail";

interface ArrangeTileProps {
  /** Icon component to render */
  Icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  /** Accessible label for the button */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Test ID for testing */
  testId: string;
  /** Optional inline styles for the icon (e.g., rotation) */
  iconStyle?: React.CSSProperties;
}

/**
 * A tile button used in the Arrange flyout for layer/alignment actions.
 * Handles pointer events carefully to work well on both touch and mouse.
 */
export function ArrangeTile({
  Icon,
  label,
  onClick,
  testId,
  iconStyle,
}: ArrangeTileProps) {
  const pointerActivatedRef = useRef(false);

  return (
    <RailButton
      variant="flyout"
      data-testid={testId}
      onPointerDownCapture={(e) => {
        pointerActivatedRef.current = false;
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        pointerActivatedRef.current = true;
        e.stopPropagation();
        onClick();
      }}
      onClick={(e) => {
        if (pointerActivatedRef.current) {
          pointerActivatedRef.current = false;
          return;
        }
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
    >
      <Icon size={18} aria-hidden="true" style={iconStyle} />
    </RailButton>
  );
}
