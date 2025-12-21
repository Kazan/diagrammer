import React from "react";

export type ActionAvailability = {
  canOpen: boolean;
  canSave: boolean;
  canSaveAs: boolean;
  canExportPng: boolean;
  canExportSvg: boolean;
  canReset: boolean;
};

type Props = {
  availability: ActionAvailability;
  exporting: "png" | "svg" | null;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onReset: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
};

export function ActionToolbar({
  availability,
  exporting,
  onOpen,
  onSave,
  onSaveAs,
  onReset,
  onExportPng,
  onExportSvg,
}: Props) {
  const actions = [
    {
      id: "open",
      label: "Open",
      onClick: onOpen,
      enabled: availability.canOpen,
      busy: false,
    },
    {
      id: "save",
      label: "Save",
      onClick: onSave,
      enabled: availability.canSave,
      busy: false,
    },
    {
      id: "save-as",
      label: "Save as",
      onClick: onSaveAs,
      enabled: availability.canSaveAs,
      busy: false,
    },
    {
      id: "reset",
      label: "Reset Canvas",
      onClick: onReset,
      enabled: availability.canReset,
      busy: false,
    },
    {
      id: "export-png",
      label: exporting === "png" ? "Exporting PNG..." : "Export PNG",
      onClick: onExportPng,
      enabled: availability.canExportPng && !exporting,
      busy: exporting === "png",
    },
    {
      id: "export-svg",
      label: exporting === "svg" ? "Exporting SVG..." : "Export SVG",
      onClick: onExportSvg,
      enabled: availability.canExportSvg && !exporting,
      busy: exporting === "svg",
    },
  ];

  return (
    <nav className="action-toolbar" aria-label="File and export actions">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`action-button${action.busy ? " is-busy" : ""}`}
          onClick={action.onClick}
          disabled={!action.enabled}
          aria-busy={action.busy}
        >
          {action.label}
        </button>
      ))}
    </nav>
  );
}
