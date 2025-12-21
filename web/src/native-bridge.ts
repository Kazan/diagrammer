export type NativeBridgeEvent =
  | {
      event: "onSaveComplete";
      success: boolean;
      fileName?: string;
      message?: string;
    }
  | {
      event: "onExportComplete";
      success: boolean;
      message?: string;
    }
  | {
      event: "onNativeMessage";
      success?: boolean;
      message?: string;
    }
  | {
      event?: string;
      success?: boolean;
      message?: string;
      fileName?: string;
    };

export type NativeBridge = {
  saveScene?: (json: string) => void;
  saveSceneToDocument?: (json: string) => void;
  saveSceneToCurrentDocument?: (json: string) => void;
  openSceneFromDocument?: () => void;
  loadScene?: () => string | null;
  getCurrentFileName?: () => string | null;
  exportPng?: (dataUrl: string) => void;
  exportSvg?: (dataUrl: string) => void;
};

export type NativeBridgeCallbacks = {
  onNativeMessage?: (payload: NativeBridgeEvent) => void;
  onSceneLoaded?: (sceneJson: string, fileName?: string) => void;
};

export const isNativeBridgePresent = (bridge: NativeBridge | undefined | null): bridge is NativeBridge => {
  return Boolean(
    bridge &&
      (bridge.saveScene ||
        bridge.saveSceneToDocument ||
        bridge.saveSceneToCurrentDocument ||
        bridge.openSceneFromDocument ||
        bridge.loadScene ||
        bridge.exportPng ||
        bridge.exportSvg),
  );
};

export type NativeFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableStream<any>>;
};
