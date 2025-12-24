import type React from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types";
import { Palette, PaintBucket, SlidersHorizontal } from "lucide-react";
import type { SelectionInfo } from "./SelectionFlyout";

export type PropertyKind = "stroke" | "background" | "style";

type Props = {
  selection: SelectionInfo | null;
  onRequestOpen?: (kind: PropertyKind) => void;
};

type PropertyButton = {
  id: PropertyKind;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  swatch?: string | null;
};

const DEFAULT_STROKE = "#0f172a";
const DEFAULT_FILL = "#b7f5c4";
const LINE_LIKE_TYPES = new Set(["line", "arrow"]);

function getCommonValue<T>(elements: ExcalidrawElement[], pick: (el: ExcalidrawElement) => T): T | null {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

function resolveSwatchStyle(color: string | null): React.CSSProperties {
  if (!color || color === "transparent") {
    return {
      backgroundImage:
        "linear-gradient(135deg, rgba(15,23,42,0.08) 25%, transparent 25%, transparent 50%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.08) 75%, transparent 75%, transparent)",
      backgroundColor: "#f8fafc",
      backgroundSize: "8px 8px",
      border: "1px solid rgba(15,23,42,0.12)",
    };
  }
  return { backgroundColor: color, border: "1px solid rgba(15,23,42,0.12)" };
}

export function SelectionPropertiesRail({ selection, onRequestOpen }: Props) {
  const elements = selection?.elements ?? [];
  if (!elements.length) return null;

  const strokeColor = getCommonValue(elements, (el) => (el as any).strokeColor) ?? DEFAULT_STROKE;
  const backgroundColor = getCommonValue(elements, (el) => (el as any).backgroundColor) ?? DEFAULT_FILL;

  const hasFillCapable = elements.some((el) => !LINE_LIKE_TYPES.has(el.type) && el.type !== "text");
  const hasStyleControls = elements.some((el) => el.type !== "text");

  const items: PropertyButton[] = [
    { id: "stroke", label: "Stroke color", Icon: Palette, swatch: strokeColor },
  ];

  if (hasFillCapable) {
    items.push({ id: "background", label: "Fill color", Icon: PaintBucket, swatch: backgroundColor });
  }

  if (hasStyleControls) {
    items.push({ id: "style", label: "Stroke and fill style", Icon: SlidersHorizontal });
  }

  return (
    <div className="selection-props-rail" role="toolbar" aria-label="Selection properties">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="selection-props-rail__button"
          aria-label={item.label}
          onClick={() => onRequestOpen?.(item.id)}
        >
          {item.swatch ? (
            <span className="selection-props-rail__swatch" style={resolveSwatchStyle(item.swatch)} aria-hidden="true" />
          ) : null}
          <item.Icon size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
