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

export function NativeStatus({ present }: Props) {
  const colorVar = present ? "var(--status-ok)" : "var(--status-warn)";
  return (
    <div className="native-status">
      <span className="native-status__dot" style={{ backgroundColor: colorVar }} />
      <span className="native-status__label">Native Bridge</span>
    </div>
  );
}
