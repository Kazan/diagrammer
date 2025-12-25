import { useMemo, useState } from "react";
import type React from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Palette, PaintBucket, SlidersHorizontal, Copy, Trash2 } from "lucide-react";
import type { SelectionInfo } from "./SelectionFlyout";
import ColorPicker from "./ColorPicker";
import type { PaletteId } from "./ColorPicker";

export type PropertyKind = "stroke" | "background" | "style";

type Props = {
  selection: SelectionInfo | null;
  api: ExcalidrawImperativeAPI | null;
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

export function SelectionPropertiesRail({ selection, api, onRequestOpen }: Props) {
  const elements = selection?.elements ?? [];
  if (!elements.length) return null;

  const hasImage = elements.some((el) => el.type === "image");

  const strokeColor = useMemo(
    () => getCommonValue(elements, (el) => (el as any).strokeColor) ?? DEFAULT_STROKE,
    [elements],
  );
  const backgroundColor = useMemo(
    () => getCommonValue(elements, (el) => (el as any).backgroundColor) ?? DEFAULT_FILL,
    [elements],
  );

  const [openKind, setOpenKind] = useState<PropertyKind | null>(null);

  const hasFillCapable = elements.some((el) => !LINE_LIKE_TYPES.has(el.type) && el.type !== "text");
  const hasStyleControls = elements.some((el) => el.type !== "text");

  const items: PropertyButton[] = [];

  if (!hasImage) {
    items.push({ id: "stroke", label: "Stroke color", Icon: Palette, swatch: strokeColor });
  }

  if (hasFillCapable && !hasImage) {
    items.push({ id: "background", label: "Fill color", Icon: PaintBucket, swatch: backgroundColor });
  }

  if (hasStyleControls) {
    items.push({ id: "style", label: "Stroke and fill style", Icon: SlidersHorizontal });
  }

  const applyToSelection = (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !elements.length) return;
    const ids = new Set(elements.map((el) => el.id));
    const nextElements = api.getSceneElements().map((el) => (ids.has(el.id) ? mutate({ ...el }) : el));
    api.updateScene({ elements: nextElements });
  };

  const duplicateSelection = () => {
    if (!api || !elements.length) return;
    const scene = api.getSceneElements();
    const appState = api.getAppState();
    const randomId = () => Math.random().toString(36).slice(2, 10);
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
    const clones = elements.map((el, index) => ({
      ...(el as any),
      id: randomId(),
      seed: randomNonce(),
      version: 1,
      versionNonce: randomNonce(),
      isDeleted: false,
      x: el.x + 16 + index * 4,
      y: el.y + 16 + index * 4,
    })) as ExcalidrawElement[];
    const nextSelectedElementIds = clones.reduce<Record<string, boolean>>((acc, clone) => {
      acc[clone.id] = true;
      return acc;
    }, {});
    api.updateScene({
      elements: [...scene, ...clones],
      appState: {
        ...appState,
        selectedElementIds: nextSelectedElementIds,
        selectedGroupIds: {},
        editingLinearElement: null,
        editingElement: null,
        selectedLinearElement: null,
        draggingElement: null,
        resizingElement: null,
        multiElement: null,
      },
    });
  };

  const deleteSelection = () => {
    applyToSelection((el) => ({ ...(el as any), isDeleted: true } as ExcalidrawElement));
  };

  // Close flyouts that are not applicable (e.g., when images are selected).
  if (hasImage && (openKind === "stroke" || openKind === "background") && openKind !== null) {
    setOpenKind(null);
  }

  const handleStrokeChange = (color: string) => {
    applyToSelection((el) => ({ ...el, strokeColor: color } as ExcalidrawElement));
  };

  const handleBackgroundChange = (color: string) => {
    applyToSelection((el) => ({ ...el, backgroundColor: color } as ExcalidrawElement));
  };

  const flyoutTop = (() => {
    if (!openKind) return 0;
    const idx = items.findIndex((item) => item.id === openKind);
    if (idx === -1) return 0;
    const BUTTON = 44;
    const GAP = 8;
    return 4 + idx * (BUTTON + GAP);
  })();

  return (
    <div className="selection-props-rail" role="toolbar" aria-label="Selection properties">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="selection-props-rail__button"
          aria-label={item.label}
          onClick={() => {
            setOpenKind((prev) => (prev === item.id ? null : item.id));
            onRequestOpen?.(item.id);
          }}
        >
          {item.swatch ? (
            <span className="selection-props-rail__swatch" style={resolveSwatchStyle(item.swatch)} aria-hidden="true" />
          ) : null}
          <item.Icon size={18} aria-hidden="true" />
        </button>
      ))}

      <div className="selection-props-rail__actions" role="group" aria-label="Selection actions">
        <button
          type="button"
          className="selection-props-rail__button"
          onClick={duplicateSelection}
          aria-label="Duplicate selection"
        >
          <Copy size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="selection-props-rail__button"
          onClick={deleteSelection}
          aria-label="Delete selection"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {openKind === "stroke" ? (
        <div className="selection-props-rail__flyout" role="dialog" aria-label="Stroke color" style={{ top: flyoutTop }}>
          <ColorPicker value={strokeColor} onChange={handleStrokeChange} title="Stroke color" initialShadeIndex={3} paletteId={"default" satisfies PaletteId} />
        </div>
      ) : null}

      {openKind === "background" ? (
        <div className="selection-props-rail__flyout" role="dialog" aria-label="Fill color" style={{ top: flyoutTop }}>
          <ColorPicker value={backgroundColor} onChange={handleBackgroundChange} title="Fill color" initialShadeIndex={5} paletteId={"default" satisfies PaletteId} />
        </div>
      ) : null}
    </div>
  );
}
