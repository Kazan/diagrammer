const statusColors = {
  ok: "#3fcf8e",
  warn: "#f59e0b",
  err: "#ef4444",
};

export type StatusMessage = { text: string; tone: keyof typeof statusColors };

type Props = {
  present: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
};

export function NativeStatus({ present, lastSaved, status }: Props) {
  const color = present ? statusColors.ok : statusColors.warn;
  return (
    <div className="native-status" style={{ borderColor: `${color}66`, color }}>
      <div className="native-status__row">
        <span className="native-status__dot" style={{ backgroundColor: color }} />
        NativeBridge: {present ? "ready" : "not available"}
      </div>
      {lastSaved ? (
        <div className="native-status__meta">Saved at {lastSaved.toLocaleTimeString()}</div>
      ) : (
        <div className="native-status__meta">No saves yet</div>
      )}
      {status ? (
        <div className="native-status__banner" style={{ borderColor: `${statusColors[status.tone]}66` }}>
          {status.text}
        </div>
      ) : null}
    </div>
  );
}
