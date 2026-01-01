import type { StatusMessage } from "./NativeStatus";

interface StatusBannerProps {
  status: StatusMessage | null;
}

/**
 * Transient status banner for displaying messages like "Saved", "Load failed", etc.
 * Renders at a fixed position below the top bar.
 */
export function StatusBanner({ status }: StatusBannerProps) {
  if (!status) return null;

  return (
    <div
      className={`chrome-banner chrome-banner--${status.tone}`}
      role="status"
      aria-live="polite"
      style={{ position: "fixed", top: 80, left: 16, right: 16, zIndex: 29 }}
    >
      {status.text}
    </div>
  );
}
