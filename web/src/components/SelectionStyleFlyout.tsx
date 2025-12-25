import { useMemo, useCallback, type ChangeEvent } from "react";
import { ROUNDNESS } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const DEFAULT_FILL = "#b7f5c4";
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_OPACITY = 100;

function getCommonValue<T>(elements: ReadonlyArray<ExcalidrawElement>, pick: (el: ExcalidrawElement) => T): T | null {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

type Props = {
  elements: ReadonlyArray<ExcalidrawElement>;
  onUpdate: (mutate: (el: ExcalidrawElement) => ExcalidrawElement) => void;
};

type FillOption = ExcalidrawElement["fillStyle"];
type FillActiveOption = "hachure" | "cross-hatch" | "solid";
type StrokeStyleOption = ExcalidrawElement["strokeStyle"];

type RoundnessKind = "sharp" | "round" | null;

const strokeWidthOptions: ReadonlyArray<number> = [1, 2, 4];
const strokeStyleOptions: ReadonlyArray<StrokeStyleOption> = ["solid", "dashed", "dotted"];
const sloppinessOptions: ReadonlyArray<number> = [0, 1, 2];

const edgeOptions: { id: RoundnessKind; label: string }[] = [
  { id: "sharp", label: "Sharp edges" },
  { id: "round", label: "Rounded edges" },
];

function resolveFillActive(fillStyle: FillOption): FillOption {
  if (fillStyle === "cross-hatch") return "cross-hatch";
  if (fillStyle === "hachure") return "hachure";
  return "solid";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().toLowerCase();
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized.startsWith("#") ? normalized.slice(1) : normalized);
  if (!match) return null;
  const intVal = parseInt(match[1], 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

function toRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(74, 106, 255, ${alpha})`;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
}

function roundnessFromElement(el: ExcalidrawElement): RoundnessKind {
  return el.roundness ? "round" : "sharp";
}

export function SelectionStyleFlyout({ elements, onUpdate }: Props) {
  const baseFillColor = useMemo(() => {
    const common = getCommonValue(elements, (el) => el.backgroundColor);
    if (!common || common === "transparent") return DEFAULT_FILL;
    return common;
  }, [elements]);

  const fillStyle = useMemo(
    () => getCommonValue(elements, (el) => el.fillStyle) ?? "solid",
    [elements],
  );

  const strokeWidth = useMemo(
    () => getCommonValue(elements, (el) => el.strokeWidth) ?? DEFAULT_STROKE_WIDTH,
    [elements],
  );

  const strokeStyle = useMemo(
    () => getCommonValue(elements, (el) => el.strokeStyle) ?? "solid",
    [elements],
  );

  const roughness = useMemo(
    () => getCommonValue(elements, (el) => el.roughness) ?? 1,
    [elements],
  );

  const opacity = useMemo(
    () => getCommonValue(elements, (el) => el.opacity) ?? DEFAULT_OPACITY,
    [elements],
  );

  const roundness = useMemo(() => {
    return getCommonValue(elements, roundnessFromElement) ?? "sharp";
  }, [elements]);

  const handleFillChange = useCallback(
    (option: FillActiveOption) => {
      onUpdate((el) => {
        const baseColor = el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : DEFAULT_FILL;
        return {
          ...el,
          backgroundColor: baseColor,
          fillStyle: option,
        };
      });
    },
    [onUpdate],
  );

  const handleStrokeWidthChange = useCallback(
    (value: number) => {
      onUpdate((el) => ({ ...el, strokeWidth: value }));
    },
    [onUpdate],
  );

  const handleStrokeStyleChange = useCallback(
    (value: StrokeStyleOption) => {
      onUpdate((el) => ({ ...el, strokeStyle: value }));
    },
    [onUpdate],
  );

  const handleRoughnessChange = useCallback(
    (value: number) => {
      onUpdate((el) => ({ ...el, roughness: value }));
    },
    [onUpdate],
  );

  const handleRoundnessChange = useCallback(
    (value: RoundnessKind) => {
      onUpdate((el) => {
        if (value === "round") {
          return { ...el, roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS } };
        }
        return { ...el, roundness: null };
      });
    },
    [onUpdate],
  );

  const handleOpacityChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      onUpdate((el) => ({ ...el, opacity: value }));
    },
    [onUpdate],
  );

  const fillActive = resolveFillActive(fillStyle);
  const showEdges = useMemo(() => elements.length > 0, [elements]);

  return (
    <div className="props-flyout" role="dialog" aria-label="Style options">
      <div className="props-section">
        <div className="props-section__title">Fill</div>
        <div className="props-grid">
          <button
            type="button"
            className={`props-tile${fillActive === "hachure" ? " is-active" : ""}`}
            onClick={() => handleFillChange("hachure")}
            aria-pressed={fillActive === "hachure"}
            aria-label="Sketch fill"
          >
            <span
              className="style-icon style-icon--fill-hachure"
              aria-hidden="true"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage: `repeating-linear-gradient(135deg, ${toRgba(baseFillColor, 0.38)} 0 6px, transparent 6px 12px)`,
              }}
            />
          </button>
          <button
            type="button"
            className={`props-tile${fillActive === "cross-hatch" ? " is-active" : ""}`}
            onClick={() => handleFillChange("cross-hatch")}
            aria-pressed={fillActive === "cross-hatch"}
            aria-label="Cross hatch fill"
          >
            <span
              className="style-icon style-icon--fill-cross"
              aria-hidden="true"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage:
                  `repeating-linear-gradient(135deg, ${toRgba(baseFillColor, 0.34)} 0 6px, transparent 6px 12px), ` +
                  `repeating-linear-gradient(45deg, ${toRgba(baseFillColor, 0.34)} 0 6px, transparent 6px 12px)`,
              }}
            />
          </button>
          <button
            type="button"
            className={`props-tile${fillActive === "solid" ? " is-active" : ""}`}
            onClick={() => handleFillChange("solid")}
            aria-pressed={fillActive === "solid"}
            aria-label="Solid fill"
          >
            <span
              className="style-icon style-icon--fill-solid"
              aria-hidden="true"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage: `linear-gradient(${baseFillColor}, ${baseFillColor})`,
                backgroundSize: "60% 60%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                borderColor: toRgba(baseFillColor, 0.7),
              }}
            />
          </button>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section__title">Stroke width</div>
        <div className="props-grid">
          {strokeWidthOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`props-tile${strokeWidth === option ? " is-active" : ""}`}
              onClick={() => handleStrokeWidthChange(option)}
              aria-pressed={strokeWidth === option}
              aria-label={`Stroke width ${option}`}
            >
              <span className={`style-icon style-icon--stroke style-icon--stroke-${option}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section__title">Stroke style</div>
        <div className="props-grid">
          {strokeStyleOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`props-tile${strokeStyle === option ? " is-active" : ""}`}
              onClick={() => handleStrokeStyleChange(option)}
              aria-pressed={strokeStyle === option}
              aria-label={`${option} stroke`}
            >
              <span className={`style-icon style-icon--stroke-${option}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="props-section">
        <div className="props-section__title">Sloppiness</div>
        <div className="props-grid">
          {sloppinessOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`props-tile${roughness === option ? " is-active" : ""}`}
              onClick={() => handleRoughnessChange(option)}
              aria-pressed={roughness === option}
              aria-label={`Sloppiness ${option}`}
            >
              <span className={`style-icon style-icon--squiggle style-icon--squiggle-${option}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {showEdges ? (
        <div className="props-section">
          <div className="props-section__title">Edges</div>
          <div className="props-grid props-grid--two">
            {edgeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`props-tile${roundness === option.id ? " is-active" : ""}`}
                onClick={() => handleRoundnessChange(option.id)}
                aria-pressed={roundness === option.id}
                aria-label={option.label}
              >
                <span className={`style-icon style-icon--edge-${option.id}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="props-section">
        <div className="props-section__title">Transparency</div>
        <div className="props-slider">
          <span className="props-slider__scale">0</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            onChange={handleOpacityChange}
            aria-label="Transparency"
          />
          <span className="props-slider__scale">100</span>
        </div>
      </div>
    </div>
  );
}
