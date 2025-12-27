import { useMemo, useCallback, useRef } from "react";
import { CaptureUpdateAction, FONT_FAMILY, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Pencil,
  Code,
  Type as TypeIcon,
} from "lucide-react";
import { ToolbarButton } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";

// Font definitions with CSS font-family for preview
const FONTS = [
  { id: FONT_FAMILY.Excalifont, name: "Excalifont", fontFamily: "Excalifont, Xiaolai, sans-serif", icon: Pencil },
  { id: FONT_FAMILY["Lilita One"], name: "Lilita One", fontFamily: "'Lilita One', sans-serif", icon: TypeIcon },
  { id: FONT_FAMILY["Comic Shanns"], name: "Comic Shanns", fontFamily: "'Comic Shanns', cursive", icon: Code },
  { id: FONT_FAMILY.Nunito, name: "Nunito", fontFamily: "Nunito, sans-serif", icon: TypeIcon },
] as const;

// Text sizes: S=16, M=20, L=28, XL=36
const TEXT_SIZES = [
  { id: 16, label: "S" },
  { id: 20, label: "M" },
  { id: 28, label: "L" },
  { id: 36, label: "XL" },
] as const;

const TEXT_ALIGNS = [
  { id: "left", label: "Left align", Icon: AlignLeft },
  { id: "center", label: "Center align", Icon: AlignCenter },
  { id: "right", label: "Right align", Icon: AlignRight },
] as const;

type TextAlign = "left" | "center" | "right";

type FontType = (typeof FONTS)[number];

// Get bound text element IDs for a container element
function getBoundTextIds(el: ExcalidrawElement): string[] {
  if (!el.boundElements) return [];
  return el.boundElements
    .filter((b) => b.type === "text")
    .map((b) => b.id);
}

// Get all text element IDs that should be affected by the selection
// This includes direct text elements AND bound text elements from containers
function getAffectedTextIds(
  selectedIds: Set<string>,
  allElements: ReadonlyArray<ExcalidrawElement>,
): Set<string> {
  const textIds = new Set<string>();
  const elementsMap = new Map(allElements.map((el) => [el.id, el]));

  for (const id of selectedIds) {
    const el = elementsMap.get(id);
    if (!el) continue;

    if (el.type === "text") {
      // Direct text element
      textIds.add(el.id);
    } else {
      // Container element - get bound text
      for (const boundId of getBoundTextIds(el)) {
        textIds.add(boundId);
      }
    }
  }

  return textIds;
}

// Get the text element for reading properties (direct text or bound text from container)
function getTextElementForReading(
  el: ExcalidrawElement,
  allElements: ReadonlyArray<ExcalidrawElement>,
): ExcalidrawTextElement | null {
  if (el.type === "text") {
    return el as ExcalidrawTextElement;
  }
  // For containers, find the bound text element
  const boundTextIds = getBoundTextIds(el);
  if (boundTextIds.length === 0) return null;
  const textEl = allElements.find((e) => e.id === boundTextIds[0]);
  return textEl?.type === "text" ? (textEl as ExcalidrawTextElement) : null;
}

// FontListItem extracted as a separate component to avoid re-creation on parent renders
function FontListItem({
  font,
  isActive,
  onClick,
}: {
  font: FontType;
  isActive: boolean;
  onClick: () => void;
}) {
  const pointerActivatedRef = useRef(false);

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        "hover:bg-slate-100",
        isActive && "bg-[hsla(156,64%,48%,0.12)] border border-[hsl(156,64%,48%)]",
        !isActive && "border border-transparent"
      )}
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
      aria-pressed={isActive}
    >
      <font.icon size={16} className="text-slate-500 flex-shrink-0" aria-hidden="true" />
      <span
        className="text-slate-900 text-[15px]"
        style={{ fontFamily: font.fontFamily }}
      >
        {font.name}
      </span>
    </button>
  );
}

