import { Button } from "@/components/ui/button";
import { EraserIcon } from "lucide-react";

interface ClearConfirmDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Called when user confirms the clear action */
  onConfirm: () => void;
  /** Called when user cancels (clicks outside or dismisses) */
  onCancel: () => void;
}

/**
 * Confirmation dialog shown when user attempts to clear a canvas with unsaved changes.
 * Appears as a dropdown-style popover near the top-right of the screen.
 */
export function ClearConfirmDialog({ open, onConfirm, onCancel }: ClearConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-auto flex items-start justify-end pt-20 pr-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm clear"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/10"
        aria-hidden="true"
        onClick={onCancel}
      />
      {/* Dialog content */}
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
          onClick={onConfirm}
        >
          <EraserIcon className="mr-1.5 size-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
