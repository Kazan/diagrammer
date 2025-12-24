import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Palette, Pipette } from "lucide-react";

export type ColorSwatch = {
  key: string;
  label: string;
  value: string;
  title?: string;
  darkest?: string;
  lightest?: string;
  disableShades?: boolean;
};

export type PaletteId = "default" | "eink";

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

export const DEFAULT_COLOR = "#6741d9";

export const DEFAULT_SWATCHES: ColorSwatch[] = [
  { key: "q", label: "q", value: "transparent", title: "Transparent", disableShades: true },
  { key: "w", label: "w", value: "#ffffff", title: "White", disableShades: true },
  { key: "e", label: "e", value: "#ced4da", title: "Charcoal", darkest: "#343a40", lightest: "#f8f9fa" },
  { key: "r", label: "r", value: "#1e1e1e", title: "Midnight", disableShades: true },
  { key: "t", label: "t", value: "#d2bab0", title: "Brown", darkest: "#846358", lightest: "#f8f1ee" },
  { key: "a", label: "a", value: "#3bc9db", title: "Teal", darkest: "#0c8599", lightest: "#e3fafc" },
  { key: "s", label: "s", value: "#2563eb", title: "Blue" },
  { key: "d", label: "d", value: "#7c3aed", title: "Purple" },
  { key: "f", label: "f", value: "#d946ef", title: "Fuchsia" },
  { key: "g", label: "g", value: "#e11d48", title: "Rose" },
  { key: "z", label: "z", value: "#16a34a", title: "Green" },
  { key: "x", label: "x", value: "#22c55e", title: "Mint" },
  { key: "c", label: "c", value: "#f59e0b", title: "Amber" },
  { key: "v", label: "v", value: "#f97316", title: "Orange" },
  { key: "b", label: "b", value: "#ef4444", title: "Red" },
];

export const EINK_SWATCHES: ColorSwatch[] = [
  { key: "q", label: "q", value: "transparent", title: "Transparent" },
  { key: "w", label: "w", value: "#ffffff", title: "White" },
  { key: "e", label: "e", value: "#111827", title: "Black" },
  { key: "r", label: "r", value: "#e5e7eb", title: "Light gray" },
  { key: "t", label: "t", value: "#9ca3af", title: "Gray" },
  { key: "y", label: "y", value: "#4b5563", title: "Dark gray" },
];

export const COLOR_PALETTES: Record<PaletteId, ColorSwatch[]> = {
  default: DEFAULT_SWATCHES,
  eink: EINK_SWATCHES,
};

function expandShortHex(hex: string) {
  if (hex.length === 4 || hex.length === 5) {
    const [, r, g, b, a] = hex;
    const alpha = a ? `${a}${a}` : "ff";
    return `#${r}${r}${g}${g}${b}${b}${alpha}`;
  }
  return hex;
}

function normalizeHex(color: string | null): string {
  if (!color || color === "transparent") return DEFAULT_COLOR;
  const trimmed = color.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#([0-9a-fA-F]{3,4})$/.test(prefixed)) return expandShortHex(prefixed).toLowerCase();
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(prefixed)) return prefixed.toLowerCase();
  return DEFAULT_COLOR;
}

function decomposeColor(color: string | null): { hex: string; alpha: number; display: string } {
  if (!color || color === "transparent") return { hex: DEFAULT_COLOR, alpha: 0, display: "transparent" };
  const normalized = normalizeHex(color);
  const value = normalized.replace("#", "");
  const hasAlpha = value.length === 8;
  const rgb = hasAlpha ? value.slice(0, 6) : value;
  const alphaHex = hasAlpha ? value.slice(6, 8) : "ff";
  const alpha = parseInt(alphaHex, 16) / 255;
  const display = hasAlpha && alpha < 1 ? `#${rgb}${alphaHex}` : `#${rgb}`;
  return { hex: `#${rgb}`, alpha, display };
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).slice(1, 7);
  const num = parseInt(normalized, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function combineColor(hex: string, alpha: number) {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (clampedAlpha >= 0.999) return normalizeHex(hex).slice(0, 7);
  const alphaHex = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, "0")
    .toLowerCase();
  return `${normalizeHex(hex).slice(0, 7)}${alphaHex}`;
}

function getShades(base: string) {
  // shade1 darkest, shade5 lightest; shade3 is base color
  const factors = [-0.35, -0.18, 0, 0.18, 0.35];
  return factors.map((f) => adjustColor(base, f));
}

function adjustColor(hex: string, factor: number) {
  const rgb = hexToRgb(hex);
  const target = factor > 0 ? 255 : 0;
  const amount = Math.abs(factor);
  return rgbToHex({
    r: rgb.r + (target - rgb.r) * amount,
    g: rgb.g + (target - rgb.g) * amount,
    b: rgb.b + (target - rgb.b) * amount,
  });
}

function mixColor(a: string, b: string, t: number) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return rgbToHex({ r: lerp(ca.r, cb.r), g: lerp(ca.g, cb.g), b: lerp(ca.b, cb.b) });
}