function getCommonValue<T>(
  elements: ReadonlyArray<ExcalidrawElement>,
  pick: (el: ExcalidrawElement) => T | undefined,
): T | null {
  if (!elements.length) return null;
  const first = pick(elements[0]);
  if (first === undefined) return null;
  for (let i = 1; i < elements.length; i += 1) {
    if (pick(elements[i]) !== first) return null;
  }
  return first;
}

// Get text-capable elements (text or shapes with bound text)
function getTextCapableElements(elements: ReadonlyArray<ExcalidrawElement>): ExcalidrawElement[] {
  return elements.filter(
    (el) =>
      el.type === "text" ||
      (el.boundElements?.some((b) => b.type === "text"))
  );
}

// Get fontFamily from element (direct for text, from bound text for containers)
function getFontFamily(el: ExcalidrawElement, allElements: ReadonlyArray<ExcalidrawElement>): number | undefined {
  const textEl = getTextElementForReading(el, allElements);
  return textEl?.fontFamily;
}

function getFontSize(el: ExcalidrawElement, allElements: ReadonlyArray<ExcalidrawElement>): number | undefined {
  const textEl = getTextElementForReading(el, allElements);
  return textEl?.fontSize;
}

function getTextAlign(el: ExcalidrawElement, allElements: ReadonlyArray<ExcalidrawElement>): TextAlign | undefined {
  const textEl = getTextElementForReading(el, allElements);
  return textEl?.textAlign as TextAlign | undefined;
}

type Props = {
  elements: ReadonlyArray<ExcalidrawElement>;
  allSceneElements: ReadonlyArray<ExcalidrawElement>;
  api: ExcalidrawImperativeAPI | null;
  selectedIds: Set<string>;
};

