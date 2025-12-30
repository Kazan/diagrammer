import { cn } from "@/lib/utils";
import { Shapes } from "lucide-react";

interface LibraryTriggerProps {
  onClick: () => void;
  isOpen: boolean;
}

export function LibraryTrigger({ onClick, isOpen }: LibraryTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? "Close library sidebar" : "Open library sidebar"}
      className={cn(
        "fixed right-0 z-[var(--z-chrome)]",
        "flex items-center justify-center",
        "w-8 h-20 rounded-l-lg",
        "border border-r-0 border-[var(--btn-border)]",
        "bg-[var(--btn-bg)] hover:bg-[var(--btn-hover-bg)]",
        "text-[var(--btn-text)] hover:text-[var(--btn-hover-text)]",
        "transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]",
        isOpen && "bg-[var(--btn-pressed-bg)] text-[var(--btn-pressed-text)]"
      )}
      style={{
        top: "50%",
        transform: "translateY(-50%)",
      }}
    >
      <Shapes className="size-5" />
    </button>
  );
}
