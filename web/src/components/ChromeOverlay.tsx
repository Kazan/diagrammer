import { CustomToolbar, type ToolType } from "./CustomToolbar";
import { FileChip } from "./FileChip";
import { NativeStatus, type StatusMessage } from "./NativeStatus";
import { ZoomControls } from "./ZoomControls";

type Props = {
  fileName: string;
  isDirty: boolean;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  nativePresent: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
  canSave: boolean;
  onOpen: () => void;
  onSaveNow: () => void;
  onSaveToDocument: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  exporting: "png" | "svg" | null;
  zoom: { value: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToContent: () => void;
  onUndo: () => void;
};

function StatusChip({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "err";
  label: string;
}) {
  return <span className={`status-chip status-chip--${tone}`}>{label}</span>;
}

export function ChromeOverlay({
  fileName,
  isDirty,
  activeTool,
  onSelectTool,
  nativePresent,
  lastSaved,
  status,
  canSave,
  onOpen,
  onSaveNow,
  onSaveToDocument,
  onExportPng,
  onExportSvg,
  exporting,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomToContent,
  onUndo,
}: Props) {
  return (
    <>
      <div className="chrome-overlay">
        <div className="chrome-strip" role="region" aria-label="Canvas controls">
          <div className="chrome-strip__meta">
            <FileChip name={fileName} isDirty={isDirty} />
            <div className="chrome-strip__chips" aria-label="File state">
              <StatusChip tone={isDirty ? "warn" : "ok"} label={isDirty ? "Dirty" : "Clean"} />
              <StatusChip
                tone={lastSaved ? "ok" : "warn"}
                label={lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : "Unsaved"}
              />
            </div>
          </div>
          <div className="chrome-strip__actions" aria-label="File actions">
            <button type="button" className="chrome-button" onClick={onOpen}>
              Open
            </button>
            {canSave ? (
              <button type="button" className="chrome-button" onClick={onSaveNow}>
                Save
              </button>
            ) : null}
            <button type="button" className="chrome-button" onClick={onSaveToDocument}>
              Save as…
            </button>
            <span className="chrome-strip__divider" aria-hidden="true" />
            <button
              type="button"
              className="chrome-button"
              onClick={onExportPng}
              disabled={exporting === "png"}
              aria-busy={exporting === "png"}
            >
              {exporting === "png" ? "Exporting PNG…" : "Export PNG"}
            </button>
            <button
              type="button"
              className="chrome-button"
              onClick={onExportSvg}
              disabled={exporting === "svg"}
              aria-busy={exporting === "svg"}
            >
              {exporting === "svg" ? "Exporting SVG…" : "Export SVG"}
            </button>
          </div>
        </div>
        {status ? (
          <div className={`chrome-banner chrome-banner--${status.tone}`} role="status" aria-live="polite">
            {status.text}
          </div>
        ) : null}
      </div>
      <CustomToolbar activeTool={activeTool} onSelect={onSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
      <ZoomControls
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onCenter={onZoomToContent}
        onUndo={onUndo}
      />
    </>
  );
}
