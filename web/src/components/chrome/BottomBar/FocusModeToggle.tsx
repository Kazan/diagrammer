import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FocusModeToggleProps = {
  /** Whether focus mode is currently active */
  isFocusMode: boolean;
  /** Callback to toggle focus mode */
  onToggle: () => void;
};

/**
 * Toggle button to enter/exit focus mode (hide all UI).
 * This button remains visible when focus mode is active so the user can exit.
 */
export function FocusModeToggle({ isFocusMode, onToggle }: FocusModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFocusMode ? "Show UI" : "Hide UI"}
      aria-pressed={isFocusMode}
      title={isFocusMode ? "Show UI (exit focus mode)" : "Hide UI (focus mode)"}
      className={cn(
        "flex items-center justify-center size-9 rounded-lg",
        "border transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]",
        isFocusMode
          ? "bg-[var(--btn-pressed-bg)] border-[var(--btn-pressed-border)] text-[var(--btn-pressed-text)] hover:bg-[var(--btn-pressed-hover-bg)]"
          : "bg-[var(--btn-bg)] border-[var(--btn-border)] text-[var(--btn-text)] hover:bg-[var(--btn-hover-bg)] hover:border-[var(--btn-hover-border)] hover:text-[var(--btn-hover-text)]"
      )}
    >
      {isFocusMode ? (
        <EyeIcon className="size-5" />
      ) : (
        <EyeOffIcon className="size-5" />
      )}
    </button>
  );
}
