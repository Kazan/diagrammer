import type { StatusMessage } from "./NativeStatus";

interface StatusBannerProps {
  status: StatusMessage | null;
}

/**
 * Transient status banner for displaying messages like "Saved", "Load failed", etc.
 * Renders at a fixed position at the bottom center of the screen.
 */
export function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <div
      className={`chrome-banner chrome-banner--${status.tone} fixed bottom-6 left-1/2 -translate-x-1/2 z-[29]`}
      role="status"
      aria-live="polite"
    >
      {status.text}
    </div>
  );
}
