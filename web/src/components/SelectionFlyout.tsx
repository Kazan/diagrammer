import { useMemo, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawLinearElement } from "@excalidraw/excalidraw/element/types";
import {
  Droplets,
  Paintbrush2,
  SlidersHorizontal,
  Eraser as EraserIcon,
  TextCursorInput,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeftRight,
  ArrowDownUp,
  Wand2,
  Copy,
  Trash2,
} from "lucide-react";

export type SelectionViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SelectionInfo = {
  elements: ExcalidrawElement[];
  viewportBounds: SelectionViewport | null;
};

type Props = {
  api: ExcalidrawImperativeAPI | null;
  selection: SelectionInfo | null;
};

type Common<T> = T | null;

type LinearElement = ExcalidrawLinearElement & { startArrowhead?: string | null; endArrowhead?: string | null };

function getCommonValue<T>(elements: ExcalidrawElement[], pick: (el: ExcalidrawElement) => T): Common<T> {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

function isLinear(el: ExcalidrawElement): el is LinearElement {
  return el.type === "arrow" || el.type === "line";
}

function isText(el: ExcalidrawElement) {
  return el.type === "text";
}

export function SelectionFlyout({ api, selection }: Props) {
  const [expanded, setExpanded] = useState(true);

  const { elements } = selection ?? { elements: [], viewportBounds: null };
  const hasSelection = elements.length > 0;

  const strokeColor = useMemo(() => getCommonValue(elements, (el) => (el as any).strokeColor), [elements]);
  const backgroundColor = useMemo(() => getCommonValue(elements, (el) => (el as any).backgroundColor), [elements]);
  const strokeWidth = useMemo(() => getCommonValue(elements, (el) => (el as any).strokeWidth), [elements]);
  const strokeStyle = useMemo(() => getCommonValue(elements, (el) => (el as any).strokeStyle), [elements]);
  const roughness = useMemo(() => getCommonValue(elements, (el) => (el as any).roughness), [elements]);
  const opacity = useMemo(() => getCommonValue(elements, (el) => (el as any).opacity), [elements]);
  const fontSize = useMemo(() => getCommonValue(elements, (el) => (el as any).fontSize), [elements]);
  const fontFamily = useMemo(() => getCommonValue(elements, (el) => (el as any).fontFamily), [elements]);
  const textAlign = useMemo(() => getCommonValue(elements, (el) => (el as any).textAlign), [elements]);

  const hasLinearOnly = elements.length > 0 && elements.every(isLinear);
  const hasTextOnly = elements.length > 0 && elements.every(isText);

  const startArrowhead = useMemo(
    () => (hasLinearOnly ? getCommonValue(elements, (el) => (el as LinearElement).startArrowhead ?? null) : null),
    [elements, hasLinearOnly],
  );
  const endArrowhead = useMemo(
    () => (hasLinearOnly ? getCommonValue(elements, (el) => (el as LinearElement).endArrowhead ?? null) : null),
    [elements, hasLinearOnly],
  );

  const applyToSelection = (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => {
    if (!api || !elements.length) return;
    const ids = new Set(elements.map((el) => el.id));
    const nextElements = api.getSceneElements().map((el: ExcalidrawElement) => (ids.has(el.id) ? mutate({ ...el }) : el));
    api.updateScene({ elements: nextElements });
  };

  const setProp = (key: string, value: any) => {
    applyToSelection((el) => ({ ...el, [key]: value } as ExcalidrawElement));
  };

  const setLinearArrowhead = (which: "startArrowhead" | "endArrowhead", value: string | null) => {
    applyToSelection((el) => {
      if (!isLinear(el)) return el;
      return { ...(el as any), [which]: value } as ExcalidrawElement;
    });
  };

  const duplicateSelection = () => {
    if (!api || !elements.length) return;
    const scene = api.getSceneElements();
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
    api.updateScene({ elements: [...scene, ...clones] });
  };

  const deleteSelection = () => {
    applyToSelection((el) => ({ ...(el as any), isDeleted: true } as ExcalidrawElement));
  };

  if (!hasSelection) return null;

  return (
    <div
      className={`selection-flyout selection-flyout--docked${expanded ? "" : " is-collapsed"}`}
      style={{ top: "140px", left: "190px" }}
      role="region"
      aria-label="Selection properties"
    >
      <div className="selection-flyout__header">
        <span>Properties</span>
        <div className="selection-flyout__actions" role="group" aria-label="Selection actions">
          <button type="button" className="selection-flyout__btn" onClick={duplicateSelection} aria-label="Duplicate selection">
            <Copy size={16} aria-hidden="true" />
          </button>
          <button type="button" className="selection-flyout__btn" onClick={deleteSelection} aria-label="Delete selection">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="selection-flyout__toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "–" : "+"}
        </button>
      </div>
      {expanded ? (
        <div className="selection-flyout__content">
          <div className="selection-flyout__row">
            <label className="selection-flyout__label">
              <Paintbrush2 size={16} aria-hidden="true" /> Stroke
            </label>
            <input
              type="color"
              value={strokeColor ?? "#121826"}
              onChange={(e) => setProp("strokeColor", e.target.value)}
              aria-label="Stroke color"
            />
            <select
              value={strokeWidth ?? ""}
              onChange={(e) => setProp("strokeWidth", Number(e.target.value))}
              aria-label="Stroke width"
            >
              <option value="">–</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </select>
            <select
              value={strokeStyle ?? ""}
              onChange={(e) => setProp("strokeStyle", e.target.value)}
              aria-label="Stroke style"
            >
              <option value="">–</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          <div className="selection-flyout__row">
            <label className="selection-flyout__label">
              <Droplets size={16} aria-hidden="true" /> Fill
            </label>
            <input
              type="color"
              value={backgroundColor ?? "#ffffff"}
              onChange={(e) => setProp("backgroundColor", e.target.value)}
              aria-label="Fill color"
            />
            <label className="selection-flyout__label">
              <SlidersHorizontal size={16} aria-hidden="true" /> Roughness
            </label>
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={roughness ?? 1}
              onChange={(e) => setProp("roughness", Number(e.target.value))}
              aria-label="Roughness"
            />
            <label className="selection-flyout__label">
              <EraserIcon size={16} aria-hidden="true" /> Opacity
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={opacity ?? 100}
              onChange={(e) => setProp("opacity", Number(e.target.value))}
              aria-label="Opacity"
            />
          </div>

          {hasLinearOnly ? (
            <div className="selection-flyout__row">
              <label className="selection-flyout__label">
                <ArrowLeftRight size={16} aria-hidden="true" /> Start
              </label>
              <select
                value={startArrowhead ?? ""}
                onChange={(e) => setLinearArrowhead("startArrowhead", e.target.value || null)}
                aria-label="Start arrowhead"
              >
                <option value="">None</option>
                <option value="arrow">Arrow</option>
                <option value="bar">Bar</option>
                <option value="dot">Dot</option>
                <option value="triangle">Triangle</option>
              </select>
              <label className="selection-flyout__label">
                <ArrowDownUp size={16} aria-hidden="true" /> End
              </label>
              <select
                value={endArrowhead ?? ""}
                onChange={(e) => setLinearArrowhead("endArrowhead", e.target.value || null)}
                aria-label="End arrowhead"
              >
                <option value="">None</option>
                <option value="arrow">Arrow</option>
                <option value="bar">Bar</option>
                <option value="dot">Dot</option>
                <option value="triangle">Triangle</option>
              </select>
            </div>
          ) : null}

          {hasTextOnly ? (
            <div className="selection-flyout__row">
              <label className="selection-flyout__label">
                <TextCursorInput size={16} aria-hidden="true" /> Text
              </label>
              <input
                type="number"
                min={8}
                max={96}
                value={fontSize ?? 18}
                onChange={(e) => setProp("fontSize", Number(e.target.value))}
                aria-label="Font size"
              />
              <select
                value={fontFamily ?? ""}
                onChange={(e) => setProp("fontFamily", Number(e.target.value))}
                aria-label="Font family"
              >
                <option value="">–</option>
                <option value={1}>Hand</option>
                <option value={2}>Sans</option>
                <option value={3}>Mono</option>
              </select>
              <div className="selection-flyout__btn-group" role="group" aria-label="Text alignment">
                <button
                  type="button"
                  className={`selection-flyout__btn ${textAlign === "left" ? "is-active" : ""}`}
                  onClick={() => setProp("textAlign", "left")}
                  aria-pressed={textAlign === "left"}
                  aria-label="Align left"
                >
                  <AlignLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`selection-flyout__btn ${textAlign === "center" ? "is-active" : ""}`}
                  onClick={() => setProp("textAlign", "center")}
                  aria-pressed={textAlign === "center"}
                  aria-label="Align center"
                >
                  <AlignCenter size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`selection-flyout__btn ${textAlign === "right" ? "is-active" : ""}`}
                  onClick={() => setProp("textAlign", "right")}
                  aria-pressed={textAlign === "right"}
                  aria-label="Align right"
                >
                  <AlignRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="selection-flyout__row">
            <label className="selection-flyout__label">
              <Wand2 size={16} aria-hidden="true" /> Quick
            </label>
            <button type="button" className="selection-flyout__btn" onClick={() => setProp("roughness", 0)}>
              Crisp
            </button>
            <button type="button" className="selection-flyout__btn" onClick={() => setProp("roughness", 2)}>
              Sketch
            </button>
            <button type="button" className="selection-flyout__btn" onClick={() => setProp("opacity", 60)}>
              60% Opacity
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
