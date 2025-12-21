declare global {
  interface Window {
    NativeBridge?: {
      saveScene?: (json: string) => void;
      saveSceneToDocument?: (json: string) => void;
      openSceneFromDocument?: () => void;
      loadScene?: () => string | null;
      exportPng?: (dataUrl: string) => void;
      exportSvg?: (dataUrl: string) => void;
    };
    NativeBridgeCallbacks?: {
      onNativeMessage?: (payload: {
        event?: string;
        success?: boolean;
        message?: string;
      }) => void;
      onSceneLoaded?: (sceneJson: string) => void;
    };
  }
}

export {};
