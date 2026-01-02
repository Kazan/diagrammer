import { FileIcon, CircleIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FileStatusProps = {
  fileName: string;
  isDirty: boolean;
  lastSaved: Date | null;
  /** Whether native bridge is available - controls what info is shown */
  nativePresent?: boolean;
};

/**
 * FileStatus displays the current file name and state indicators (dirty/clean, saved/unsaved).
 * Used on the left side of the TopBar.
 * When nativePresent is false, only shows a minimal "Edited" indicator when dirty.
 */
export function FileStatus({ fileName, isDirty, lastSaved, nativePresent = true }: FileStatusProps) {
  // When native bridge is not available, show minimal UI
  if (!nativePresent) {
    if (!isDirty) return null;
    return (
      <div className="flex items-center">
        <Badge
          variant="outline"
          className="gap-1.5 text-xs border-red-400/60 bg-red-500/15 text-red-600"
        >
          <CircleIcon className="size-2 fill-current" />
          Edited
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* File name with icon */}
      <div className="flex items-center gap-2 min-w-0">
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-sm text-foreground">
          {fileName || "Untitled"}
          {isDirty && <span className="text-warning ml-0.5">*</span>}
        </span>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 text-xs",
            isDirty
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-success/40 bg-success/10 text-success"
          )}
        >
          {isDirty ? (
            <>
              <CircleIcon className="size-2 fill-current" />
              Unsaved
            </>
          ) : (
            <>
              <CheckCircleIcon className="size-3" />
              Saved
            </>
          )}
        </Badge>

        {lastSaved && (
          <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
            {formatLastSaved(lastSaved)}
          </Badge>
        )}
      </div>
    </div>
  );
}

function formatLastSaved(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
