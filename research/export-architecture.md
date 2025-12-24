# Export Pipeline Notes (Web ↔ Native)

## Key Nuances
- Excalidraw `exportToBlob` uses `exportScale` only when `getDimensions` or `maxWidthOrHeight` is provided; without it, canvas stays at logical size (scale=1). Always pass `getDimensions` to multiply width/height and render scale.
- `exportScale` lives in `appState`; top-level `scale` is ignored. Ensure padding and frame selection are reflected when computing final pixel size.
- Use scene bounds + padding to derive target pixel dimensions; log expected vs. actual to catch regressions.
- Measuring the data URL image in JS (naturalWidth/naturalHeight) before handing to native is the fastest way to confirm exporter output.
- Native bridge currently accepts base64 data URLs and writes to MediaStore; it does not resize or recompress. Size shrinkage before native implies JS export issues.
- Log lines must be single-line JSON to survive `adb logcat -s DiagrammerWebView NativeBridge` filtering.

## Recommended Pattern (PNG)
- Compute `exportScale` from DPR and desired long edge.
- Pass `getDimensions: (w,h) => ({ width: w*exportScale, height: h*exportScale, scale: exportScale })` to `exportToBlob`.
- Keep `exportPadding` explicit and include it in expected pixel calculations.
- Serialize logs: `[export-metrics][png]` for expected size; `[export-payload][png]` for actual blob size and natural dimensions.

## Debug Checklist
- If expected px >> actual natural px: missing `getDimensions`/`maxWidthOrHeight` or wrong `exportScale`.
- If JS natural px is correct but saved file is small: inspect native save path (data URL decoding, MediaStore write).
- If logs are missing in logcat: ensure prefix and single-line JSON; check `DiagrammerWebView`/`NativeBridge` tags.

## Future Work
- Add an automated assert in web layer to warn when `naturalWidth` deviates from expected by >10%.
- Consider exposing a user-facing DPI selector that maps to `exportScale` + `getDimensions` to avoid silent fallbacks.
- Add a native-side byte-length + mime validation before write to catch truncation early.
