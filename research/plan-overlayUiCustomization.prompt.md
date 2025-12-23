## Plan: UI-Only Customization atop Existing Interception

Keep the current interception flow untouched; add overlay UI and tool affordances that drive Excalidraw 0.18.0 via the existing imperative API. Use the overlay components as extension slots and respect current dialog hijack and dirty-state tracking.

### Steps
1. Expand overlay chrome in [web/src/components/ChromeOverlay.tsx](web/src/components/ChromeOverlay.tsx) and styling in [web/src/index.css](web/src/index.css) with new panels/buttons (e.g., save/export shortcuts, status chips) without touching the interception logic.
2. Grow the overlay tool union and buttons in [web/src/components/CustomToolbar.tsx](web/src/components/CustomToolbar.tsx) to include supported v0.18.0 tools (selection, hand, eraser, frame, laser if desired) and keep routing selections through the existing callback.
3. Reuse the captured API in [web/src/App.tsx](web/src/App.tsx) to handle new UI actions via `setActiveTool` and other exposed methods, avoiding any new tool types absent in 0.18.0 and leaving the current dialog hijack intact.
4. When adding UI that updates state, merge appState carefully (helper) so dirty/signature tracking in [web/src/hooks/useSceneChangeSubscription.ts](web/src/hooks/useSceneChangeSubscription.ts) remains correct and openDialog hijack keeps working.
5. Add any extra file/status chips in [web/src/components/ChromeOverlay.tsx](web/src/components/ChromeOverlay.tsx) (or sibling components) that surface metadata while continuing to rely on the native picker routing already in place.

### Further Considerations
1. Which new tool buttons should appear first (selection/hand/eraser/frame/laser), given lasso is unavailable in v0.18.0?
