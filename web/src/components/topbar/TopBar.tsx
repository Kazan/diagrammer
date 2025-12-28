import { FileStatus, type FileStatusProps } from "./FileStatus";
import { ActionBar, type ActionBarProps } from "./ActionBar";
import { cn } from "@/lib/utils";

export type TopBarProps = FileStatusProps &
  ActionBarProps & {
    className?: string;
  };

/**
 * TopBar is the main header component that combines FileStatus (left)
 * and ActionBar (right) into a single horizontal bar.
 *
 * Usage:
 * ```tsx
 * <TopBar
 *   fileName="my-diagram.excalidraw"
 *   isDirty={true}
 *   lastSaved={new Date()}
 *   canSave={true}
 *   onOpen={handleOpen}
 *   onSave={handleSave}
 *   onSaveAs={handleSaveAs}
 *   onCopySource={handleCopySource}
 *   onExportPng={handleExportPng}
 *   onExportSvg={handleExportSvg}
 *   exporting={null}
 * />
 * ```
 */
export function TopBar({
  // FileStatus props
  fileName,
  isDirty,
  lastSaved,
  // ActionBar props
  canSave,
  onOpen,
  onSave,
  onSaveAs,
  onCopySource,
  onExportPng,
  onExportSvg,
  exporting,
  // Common props
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "fixed top-4 left-4 right-4 z-30",
        "flex items-center justify-between gap-4",
        "rounded-xl border border-border/40 bg-background/80 backdrop-blur-sm",
        "px-4 py-2",
        "pointer-events-auto",
        className
      )}
      role="banner"
      aria-label="File toolbar"
    >
      <FileStatus fileName={fileName} isDirty={isDirty} lastSaved={lastSaved} />

      <ActionBar
        canSave={canSave}
        onOpen={onOpen}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onCopySource={onCopySource}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        exporting={exporting}
      />
    </header>
  );
}

// Re-export sub-components for granular usage
export { FileStatus, ActionBar };
export type { FileStatusProps, ActionBarProps };
