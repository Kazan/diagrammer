# Excalidraw JSON schema (from official docs)

## File (.excalidraw)
- Attributes: `type: "excalidraw"`, `version: number`, `source: "https://excalidraw.com"`, `elements: []`, `appState: {}`, `files: { [fileId]: fileData }`.
- `elements`: array of shape objects (rectangle, ellipse, diamond, arrow, line, freedraw, text, image, frame). Common fields: `id`, `type`, `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `strokeWidth`, `roughness`, `opacity`, `roundness`, `seed`, `version`, `versionNonce`, `isDeleted`, `boundElements`, `updated`, `groupIds`. Text adds `text`, `fontSize`, `fontFamily`, `textAlign`, `verticalAlign`. Lines/arrows add `points`, `startBinding`, `endBinding`.
- `appState` (optional but common): `gridSize`, `viewBackgroundColor`, `scrollX`, `scrollY`, `zoom: { value }`, `theme`, `currentItemStrokeColor`, `currentItemBackgroundColor`, `currentItemStrokeWidth`, `currentItemRoughness`, `currentItemFontFamily`, `currentItemFontSize`.
- `files`: map keyed by `fileId`; each value includes `mimeType`, `id`, `dataURL` (base64 data URI), `created`, `lastRetrieved`.

### File example (from docs)
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "pologsyG-tAraPgiN9xP9b",
      "type": "rectangle",
      "x": 928,
      "y": 319,
      "width": 134,
      "height": 90
      /* ...other element properties */
    }
  ],
  "appState": {
    "gridSize": 20,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {
    "3cebd7720911620a3938ce77243696149da03861": {
      "mimeType": "image/png",
      "id": "3cebd7720911620a3938c.77243626149da03861",
      "dataURL": "data:image/png;base64,iVBORWOKGgoAAAANSUhEUgA=",
      "created": 1690295874454,
      "lastRetrieved": 1690295874454
    }
  }
}
```

## Clipboard payload
- Attributes: `type: "excalidraw/clipboard"`, `elements`, optional `files`.
- No `version`, `source`, or `appState`.

### Clipboard checklist
- Include only selected elements; z-order matches array order.
- If images present, include matching `files` entries.
