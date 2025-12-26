import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { moveAllLeft, moveAllRight, moveOneLeft, moveOneRight } from "../excalidraw-zindex";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Copy,
  Group as GroupIcon,
  Layers as LayersIcon,
  PaintBucket,
  Palette,
  SendToBack,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { SelectionInfo } from "./SelectionFlyout";
import ColorPicker from "./ColorPicker";
import type { PaletteId } from "./ColorPicker";
import { SelectionStyleFlyout } from "./SelectionStyleFlyout";

export type PropertyKind = "stroke" | "background" | "style" | "arrange";

type Props = {
  selection: SelectionInfo | null;
  api: ExcalidrawImperativeAPI | null;
  onRequestOpen?: (kind: PropertyKind) => void;
};

type PropertyButton = {
  id: PropertyKind;
  label: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  swatch?: string | null;
};

const DEFAULT_STROKE = "#0f172a";
const DEFAULT_FILL = "#b7f5c4";
const LINE_LIKE_TYPES = new Set<ExcalidrawElement["type"]>(["line", "arrow"]);

type LayerAction = "toFront" | "toBack" | "forward" | "backward";
type AlignAction = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

const isClosedPolyline = (el: ExcalidrawElement) => {
  if (el.type !== "line") return false;
  const points = el.points;
  if (!points || points.length < 3) return false;
  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points[points.length - 1];
  const epsilon = 0.5;
  return Math.abs(firstX - lastX) <= epsilon && Math.abs(firstY - lastY) <= epsilon;
};

