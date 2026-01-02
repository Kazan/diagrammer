import type { LibraryItem } from "./types";
import { LibraryThumbnail } from "./LibraryThumbnail";

interface LibraryGridProps {
  items: LibraryItem[];
  columns?: number;
  itemSize?: number;
  onItemClick: (item: LibraryItem) => void;
}

export function LibraryGrid({
  items,
  columns = 5,
  itemSize = 64,
  onItemClick,
}: LibraryGridProps) {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
      }}
    >
      {items.map((item) => (
        <LibraryThumbnail
          key={item.id}
          item={item}
          size={itemSize}
          onClick={() => onItemClick(item)}
        />
      ))}
    </div>
  );
}
