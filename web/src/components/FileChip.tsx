type Props = {
  name: string;
  isDirty: boolean;
};

export function FileChip({ name, isDirty }: Props) {
  return (
    <div className={`file-chip${isDirty ? " is-dirty" : ""}`} aria-label="Current file">
      {name || "Unsaved"}
      {isDirty ? " *" : ""}
    </div>
  );
}
