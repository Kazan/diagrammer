import { isNativeContext } from "../hooks/useNativeBridge";

const statusColors = {
  ok: "var(--status-ok)",
  warn: "var(--status-warn)",
  err: "var(--status-error)",
};

export type StatusMessage = { text: string; tone: keyof typeof statusColors };

type Props = {
  present: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
};

/**
 * NativeStatus was previously used to display a "Native Bridge" indicator.
 *
 * This component now renders nothing because:
 * - In native Android context: The native layer displays its own Material Chip
 *   on top of the WebView, so no web-based indicator is needed.
 * - In browser context: There's no native bridge, so showing a "disconnected"
 *   indicator isn't useful for users.
 *
 * The StatusMessage type is still exported for use by other components.
 */
export function NativeStatus(_props: Props) {
  // Native badge is now handled by the Android native layer.
  // In browser contexts, we don't show any native status indicator.
  return null;
}
