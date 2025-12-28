import {
  FolderOpenIcon,
  SaveIcon,
  SaveAllIcon,
  CopyIcon,
  ImageIcon,
  FileCodeIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type ActionBarProps = {
  /** Whether the current file can be saved (has a known location) */
  canSave: boolean;
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
  /** Which export is currently in progress, if any */
  exporting: "png" | "svg" | null;
};

/**
 * ActionBar displays a horizontal group of action buttons for file operations.
 * Used on the right side of the TopBar.
 */
export function ActionBar({
  canSave,
  onOpen,
  onSave,
  onSaveAs,
  onCopySource,
  onExportPng,
  onExportSvg,
  exporting,
}: ActionBarProps) {
  return (
    <ButtonGroup className="gap-1">
      {/* File operations group */}
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpen}>
              <FolderOpenIcon />
              <span className="hidden sm:inline">Open</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open scene</TooltipContent>
        </Tooltip>

        {canSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onSave}>
                <SaveIcon />
                <span className="hidden sm:inline">Save</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save to current file</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onSaveAs}>
              <SaveAllIcon />
              <span className="hidden sm:inline">Save As</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save to new location</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onCopySource}>
              <CopyIcon />
              <span className="hidden sm:inline">Copy</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy scene source to clipboard</TooltipContent>
        </Tooltip>
      </ButtonGroup>

      <ButtonGroupSeparator className="mx-1 h-6 self-center" />

      {/* Export group */}
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExportPng}
              disabled={exporting === "png"}
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExportSvg}
              disabled={exporting === "svg"}
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
      </ButtonGroup>
    </ButtonGroup>
  );
}