function getCommonValue<T>(
  elements: readonly ExcalidrawElement[],
  pick: (el: ExcalidrawElement) => T,
): T | null {
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

  const isMultiSelect = elements.length > 1;
  const hasImage = elements.some((el) => el.type === "image");
  const selectedIds = useMemo(() => new Set(elements.map((el) => el.id)), [elements]);

  const strokeColor = useMemo(
    () =>
      getCommonValue<string | null>(elements, (el) => el.strokeColor ?? null) ?? DEFAULT_STROKE,
    [elements],
  );
  const backgroundColor = useMemo(
    () =>
      getCommonValue<string | null>(
        elements,
        (el) => el.backgroundColor ?? null,
      ) ?? DEFAULT_FILL,
    [elements],
  );

  const [openKind, setOpenKind] = useState<PropertyKind | null>(null);

  const hasFillCapable = elements.some((el) => (!LINE_LIKE_TYPES.has(el.type) && el.type !== "text") || isClosedPolyline(el));
  const hasStyleControls = elements.some((el) => el.type !== "text" && el.type !== "image");

  const selectionBounds = useMemo(() => {
    if (!elements.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [elements]);

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

  items.push({ id: "arrange", label: "Layers and alignment", Icon: LayersIcon });

  const applyToSelection = (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !elements.length) return;
    const nextElements = api.getSceneElements().map((el) => (selectedIds.has(el.id) ? mutate({ ...el }) : el));
    api.updateScene({ elements: nextElements });
  };

  const moveSelection = (action: LayerAction) => {
    console.log("z-index action request", {
      action,
      hasApi: Boolean(api),
      selectionCount: selectedIds.size,
    });

    if (!api) {
      return;
    }

    if (!selectedIds.size) {
      console.warn("z-index action skipped: no selection", { action });
      return;
    }

    const scene = api.getSceneElements();
    const appState = api.getAppState();
    console.log("z-index action start", { action, selectedCount: selectedIds.size });

    const reordered = (() => {
      switch (action) {
        case "forward":
          return moveOneRight(scene, appState) as ExcalidrawElement[];
        case "backward":
          return moveOneLeft(scene, appState) as ExcalidrawElement[];
        case "toFront":
          return moveAllRight(scene, appState) as ExcalidrawElement[];
        case "toBack":
          return moveAllLeft(scene, appState) as ExcalidrawElement[];
        default:
          return scene;
      }
    })();

    console.log("z-index action result", {
      action,
      length: reordered.length,
      firstIds: reordered.slice(0, 5).map((el) => el.id),
    });

    api.updateScene({ elements: reordered, captureUpdate: CaptureUpdateAction.IMMEDIATELY });

    console.log("z-index action applied", {
      action,
      selectedIds: Array.from(selectedIds),
    });
  };

  const alignSelection = (action: AlignAction) => {
    if (!api || !selectionBounds || !isMultiSelect) return;
    const { minX, minY, maxX, maxY, width, height } = selectionBounds;
    const now = Date.now();
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return { ...el };
      if (action === "left") return { ...el, x: minX, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "right") return { ...el, x: maxX - el.width, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "centerX") return { ...el, x: minX + (width - el.width) / 2, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "top") return { ...el, y: minY, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "bottom") return { ...el, y: maxY - el.height, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      if (action === "centerY") return { ...el, y: minY + (height - el.height) / 2, version: el.version + 1, versionNonce: randomNonce(), updated: now };
      return { ...el, version: el.version + 1, versionNonce: randomNonce(), updated: now };
    });

    api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const handleGroupSelection = () => {
    if (!api || !isMultiSelect) return;
    const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
    const nextElements = api.getSceneElements().map((el) => {
      if (!selectedIds.has(el.id)) return { ...el };
      return {
        ...el,
        groupIds: [...el.groupIds, groupId],
        version: el.version + 1,
        versionNonce: randomNonce(),
        updated: now,
      };
    });

    const nextSelectedElementIds = elements.reduce<Record<string, true>>((acc, el) => {
      acc[el.id] = true;
      return acc;
    }, {});

    api.updateScene({
      elements: nextElements,
      appState: {
        ...api.getAppState(),
        selectedGroupIds: { [groupId]: true },
        selectedElementIds: nextSelectedElementIds,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const duplicateSelection = () => {
    if (!api || !elements.length) return;
    const sourceElements = elements.filter((el) => el.type !== "selection");
    if (!sourceElements.length) return;
    const scene = api.getSceneElements();
    const appState = api.getAppState();

    const canUseSkeletonDuplication = sourceElements.every((el) => {
      if (el.type === "frame" || el.type === "magicframe") return false;
      if (el.type === "image" && !el.fileId) return false;
      return true;
    });

    const clones: ExcalidrawElement[] = canUseSkeletonDuplication
      ? convertToExcalidrawElements(
          sourceElements as unknown as NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>,
          { regenerateIds: true },
        ).map((el, index) => ({
          ...el,
          x: el.x + 16 + index * 4,
          y: el.y + 16 + index * 4,
        }))
      : (() => {
          const randomId = () => Math.random().toString(36).slice(2, 10);
          const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
          return sourceElements.map((el, index) => ({
            ...el,
            id: randomId(),
            seed: randomNonce(),
            version: 1,
            versionNonce: randomNonce(),
            isDeleted: false,
            x: el.x + 16 + index * 4,
            y: el.y + 16 + index * 4,
          }));
        })();

    const nextSelectedElementIds = clones.reduce<Record<string, true>>((acc, clone) => {
      acc[clone.id] = true;
      return acc;
    }, {});
    api.updateScene({
      elements: [...scene, ...clones],
      appState: {
        selectedElementIds: nextSelectedElementIds,
        selectedGroupIds: {},
      },
    });
  };

  const deleteSelection = () => {
    applyToSelection((el) => ({ ...el, isDeleted: true }));
  };

  // Close flyouts that are not applicable (e.g., when images are selected).
  if (hasImage && (openKind === "stroke" || openKind === "background" || openKind === "style") && openKind !== null) {
    setOpenKind(null);
  }

  const handleStrokeChange = (color: string) => {
    applyToSelection((el) => ({ ...el, strokeColor: color }));
  };

  const handleBackgroundChange = (color: string) => {
    applyToSelection((el) => ({ ...el, backgroundColor: color }));
  };

  const flyoutTop = (() => {
    if (!openKind) return 0;
    const idx = items.findIndex((item) => item.id === openKind);
    if (idx === -1) return 0;
    const BUTTON = 44;
    const GAP = 8;
    return 4 + idx * (BUTTON + GAP);
  })();

  useEffect(() => {
    if (openKind !== "arrange") return;
    console.log("[arrange] flyout mount", { selectionCount: elements.length });
    return () => console.log("[arrange] flyout unmount");
  }, [openKind, elements.length]);

  const ArrangeTile = ({
    Icon,
    label,
    onClick,
    testId,
    iconStyle,
  }: {
    Icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
    label: string;
    onClick: () => void;
    testId: string;
    iconStyle?: React.CSSProperties;
  }) => {
    const pointerActivatedRef = useRef(false);

    const activate = (source: "click" | "pointerup") => {
      console.log("[arrange] click", { label, source });
      onClick();
    };

    return (
      <button
        type="button"
        className="arrange-tile"
        data-testid={testId}
        onPointerDownCapture={(event) => {
          pointerActivatedRef.current = false;
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          if (event.button !== 0) return;
          pointerActivatedRef.current = true;
          event.stopPropagation();
          activate("pointerup");
        }}
        onClick={(event) => {
          if (pointerActivatedRef.current) {
            pointerActivatedRef.current = false;
            return;
          }
          event.stopPropagation();
          activate("click");
        }}
        aria-label={label}
      >
        <Icon size={18} aria-hidden="true" style={iconStyle}
 />
      </button>
    );
  };

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

      {openKind === "style" ? (
        <div className="selection-props-rail__flyout" role="dialog" aria-label="Style" style={{ top: flyoutTop }}>
          <SelectionStyleFlyout elements={elements} onUpdate={applyToSelection} />
        </div>
      ) : null}

      {openKind === "arrange" ? (
        <div
          className="selection-props-rail__flyout"
          role="dialog"
          aria-label="Arrange"
          style={{ top: flyoutTop }}
          data-testid="arrange-flyout"
        >
          <div className="arrange-flyout">
            <div className="arrange-section">
              <div className="arrange-section__title">Layers</div>
              <div className="arrange-grid arrange-grid--four" role="group" aria-label="Layer order">
                <ArrangeTile Icon={SendToBack} label="Send to back" testId="arrange-layer-back" onClick={() => moveSelection("toBack")} />
                <ArrangeTile Icon={ArrowDown} label="Move backward" testId="arrange-layer-backward" onClick={() => moveSelection("backward")} />
                <ArrangeTile Icon={ArrowUp} label="Move forward" testId="arrange-layer-forward" onClick={() => moveSelection("forward")} />
                <ArrangeTile Icon={BringToFront} label="Bring to front" testId="arrange-layer-front" onClick={() => moveSelection("toFront")} />
              </div>
            </div>

              {isMultiSelect ? (
                <div className="arrange-section">
                  <div className="arrange-section__title">Align</div>
                  <div className="arrange-grid arrange-grid--row" role="group" aria-label="Horizontal align">
                    <ArrangeTile Icon={AlignStartVertical} label="Align left" testId="arrange-align-left" onClick={() => alignSelection("left")} />
                    <ArrangeTile Icon={AlignCenterVertical} label="Align center (Y axis)" testId="arrange-align-center-x" onClick={() => alignSelection("centerX")} />
                    <ArrangeTile Icon={AlignEndVertical} label="Align right" testId="arrange-align-right" onClick={() => alignSelection("right")} />
                  </div>
                  <div className="arrange-grid arrange-grid--row" role="group" aria-label="Vertical align">
                    <ArrangeTile
                      Icon={AlignStartVertical}
                      label="Align top"
                      testId="arrange-align-top"
                      onClick={() => alignSelection("top")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                    <ArrangeTile
                      Icon={AlignCenterVertical}
                      label="Align middle (X axis)"
                      testId="arrange-align-center-y"
                      onClick={() => alignSelection("centerY")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                    <ArrangeTile
                      Icon={AlignEndVertical}
                      label="Align bottom"
                      testId="arrange-align-bottom"
                      onClick={() => alignSelection("bottom")}
                      iconStyle={{ transform: "rotate(90deg)" }}
                    />
                  </div>
                </div>
              ) : null}

            {isMultiSelect ? (
              <div className="arrange-section">
                <div className="arrange-section__title">Actions</div>
                <div className="arrange-grid arrange-grid--single" role="group" aria-label="Grouping">
                  <ArrangeTile Icon={GroupIcon} label="Group selection" testId="arrange-group" onClick={handleGroupSelection} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
