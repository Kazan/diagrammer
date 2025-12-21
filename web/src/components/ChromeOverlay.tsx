import { CustomToolbar, type ToolType } from "./CustomToolbar";
import { FileChip } from "./FileChip";
import { NativeStatus, type StatusMessage } from "./NativeStatus";

type Props = {
  fileName: string;
  isDirty: boolean;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  nativePresent: boolean;
  lastSaved: Date | null;
  status: StatusMessage | null;
};

export function ChromeOverlay({
  fileName,
  isDirty,
  activeTool,
  onSelectTool,
  nativePresent,
  lastSaved,
  status,
}: Props) {
  return (
    <>
      <FileChip name={fileName} isDirty={isDirty} />
      <CustomToolbar activeTool={activeTool} onSelect={onSelectTool} />
      <NativeStatus present={nativePresent} lastSaved={lastSaved} status={status} />
    </>
  );
}
