declare global {
  interface Window {
    NativeBridge?: {
      saveScene?: (json: string) => void;
      loadScene?: () => string | null;
      exportPng?: (dataUrl: string) => void;
      exportSvg?: (dataUrl: string) => void;
    };
  }
}

export {};
