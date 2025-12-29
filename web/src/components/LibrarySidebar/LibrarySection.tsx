import { useState, useEffect } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { LibraryCategory, LibraryItem } from "./types";
import { LibraryGrid } from "./LibraryGrid";

interface LibrarySectionProps {
  category: LibraryCategory;
  columns?: number;
  itemSize?: number;
  onItemClick: (item: LibraryItem) => void;
  forceExpanded?: boolean;
  defaultOpen?: boolean;
}

export function LibrarySection({
  category,
  columns = 5,
  itemSize = 64,
  onItemClick,
  forceExpanded = false,
  defaultOpen = false,
}: LibrarySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Auto-expand when search matches
  useEffect(() => {
    if (forceExpanded) {
      setIsOpen(true);
    }
  }, [forceExpanded]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 py-2 px-1",
          "text-sm font-semibold text-[var(--section-title)]",
          "hover:bg-[var(--tile-hover-bg)] rounded-md transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]"
        )}
      >
        <span className="truncate">{category.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[var(--muted-text)] font-normal">
            {category.items.length}
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
        <LibraryGrid
          items={category.items}
          columns={columns}
          itemSize={itemSize}
          onItemClick={onItemClick}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