function parseColorInput(input: string): { value: string; alpha: number } | null {
  const value = input.trim();
  if (!value) return null;
  if (value.toLowerCase() === "transparent") return { value: DEFAULT_COLOR, alpha: 0 };
  const prefixed = value.startsWith("#") ? value : `#${value}`;
  if (/^#([0-9a-fA-F]{3,4})$/.test(prefixed)) {
    const expanded = expandShortHex(prefixed).toLowerCase();
    const { alpha } = decomposeColor(expanded);
    return { value: expanded, alpha };
  }
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(prefixed)) {
    const normalized = prefixed.toLowerCase();
    const { alpha } = decomposeColor(normalized);
    return { value: normalized, alpha };
  }
  return null;
}

export type ColorPickerProps = {
  value: string | null;
  onChange: (color: string) => void;
  swatches?: ColorSwatch[];
  title?: string;
  initialShadeIndex?: 1 | 2 | 3 | 4 | 5;
  paletteId?: PaletteId;
};

export default function ColorPicker({
  value,
  onChange,
  swatches,
  title = "Colors",
  initialShadeIndex = 3,
  paletteId = "default",
}: ColorPickerProps) {
  const inputId = useId();
  const [inputValue, setInputValue] = useState(value ?? DEFAULT_COLOR);
  const [alpha, setAlpha] = useState(1);
  const [baseHex, setBaseHex] = useState(() => decomposeColor(value).hex);
  const [shadeIndex, setShadeIndex] = useState<1 | 2 | 3 | 4 | 5>(initialShadeIndex);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const paletteSwatches = useMemo(() => {
    if (swatches && swatches.length) return swatches;
    return COLOR_PALETTES[paletteId] ?? COLOR_PALETTES.default;
  }, [paletteId, swatches]);

  const { hex: normalizedHex, alpha: derivedAlpha, display } = useMemo(() => decomposeColor(value), [value]);
  const shadeFactors = [-0.35, -0.18, 0, 0.18, 0.35] as const;
  const shadeFactor = shadeFactors[shadeIndex - 1];

  const currentSwatch = useMemo(() => {
    const normalized = normalizeHex(baseHex);
    return paletteSwatches.find((s) => normalizeHex(s.value) === normalized);
  }, [baseHex, paletteSwatches]);

  const isShadeDisabled = useMemo(() => {
    return Boolean(currentSwatch?.disableShades);
  }, [currentSwatch]);

  const computeSwatchShades = useMemo(() => {
    return (hex: string, swatch?: ColorSwatch): string[] => {
      if (swatch?.disableShades) return [];
      const central = normalizeHex(hex);
      if (swatch?.darkest && swatch?.lightest) {
        const darkest = normalizeHex(swatch.darkest);
        const lightest = normalizeHex(swatch.lightest);
        const mid1 = mixColor(darkest, central, 0.5);
        const mid4 = mixColor(central, lightest, 0.5);
        return [darkest, mid1, central, mid4, lightest];
      }
      return getShades(central);
    };
  }, []);

  const shades = useMemo(() => {
    if (isShadeDisabled) return [];
    return computeSwatchShades(baseHex, currentSwatch);
  }, [baseHex, computeSwatchShades, currentSwatch, isShadeDisabled]);

  const shadePlaceholders = useMemo(() => Array.from({ length: 5 }, (_, index) => `placeholder-${index + 1}`), []);

  const tintedBase = useMemo(() => {
    if (isShadeDisabled) return normalizeHex(baseHex);
    if (!shades.length) return adjustColor(baseHex, shadeFactor);
    return shades[shadeIndex - 1];
  }, [baseHex, isShadeDisabled, shadeFactor, shadeIndex, shades]);

  const tintColor = useMemo(() => {
    return (hex: string, swatchOverride?: ColorSwatch) => {
      const swatch = swatchOverride ?? paletteSwatches.find((s) => normalizeHex(s.value) === normalizeHex(hex));
      if (swatch?.disableShades) return normalizeHex(hex);
      const shadesForSwatch = computeSwatchShades(hex, swatch);
      if (shadesForSwatch.length === 5) return shadesForSwatch[shadeIndex - 1];
      return adjustColor(normalizeHex(hex), shadeFactor);
    };
  }, [computeSwatchShades, paletteSwatches, shadeFactor, shadeIndex]);

  const skipBaseSyncRef = useRef(false);

  useEffect(() => {
    setInputValue(display);
    setAlpha(derivedAlpha);
    if (skipBaseSyncRef.current) {
      skipBaseSyncRef.current = false;
    } else {
      setBaseHex(normalizedHex);
    }
  }, [display, derivedAlpha, normalizedHex]);

  const applyInputValue = () => {
    const parsed = parseColorInput(inputValue || normalizedHex);
    if (parsed) {
      const nextHex = normalizeHex(parsed.value);
      setAlpha(parsed.alpha);
      setBaseHex(nextHex);
      onChange(combineColor(nextHex, parsed.alpha));
    } else setInputValue(display);
  };

  const applyAlpha = (nextAlpha: number) => {
    setAlpha(nextAlpha);
    onChange(combineColor(baseHex, nextAlpha));
  };

  const handleEyedropper = async () => {
    if (!window.EyeDropper) return;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const picked = normalizeHex(result.sRGBHex.toLowerCase());
      setBaseHex(picked);
      onChange(combineColor(picked, alpha));
    } catch (err) {
      console.warn("EyeDropper cancelled", err);
    }
  };

  const handleCustomPicker = () => {
    colorInputRef.current?.click();
  };

  return (
    <div className="color-picker" role="group" aria-label={`${title} picker`}>
      <div className="color-picker__group">
        <div className="color-picker__title">{title}</div>
        <div className="color-picker__swatches">
          {paletteSwatches.map((swatch) => {
            const normalizedSwatch = swatch.value === "transparent" ? DEFAULT_COLOR : normalizeHex(swatch.value);
            const displayColor = swatch.value === "transparent" ? swatch.value : tintColor(normalizedSwatch, swatch);
            const isActive =
              value === swatch.value ||
              (swatch.value !== "transparent" && normalizeHex(value) === normalizeHex(displayColor) && decomposeColor(value).alpha === alpha);
            return (
              <button
                key={swatch.key}
                type="button"
                className={`color-swatch${swatch.value === "transparent" ? " color-swatch--transparent" : ""}${isActive ? " is-active" : ""}`}
                style={swatch.value === "transparent" ? undefined : { backgroundColor: displayColor, color: displayColor }}
                onClick={() => {
                  const nextBase = normalizedSwatch;
                  const nextAlpha = swatch.value === "transparent" ? 0 : alpha;
                  const tintedColor = swatch.value === "transparent" ? combineColor(nextBase, 0) : combineColor(tintColor(nextBase, swatch), nextAlpha);
                  setBaseHex(nextBase);
                  setAlpha(nextAlpha);
                  setInputValue(swatch.value === "transparent" ? "transparent" : tintedColor);
                  skipBaseSyncRef.current = true;
                  onChange(tintedColor);
                }}
                aria-pressed={isActive}
                aria-label={swatch.title ?? swatch.value}
              >
                <span className="color-swatch__key">{swatch.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="color-picker__group">
        <div className="color-picker__title">Shades</div>
        <div className="color-picker__shades">
          {(isShadeDisabled ? shadePlaceholders : shades).map((shade, index) => {
            const shadeValue = isShadeDisabled ? shade : combineColor(shade, alpha);
            const isActive = !isShadeDisabled && index + 1 === shadeIndex;
            const shadeStyle = isShadeDisabled
              ? { backgroundColor: "rgba(0, 0, 0, 0.06)", color: "rgba(0, 0, 0, 0.06)" }
              : { backgroundColor: shade, color: shade };
            return (
              <button
                key={shadeValue}
                type="button"
                className={`color-shade${isActive ? " is-active" : ""}${isShadeDisabled ? " is-disabled" : ""}`}
                style={shadeStyle}
                disabled={isShadeDisabled}
                onClick={() => {
                  if (isShadeDisabled) return;
                  const nextIndex = (index + 1) as 1 | 2 | 3 | 4 | 5;
                  setShadeIndex(nextIndex);
                  const nextFactor = shadeFactors[nextIndex - 1];
                  const swatch = currentSwatch;
                  const shadesForSwatch = swatch ? computeSwatchShades(baseHex, swatch) : undefined;
                  const nextTint = shadesForSwatch && shadesForSwatch.length === 5 ? shadesForSwatch[nextIndex - 1] : adjustColor(baseHex, nextFactor);
                  const tinted = combineColor(nextTint, alpha);
                  setInputValue(tinted);
                  skipBaseSyncRef.current = true;
                  onChange(tinted);
                }}
                aria-label={`Shade ${index + 1}${isShadeDisabled ? " disabled" : ""}`}
              >
                ↑{index + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="color-picker__hex">
        <label className="color-picker__title" htmlFor={inputId}>
          Hex code
        </label>
        <div className="color-picker__hex-row">
          <input
            id={inputId}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={applyInputValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyInputValue();
              }
            }}
            placeholder="#6741d9 or #6741d9aa"
          />
          <button type="button" className="selection-flyout__btn" onClick={handleEyedropper} aria-label="Pick color from canvas">
            <Pipette size={16} aria-hidden="true" />
          </button>
          <button type="button" className="selection-flyout__btn" onClick={handleCustomPicker} aria-label="Open custom color picker">
            <Palette size={16} aria-hidden="true" />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="color-picker__hidden-input"
            value={baseHex}
            onChange={(e) => {
              const nextHex = normalizeHex(e.target.value);
              setBaseHex(nextHex);
              const next = combineColor(nextHex, alpha);
              onChange(next);
              setInputValue(next);
            }}
            aria-label="Custom color picker"
          />
        </div>
      </div>

      <div className="color-picker__alpha">
        <div className="color-picker__title">Transparency</div>
        <div className="color-picker__alpha-row">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(alpha * 100)}
            onChange={(e) => applyAlpha(Number(e.target.value) / 100)}
            aria-label="Transparency"
          />
          <span className="color-picker__alpha-value">{Math.round(alpha * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
