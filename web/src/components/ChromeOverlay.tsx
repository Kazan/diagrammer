import { CustomToolbar, type ToolType, type ArrowType } from "./CustomToolbar";
import { NativeStatus, type StatusMessage } from "./NativeStatus";
import { TopBar } from "./topbar";
import { StatusBanner } from "./StatusBanner";
import { MultiPointDoneButton } from "./MultiPointDoneButton";
import { ClearConfirmDialog } from "./ClearConfirmDialog";

type Props = {
  fileName: string;
  isDirty: boolean;
  activeTool: ToolType;
  arrowType?: ArrowType;
  isToolLocked?: boolean;
  onSelectTool: (tool: ToolType) => void;
  onLockTool?: (tool: ToolType) => void;
  nativePresent: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
  canSave: boolean;
  hasSceneContent: boolean;
  onOpen: () => void;
  onSaveNow: () => void;
  onSaveToDocument: () => void;
  onCopySource: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onClear: () => void;
  showClearConfirm: boolean;
  onForceClear: () => void;
  onCancelClear: () => void;
  exporting: "png" | "svg" | null;
  /** True when user is drawing a multi-point line/arrow (tap-tap mode) */
  isDrawingMultiPoint?: boolean;
  /** Callback to finalize/cancel multi-point drawing (like pressing ESC) */
  onFinalizeMultiPoint?: () => void;
};

export function ChromeOverlay({
  fileName,
  isDirty,
  activeTool,
  arrowType,
  isToolLocked,
  onSelectTool,
  onLockTool,
  nativePresent,
  lastSaved,
  status,
  canSave,
  hasSceneContent,
  onOpen,
  onSaveNow,
  onSaveToDocument,
  onCopySource,
  onExportPng,
  onExportSvg,
  onClear,
  showClearConfirm,
  onForceClear,
  onCancelClear,
  exporting,
  isDrawingMultiPoint,
  onFinalizeMultiPoint,
}: Props) {
  return (
    <>
      <TopBar
        fileName={fileName}
        isDirty={isDirty}
        lastSaved={lastSaved}
        nativePresent={nativePresent}
        canSave={canSave}
        hasSceneContent={hasSceneContent}
        onOpen={onOpen}
        onSave={onSaveNow}
        onSaveAs={onSaveToDocument}
        onCopySource={onCopySource}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        onClear={onClear}
        exporting={exporting}
        showCopySource={false}
      />

      <StatusBanner status={status} />

      <CustomToolbar
        activeTool={activeTool}
        arrowType={arrowType}
        isToolLocked={isToolLocked}
        onSelect={onSelectTool}
        onLockTool={onLockTool}
      />

      {isDrawingMultiPoint && onFinalizeMultiPoint && (
        <MultiPointDoneButton onFinalize={onFinalizeMultiPoint} />
      )}

      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />

      <ClearConfirmDialog
        open={showClearConfirm}
        onConfirm={onForceClear}
        onCancel={onCancelClear}
      />
    </>
  );
}
