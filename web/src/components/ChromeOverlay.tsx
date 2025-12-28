import { CustomToolbar, type ToolType } from "./CustomToolbar";
import { NativeStatus, type StatusMessage } from "./NativeStatus";
import { ZoomControls } from "./ZoomControls";
import { TopBar } from "./topbar";

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
        canSave={canSave}
        hasSceneContent={hasSceneContent}
        onOpen={onOpen}
        onSave={onSaveNow}
        onSaveAs={onSaveToDocument}
        onCopySource={onCopySource}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        exporting={exporting}
        isDirty={isDirty}
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
      />
    </>
  );
}
