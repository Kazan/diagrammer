import { useLibraryItemSvg } from "./useLibraryItemSvg";
import type { LibraryItem } from "./types";
import { cn } from "@/lib/utils";

interface LibraryThumbnailProps {
  item: LibraryItem;
  size: number;
  onClick: () => void;
}

export function LibraryThumbnail({ item, size, onClick }: LibraryThumbnailProps) {
  const { svg, isPending } = useLibraryItemSvg(item.id, item.elements);

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.name}
      className={cn(
        "group relative flex items-center justify-center",
        "rounded-lg border border-[var(--tile-border)]",
        "bg-[var(--tile-bg)] hover:bg-[var(--tile-hover-bg)]",
        "hover:border-[var(--tile-hover-border)]",
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
  );
}
