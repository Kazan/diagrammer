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

export function NativeStatus({ present, lastSaved, status }: Props) {
  const colorVar = present ? "var(--status-ok)" : "var(--status-warn)";
  return (
    <div
      className="native-status"
      style={{
        borderColor: present ? "rgb(from var(--status-ok) r g b / 0.4)" : "rgb(from var(--status-warn) r g b / 0.4)",
        color: colorVar,
      }}
    >
      <div className="native-status__row">
        <span className="native-status__dot" style={{ backgroundColor: colorVar }} />
        NativeBridge: {present ? "ready" : "not available"}
      </div>
      {lastSaved ? (
        <div className="native-status__meta">Saved at {lastSaved.toLocaleTimeString()}</div>
      ) : (
        <div className="native-status__meta">No saves yet</div>
      )}
      {status ? (
        <div
          className="native-status__banner"
          style={{
            borderColor: status.tone === "ok"
              ? "rgb(from var(--status-ok) r g b / 0.4)"
              : status.tone === "warn"
              ? "rgb(from var(--status-warn) r g b / 0.4)"
              : "rgb(from var(--status-error) r g b / 0.4)",
          }}
        >
          {status.text}
        </div>
      ) : null}
    </div>
  );
}
