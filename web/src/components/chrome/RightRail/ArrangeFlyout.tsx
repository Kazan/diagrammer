import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Group as GroupIcon,
  SendToBack,
  Ungroup,
} from "lucide-react";
import { ArrangeTile } from "@/components/shared/ArrangeTile";

export type LayerAction = "toFront" | "toBack" | "forward" | "backward";
export type AlignAction = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

interface ArrangeFlyoutProps {
  /** Whether alignment actions should be shown (requires 2+ alignment units) */
  canAlign: boolean;
  /** Whether ungroup action should be shown */
  canUngroup: boolean;
  /** Handler for layer reordering actions */
  onLayerAction: (action: LayerAction) => void;
  /** Handler for alignment actions */
  onAlignAction: (action: AlignAction) => void;
  /** Handler for grouping the selection */
  onGroup: () => void;
  /** Handler for ungrouping the selection */
  onUngroup: () => void;
}

/**
 * Flyout content for the Arrange panel in SelectionPropertiesRail.
 * Provides layer ordering, alignment, and grouping controls.
 */
export function ArrangeFlyout({
  canAlign,
  canUngroup,
  onLayerAction,
  onAlignAction,
  onGroup,
  onUngroup,
}: ArrangeFlyoutProps) {
  return (
    <div className="flex flex-col gap-3 text-slate-900">
      {/* Layers section */}
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-bold text-slate-900">Layers</div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Layer order">
          <ArrangeTile
            Icon={SendToBack}
            label="Send to back"
            testId="arrange-layer-back"
            onClick={() => onLayerAction("toBack")}
          />
          <ArrangeTile
            Icon={ArrowDown}
            label="Move backward"
            testId="arrange-layer-backward"
            onClick={() => onLayerAction("backward")}
          />
          <ArrangeTile
            Icon={ArrowUp}
            label="Move forward"
            testId="arrange-layer-forward"
            onClick={() => onLayerAction("forward")}
          />
          <ArrangeTile
            Icon={BringToFront}
            label="Bring to front"
            testId="arrange-layer-front"
            onClick={() => onLayerAction("toFront")}
          />
        </div>
      </div>

      {/* Align section - only shown when 2+ alignment units exist */}
      {canAlign && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-bold text-slate-900">Align</div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Horizontal align">
            <ArrangeTile
              Icon={AlignStartVertical}
              label="Align left"
              testId="arrange-align-left"
              onClick={() => onAlignAction("left")}
            />
            <ArrangeTile
              Icon={AlignCenterVertical}
              label="Align center (Y axis)"
              testId="arrange-align-center-x"
              onClick={() => onAlignAction("centerX")}
            />
            <ArrangeTile
              Icon={AlignEndVertical}
              label="Align right"
              testId="arrange-align-right"
              onClick={() => onAlignAction("right")}
            />
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Vertical align">
            <ArrangeTile
              Icon={AlignStartVertical}
              label="Align top"
              testId="arrange-align-top"
              onClick={() => onAlignAction("top")}
              iconStyle={{ transform: "rotate(90deg)" }}
            />
            <ArrangeTile
              Icon={AlignCenterVertical}
              label="Align middle (X axis)"
              testId="arrange-align-center-y"
              onClick={() => onAlignAction("centerY")}
              iconStyle={{ transform: "rotate(90deg)" }}
            />
            <ArrangeTile
              Icon={AlignEndVertical}
              label="Align bottom"
              testId="arrange-align-bottom"
              onClick={() => onAlignAction("bottom")}
              iconStyle={{ transform: "rotate(90deg)" }}
            />
          </div>
        </div>
      )}

      {/* Actions section - group/ungroup */}
      {(canAlign || canUngroup) && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-bold text-slate-900">Actions</div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Grouping">
            {canAlign && (
              <ArrangeTile
                Icon={GroupIcon}
                label="Group selection"
                testId="arrange-group"
                onClick={onGroup}
              />
            )}
            {canUngroup && (
              <ArrangeTile
                Icon={Ungroup}
                label="Ungroup selection"
                testId="arrange-ungroup"
                onClick={onUngroup}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
