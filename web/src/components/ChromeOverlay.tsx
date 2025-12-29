import { CustomToolbar, type ToolType } from "./CustomToolbar";
import { NativeStatus, type StatusMessage } from "./NativeStatus";
import { ZoomControls } from "./ZoomControls";
import { TopBar } from "./topbar";
import { Button } from "@/components/ui/button";
import { EraserIcon } from "lucide-react";

type Props = {
  fileName: string;
  isDirty: boolean;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
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
  zoom: { value: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToContent: () => void;
  onUndo: () => void;
  canUndo: boolean;
};

export function ChromeOverlay({
  fileName,
  isDirty,
  activeTool,
  onSelectTool,
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
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToContent,
  onUndo,
  canUndo,
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

      {/* Status banner for transient messages */}
      {status ? (
        <div
          className={`chrome-banner chrome-banner--${status.tone}`}
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 80, left: 16, right: 16, zIndex: 29 }}
        >
          {status.text}
        </div>
      ) : null}

      <CustomToolbar activeTool={activeTool} onSelect={onSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
      <ZoomControls
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onZoomToContent={onZoomToContent}
        onUndo={onUndo}
        canUndo={canUndo}
        hasSceneContent={hasSceneContent}
      />

      {showClearConfirm ? (
        <div
          className="fixed inset-0 z-40 pointer-events-auto flex items-start justify-end pt-20 pr-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm clear"
        >
          <div className="absolute inset-0 bg-black/10" aria-hidden="true" onClick={onCancelClear} />
          <div
            className="relative w-72 rounded-md border border-slate-200 bg-white p-3 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-slate-900">Clear canvas?</div>
            <div className="text-xs text-slate-600">
              You have unsaved changes. Choose Clear to wipe now, or tap outside to keep editing and save first.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center h-9 bg-[var(--btn-bg)] text-[var(--btn-text)] border-[var(--btn-border)] hover:bg-[var(--btn-hover-bg)] hover:text-[var(--btn-hover-text)] hover:border-[var(--btn-hover-border)] active:bg-[var(--btn-pressed-bg)] active:text-[var(--btn-pressed-text)] active:border-[var(--btn-pressed-border)] shadow-none"
              onClick={onForceClear}
            >
              <EraserIcon className="mr-1.5 size-4" />
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
