import { useState, useEffect } from "react";
import { ChevronDownIcon, PlusIcon, Trash2Icon, CheckIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LibraryItem } from "./types";
import { useLibraryItemSvg } from "./useLibraryItemSvg";

interface PersonalLibrarySectionProps {
  items: LibraryItem[];
  columns?: number;
  itemSize?: number;
  onItemClick: (item: LibraryItem) => void;
  onAddItem: (elements: readonly ExcalidrawElement[]) => boolean;
  onRemoveItem: (itemId: string) => void;
  selectedElements: readonly ExcalidrawElement[];
  /** ID of the item that matches the current selection (if any) */
  matchingItemId?: string | null;
  forceExpanded?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isExpanded: boolean) => void;
}

/**
 * Thumbnail preview for current selection with add button overlay.
 */
function SelectionPreview({
  elements,
  size,
  onAdd,
}: {
  elements: readonly ExcalidrawElement[];
  size: number;
  onAdd: () => void;
}) {
  const previewId = `selection-preview-${elements.map((e) => e.id).join("-").slice(0, 50)}`;
  const { svg, isPending } = useLibraryItemSvg(previewId, elements);

  return (
    <button
      type="button"
      onClick={onAdd}
      title="Add selection to personal library"
      className={cn(
        "group relative flex items-center justify-center",
        "rounded-lg border-2 border-dashed border-[hsl(var(--accent))]",
        "bg-[hsla(var(--accent),0.08)] hover:bg-[hsla(var(--accent),0.15)]",
        "transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]",
        "cursor-pointer overflow-hidden"
      )}
      style={{
        width: size,
        height: size,
      }}
    >
      {isPending || !svg ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full border-2 border-[hsl(var(--accent))] border-t-transparent animate-spin"
            style={{ width: size * 0.3, height: size * 0.3 }}
          />
        </div>
      ) : (
        <div
          className="w-full h-full p-1.5 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto opacity-60 group-hover:opacity-80"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {/* Add icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-[hsla(var(--accent),0.1)] opacity-0 group-hover:opacity-100 transition-opacity">
        <PlusIcon className="size-6 text-[hsl(var(--accent))]" />
      </div>
    </button>
  );
}

/**
 * Personal library item with delete option on hover.
 * Shows a checkmark badge when it matches the current selection.
 */
function PersonalLibraryItem({
  item,
  size,
  onClick,
  onRemove,
  isMatchingSelection,
}: {
  item: LibraryItem;
  size: number;
  onClick: () => void;
  onRemove: () => void;
  isMatchingSelection?: boolean;
}) {
  const { svg, isPending } = useLibraryItemSvg(item.id, item.elements);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        title={item.name}
        className={cn(
          "relative flex items-center justify-center",
          "rounded-lg border",
          isMatchingSelection
            ? "border-[hsl(var(--accent))] ring-2 ring-[hsl(var(--accent))]"
            : "border-[var(--tile-border)] hover:border-[var(--tile-hover-border)]",
          "bg-[var(--tile-bg)] hover:bg-[var(--tile-hover-bg)]",
          "transition-colors duration-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]",
          "cursor-pointer overflow-hidden"
        )}
        style={{
          width: size,
          height: size,
        }}
      >
        {isPending || !svg ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-full border-2 border-[var(--muted-text)] border-t-transparent animate-spin"
              style={{ width: size * 0.3, height: size * 0.3 }}
            />
          </div>
        ) : (
          <div
            className="w-full h-full p-1.5 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </button>
      {/* Checkmark badge when matching selection */}
      {isMatchingSelection && (
        <div
          className={cn(
            "absolute -top-1.5 -right-1.5",
            "flex items-center justify-center size-5 rounded-full",
            "bg-[hsl(var(--accent))] text-white"
          )}
        >
          <CheckIcon className="size-3" />
        </div>
      )}
      {/* Delete button overlay - only show when NOT matching */}
      {!isMatchingSelection && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from library"
          className={cn(
            "absolute -top-1.5 -right-1.5",
            "flex items-center justify-center size-5 rounded-full",
            "bg-red-500 text-white",
            "opacity-0 group-hover:opacity-100",
            "transition-opacity duration-100",
            "hover:bg-red-600",
            "focus-visible:opacity-100"
          )}
        >
          <Trash2Icon className="size-3" />
        </button>
      )}
    </div>
  );
}

export function PersonalLibrarySection({
  items,
  columns = 4,
  itemSize = 64,
  onItemClick,
  onAddItem,
  onRemoveItem,
  selectedElements,
  matchingItemId,
  forceExpanded = false,
  defaultOpen = false,
  onToggle,
}: PersonalLibrarySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasSelection = selectedElements.length > 0;
  const selectionAlreadyExists = hasSelection && matchingItemId != null;
  // Only count the preview tile if the selection doesn't already exist in the library
  const totalCount = items.length + (hasSelection && !selectionAlreadyExists ? 1 : 0);

  // Auto-expand when search matches or when there's a selection
  useEffect(() => {
    if (forceExpanded || hasSelection) {
      setIsOpen(true);
    }
  }, [forceExpanded, hasSelection]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onToggle?.(open);
  };

  const handleAddSelection = () => {
    if (selectedElements.length > 0) {
      onAddItem(selectedElements);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 py-2 px-1",
          "text-sm font-semibold text-[var(--section-title)]",
          "hover:bg-[var(--tile-hover-bg)] rounded-md transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]",
          "sticky top-0 z-10 bg-[var(--flyout-bg)]"
        )}
      >
        <span className="truncate">My Shapes</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[var(--muted-text)] font-normal">
            {totalCount}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 text-[var(--muted-text)] transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-3">
        {totalCount === 0 && !selectionAlreadyExists ? (
          <div className="text-xs text-[var(--muted-text)] text-center py-4 px-2">
            Select shapes on canvas to add them here
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
            }}
          >
            {/* Current selection preview with add button - only show if NOT already in library */}
            {hasSelection && !selectionAlreadyExists && (
              <SelectionPreview
                elements={selectedElements}
                size={itemSize}
                onAdd={handleAddSelection}
              />
            )}
            {/* Saved personal items */}
            {items.map((item) => (
              <PersonalLibraryItem
                key={item.id}
                item={item}
                size={itemSize}
                onClick={() => onItemClick(item)}
                onRemove={() => onRemoveItem(item.id)}
                isMatchingSelection={item.id === matchingItemId}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
