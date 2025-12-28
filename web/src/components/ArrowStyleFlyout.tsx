import { useMemo, useCallback } from "react";
import type { ExcalidrawElement, ExcalidrawLinearElement } from "@excalidraw/excalidraw/element/types";
import type { ExplicitStyleDefaults } from "@/hooks/useExplicitStyleDefaults";

/**
 * Arrowhead options supported by Excalidraw.
 * - null: no arrowhead
 * - "arrow": regular arrow point
 * - "bar": line cap/bar
 * - "dot": circle dot
 * - "triangle": filled triangle
 */
type ArrowheadType = ExcalidrawLinearElement["startArrowhead"];

type Props = {
  elements: ReadonlyArray<ExcalidrawElement>;
  onUpdate: (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => void;
  onStyleCapture?: <K extends keyof ExplicitStyleDefaults>(
    key: K,
    value: ExplicitStyleDefaults[K],
  ) => void;
};

function getCommonValue<T>(
  elements: ReadonlyArray<ExcalidrawElement>,
  pick: (el: ExcalidrawElement) => T,
): T | null {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

const arrowheadOptions: ReadonlyArray<{ id: ArrowheadType; label: string }> = [
  { id: null, label: "None" },
  { id: "arrow", label: "Arrow" },
  { id: "bar", label: "Bar" },
  { id: "dot", label: "Dot" },
  { id: "triangle", label: "Triangle" },
];

/**
 * Icon component for arrowhead preview.
 * Renders an SVG showing the arrowhead style.
 */
function ArrowheadIcon({ type, flip = false }: { type: ArrowheadType; flip?: boolean }) {
  const transform = flip ? "scale(-1, 1) translate(-24, 0)" : "";

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform={transform}>
        {/* Base line */}
        <line
          x1="4"
          y1="12"
          x2="20"
          y2="12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Arrowhead at the end */}
        {type === "arrow" && (
          <path
            d="M14 7 L20 12 L14 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
        {type === "bar" && (
          <line
            x1="20"
            y1="7"
            x2="20"
            y2="17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        {type === "dot" && (
          <circle cx="20" cy="12" r="3" fill="currentColor" />
        )}
        {type === "triangle" && (
          <path
            d="M14 7 L20 12 L14 17 Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  );
}

export function ArrowStyleFlyout({ elements, onUpdate, onStyleCapture }: Props) {
  // Filter to only linear elements (lines/arrows)
  const linearElements = useMemo(
    () => elements.filter((el): el is ExcalidrawLinearElement =>
      el.type === "arrow" || el.type === "line"
    ),
    [elements],
  );

  const startArrowhead = useMemo(
    () => getCommonValue(linearElements, (el) => (el as ExcalidrawLinearElement).startArrowhead),
    [linearElements],
  );

  const endArrowhead = useMemo(
    () => getCommonValue(linearElements, (el) => (el as ExcalidrawLinearElement).endArrowhead),
    [linearElements],
  );

  const handleStartArrowheadChange = useCallback(
    (value: ArrowheadType) => {
      onUpdate((el) => {
        if (el.type !== "arrow" && el.type !== "line") return el;
        return { ...el, startArrowhead: value };
      });
      onStyleCapture?.("startArrowhead", value);
    },
    [onUpdate, onStyleCapture],
  );

  const handleEndArrowheadChange = useCallback(
    (value: ArrowheadType) => {
      onUpdate((el) => {
        if (el.type !== "arrow" && el.type !== "line") return el;
        return { ...el, endArrowhead: value };
      });
      onStyleCapture?.("endArrowhead", value);
    },
    [onUpdate, onStyleCapture],
  );

  if (!linearElements.length) {
    return null;
  }

  return (
    <div className="props-flyout" role="dialog" aria-label="Arrow style options">
      <div className="props-section">
        <div className="props-section__title">Start</div>
        <div className="props-grid props-grid--five">
          {arrowheadOptions.map((option) => (
            <button
              key={option.id ?? "none-start"}
              type="button"
              className={`props-tile${startArrowhead === option.id ? " is-active" : ""}`}
              onClick={() => handleStartArrowheadChange(option.id)}
              aria-pressed={startArrowhead === option.id}
              aria-label={`Start: ${option.label}`}
            >
              <ArrowheadIcon type={option.id} flip />
            </button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section__title">End</div>
        <div className="props-grid props-grid--five">
          {arrowheadOptions.map((option) => (
            <button
              key={option.id ?? "none-end"}
              type="button"
              className={`props-tile${endArrowhead === option.id ? " is-active" : ""}`}
              onClick={() => handleEndArrowheadChange(option.id)}
              aria-pressed={endArrowhead === option.id}
              aria-label={`End: ${option.label}`}
            >
              <ArrowheadIcon type={option.id} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
