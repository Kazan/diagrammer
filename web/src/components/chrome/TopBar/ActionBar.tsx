import {
  FolderOpenIcon,
  SaveIcon,
  SaveAllIcon,
  CopyIcon,
  ImageIcon,
  FileCodeIcon,
  Loader2Icon,
  EraserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type ActionBarProps = {
  /** Whether the native bridge is available (Android WebView) */
  nativePresent?: boolean;
  /** Whether the current file can be saved (has a known location) */
  canSave: boolean;
  /** Whether the scene currently has any visible elements */
  hasSceneContent: boolean;
  /** Callback when "Open" is clicked */
  onOpen: () => void;
  /** Callback when "Save" is clicked (quick save to current location) */
  onSave: () => void;
  /** Callback when "Save As" is clicked (save to new location) */
  onSaveAs: () => void;
  /** Callback when "Copy Source" is clicked */
  onCopySource: () => void;
  /** Callback when "Export PNG" is clicked */
  onExportPng: () => void;
  /** Callback when "Export SVG" is clicked */
  onExportSvg: () => void;
  /** Callback when "Clear" is clicked */
  onClear: () => void;
  /** Which export is currently in progress, if any */
  exporting: "png" | "svg" | null;
  /** Whether the current scene has unsaved changes */
  isDirty: boolean;
  /** Toggle visibility of the Open button */
  showOpen?: boolean;
  /** Toggle visibility of the Save button */
  showSave?: boolean;
  /** Toggle visibility of the Save As button */
  showSaveAs?: boolean;
  /** Toggle visibility of the Copy button */
  showCopySource?: boolean;
  /** Toggle visibility of the Export PNG button */
  showExportPng?: boolean;
  /** Toggle visibility of the Export SVG button */
  showExportSvg?: boolean;
  /** Toggle visibility of the Clear button */
  showClear?: boolean;
};

/**
 * ActionBar displays a horizontal group of action buttons for file operations.
 * Used on the right side of the TopBar.
 */
export function ActionBar({
  nativePresent = true,
  canSave,
  hasSceneContent,
  onOpen,
  onSave,
  onSaveAs,
  onCopySource,
  onExportPng,
  onExportSvg,
  onClear,
  exporting,
  isDirty,
  showOpen = true,
  showSave = true,
  showSaveAs = true,
  showCopySource = true,
  showExportPng = true,
  showExportSvg = true,
  showClear = true,
}: ActionBarProps) {
  const chromeButtonTone =
    "bg-[var(--btn-bg)] text-[var(--btn-text)] border-[var(--btn-border)] hover:bg-[var(--btn-hover-bg)] hover:text-[var(--btn-hover-text)] hover:border-[var(--btn-hover-border)] active:bg-[var(--btn-pressed-bg)] active:text-[var(--btn-pressed-text)] active:border-[var(--btn-pressed-border)] shadow-none";

  const hasFileActions =
    showOpen || (showSave && canSave) || showSaveAs || showCopySource;
  const hasExportActions = showExportPng || showExportSvg;
  const hasClearActions = showClear;

  return (
    <ButtonGroup
      className="gap-1 pointer-events-auto"
      aria-label="Scene actions"
    >
      {/* File operations group */}
      {hasFileActions && (
        <ButtonGroup>
          {showOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onOpen}
                >
                  <FolderOpenIcon />
                  <span className="hidden sm:inline">Open</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open scene</TooltipContent>
            </Tooltip>
          )}

          {showSave && canSave && nativePresent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onSave}
                >
                  <SaveIcon />
                  <span className="hidden sm:inline">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save to current file</TooltipContent>
            </Tooltip>
          )}

          {showSaveAs && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onSaveAs}
                  disabled={!hasSceneContent}
                >
                  <SaveAllIcon />
                  <span className="hidden sm:inline">{nativePresent ? "Save As" : "Save to…"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{nativePresent ? "Save to new location" : "Download scene file"}</TooltipContent>
            </Tooltip>
          )}

          {showCopySource && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onCopySource}
                >
                  <CopyIcon />
                  <span className="hidden sm:inline">Copy</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy scene source to clipboard</TooltipContent>
            </Tooltip>
          )}
        </ButtonGroup>
      )}

      {hasFileActions && hasExportActions ? (
        <ButtonGroupSeparator className="mx-1 h-6 self-center" />
      ) : null}

      {/* Export group */}
      {hasExportActions && (
        <ButtonGroup>
          {showExportPng && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onExportPng}
                  disabled={!hasSceneContent || exporting === "png"}
                >
                  {exporting === "png" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <ImageIcon />
                  )}
                  <span className="hidden sm:inline">
                    {exporting === "png" ? "Exporting…" : "PNG"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export as PNG image</TooltipContent>
            </Tooltip>
          )}

          {showExportSvg && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={chromeButtonTone}
                  onClick={onExportSvg}
                  disabled={!hasSceneContent || exporting === "svg"}
                >
                  {exporting === "svg" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <FileCodeIcon />
                  )}
                  <span className="hidden sm:inline">
                    {exporting === "svg" ? "Exporting…" : "SVG"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export as SVG vector</TooltipContent>
            </Tooltip>
          )}
        </ButtonGroup>
      )}

      {(hasFileActions || hasExportActions) && hasClearActions ? (
        <ButtonGroupSeparator className="mx-1 h-6 self-center" />
      ) : null}

      {/* Clear group */}
      {hasClearActions && (
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={chromeButtonTone}
                onClick={onClear}
                disabled={!hasSceneContent}
              >
                <EraserIcon />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear canvas</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      )}
    </ButtonGroup>
  );
}