export function TextStyleFlyout({ elements, allSceneElements, api, selectedIds }: Props) {
  // Get fonts used in the scene
  const fontsInScene = useMemo(() => {
    const fontIds = new Set<number>();
    for (const el of allSceneElements) {
      if (el.type === "text") {
        fontIds.add((el as ExcalidrawTextElement).fontFamily);
      }
    }
    return FONTS.filter((f) => fontIds.has(f.id));
  }, [allSceneElements]);

  const availableFonts = useMemo(() => {
    const inSceneIds = new Set(fontsInScene.map((f) => f.id));
    return FONTS.filter((f) => !inSceneIds.has(f.id));
  }, [fontsInScene]);

  // Get current values from selection
  const textElements = useMemo(() => getTextCapableElements(elements), [elements]);

  const currentFontFamily = useMemo(
    () => getCommonValue(textElements, (el) => getFontFamily(el, allSceneElements)) ?? FONT_FAMILY.Excalifont,
    [textElements, allSceneElements],
  );

  const currentFontSize = useMemo(
    () => getCommonValue(textElements, (el) => getFontSize(el, allSceneElements)) ?? 20,
    [textElements, allSceneElements],
  );

  const currentTextAlign = useMemo(
    () => getCommonValue(textElements, (el) => getTextAlign(el, allSceneElements)) ?? "left",
    [textElements, allSceneElements],
  );

  const handleFontChange = useCallback(
    (fontId: number) => {
      if (!api) return;
      const sceneElements = api.getSceneElements();
      const affectedTextIds = getAffectedTextIds(selectedIds, sceneElements);
      const now = Date.now();
      const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
      // Apply font change to affected text elements (direct or bound)
      const updatedElements = sceneElements.map((el) => {
        if (affectedTextIds.has(el.id) && el.type === "text") {
          return {
            ...el,
            fontFamily: fontId,
            version: el.version + 1,
            versionNonce: randomNonce(),
            updated: now,
          };
        }
        return el;
      });
      // Use restoreElements with refreshDimensions to recalculate text bounding boxes
      const restored = restoreElements(updatedElements, sceneElements, {
        refreshDimensions: true,
        repairBindings: true,
      });
      api.updateScene({ elements: restored, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    },
    [api, selectedIds],
  );

  const handleSizeChange = useCallback(
    (size: number) => {
      if (!api) return;
      const sceneElements = api.getSceneElements();
      const affectedTextIds = getAffectedTextIds(selectedIds, sceneElements);
      const now = Date.now();
      const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
      // Apply size change to affected text elements (direct or bound)
      const updatedElements = sceneElements.map((el) => {
        if (affectedTextIds.has(el.id) && el.type === "text") {
          return {
            ...el,
            fontSize: size,
            version: el.version + 1,
            versionNonce: randomNonce(),
            updated: now,
          };
        }
        return el;
      });
      // Use restoreElements with refreshDimensions to recalculate text bounding boxes
      const restored = restoreElements(updatedElements, sceneElements, {
        refreshDimensions: true,
        repairBindings: true,
      });
      api.updateScene({ elements: restored, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    },
    [api, selectedIds],
  );

  const handleAlignChange = useCallback(
    (align: TextAlign) => {
      if (!api) return;
      const sceneElements = api.getSceneElements();
      const affectedTextIds = getAffectedTextIds(selectedIds, sceneElements);
      const now = Date.now();
      const randomNonce = () => Math.floor(Math.random() * 1_000_000_000);
      // Apply alignment change to affected text elements (direct or bound)
      const updatedElements = sceneElements.map((el) => {
        if (affectedTextIds.has(el.id) && el.type === "text") {
          return {
            ...el,
            textAlign: align,
            version: el.version + 1,
            versionNonce: randomNonce(),
            updated: now,
          };
        }
        return el;
      });
      // Use restoreElements to ensure proper dimension recalculation
      const restored = restoreElements(updatedElements, sceneElements, {
        refreshDimensions: true,
        repairBindings: true,
      });
      api.updateScene({ elements: restored, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    },
    [api, selectedIds],
  );

  return (
    <div className="flex flex-col gap-4 min-w-[240px]" role="dialog" aria-label="Text style options">
      {/* Fonts */}
      <div className="flex flex-col gap-2">
        {fontsInScene.length > 0 && (
          <>
            <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wide">
              In this scene
            </div>
            <div className="flex flex-col gap-1">
              {fontsInScene.map((font) => (
                <FontListItem
                  key={font.id}
                  font={font}
                  isActive={currentFontFamily === font.id}
                  onClick={() => handleFontChange(font.id)}
                />
              ))}
            </div>
          </>
        )}

        {availableFonts.length > 0 && (
          <>
            <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wide mt-1">
              Available fonts
            </div>
            <div className="flex flex-col gap-1">
              {availableFonts.map((font) => (
                <FontListItem
                  key={font.id}
                  font={font}
                  isActive={currentFontFamily === font.id}
                  onClick={() => handleFontChange(font.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Text Size */}
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-bold text-slate-900">Size</div>
        <div className="grid grid-cols-4 gap-2">
          {TEXT_SIZES.map((size) => (
            <ToolbarButton
              key={size.id}
              variant="flyout"
              pressed={currentFontSize === size.id}
              onClick={() => handleSizeChange(size.id)}
              aria-label={`Font size ${size.label}`}
              className="text-[14px] font-semibold"
            >
              {size.label}
            </ToolbarButton>
          ))}
        </div>
      </div>

      {/* Text Align */}
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-bold text-slate-900">Alignment</div>
        <div className="grid grid-cols-3 gap-2">
          {TEXT_ALIGNS.map((align) => (
            <ToolbarButton
              key={align.id}
              variant="flyout"
              pressed={currentTextAlign === align.id}
              onClick={() => handleAlignChange(align.id)}
              aria-label={align.label}
            >
              <align.Icon size={18} aria-hidden="true" />
            </ToolbarButton>
          ))}
        </div>
      </div>
    </div>
  );
}
