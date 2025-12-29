## Plan: Bundled Object Libraries with Right-Side Collapsible Sidebar

Add an isolated, self-contained library sidebar component that slides out from the right edge, with collapsible sections, search filtering, and configurable thumbnail grid.

### Steps

1. **Add Radix Collapsible primitive in [web/src/components/ui/collapsible.tsx](web/src/components/ui/collapsible.tsx)**
   Install `@radix-ui/react-collapsible`, export `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` wrappers.

2. **Create self-contained library module in [web/src/components/LibrarySidebar/](web/src/components/LibrarySidebar/)**
   All library logic isolated here—no dependencies on App state except `excalidrawAPI` passed as prop:
   - `index.ts` — public exports (`LibrarySidebar`, `LibraryTrigger`)
   - `types.ts` — internal types (`LibraryItem`, `LibraryCategory`, `LibrarySidebarConfig`)
   - `loader.ts` — import/normalize `.excalidrawlib` files, extract names from text elements, fallback to "Item N"
   - `useLibrarySearch.ts` — filter hook with auto-expand logic
   - `useLibraryItemSvg.ts` — `exportToSvg` with module-level cache and `useTransition`
   - `LibrarySidebar.tsx` — main panel component
   - `LibrarySection.tsx` — collapsible section per library
   - `LibraryGrid.tsx` — configurable grid (`columns`, `itemSize` props, defaults: 5 cols, 64px)
   - `LibraryThumbnail.tsx` — single item with cached SVG rendering
   - `LibraryTrigger.tsx` — vertical edge button

3. **Configure grid layout via props in `LibraryGrid.tsx`**
   Accept `columns?: number` (default 5) and `itemSize?: number` (default 64), compute `grid-template-columns` and tile dimensions dynamically. Easy to adjust without code changes.

4. **Implement insertion utility in [web/src/components/LibrarySidebar/insertLibraryItem.ts](web/src/components/LibrarySidebar/insertLibraryItem.ts)**
   Clone elements, regenerate IDs, offset to viewport center, call `api.updateScene()` with `captureUpdate: CaptureUpdateAction.IMMEDIATELY`—all self-contained.

5. **Wire minimal integration in [ChromeOverlay.tsx](web/src/components/ChromeOverlay.tsx)**
   Import `LibrarySidebar` and `LibraryTrigger`, render at right edge, pass only `excalidrawAPI` prop. Component manages its own open/closed state internally.

6. **Add CSS variables for library panel in [web/src/index.css](web/src/index.css)**
   Define `--library-panel-width`, `--library-item-size`, `--library-columns` tokens for easy theming, referenced by the component.

### Further Considerations

1. **Keyboard shortcut?** Add a hotkey (e.g., `L`) to toggle sidebar, or keep mouse-only for now?
2. **Close on insert?** Auto-close sidebar after inserting an item, or keep open for multiple insertions?
