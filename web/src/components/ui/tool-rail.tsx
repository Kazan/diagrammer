"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// =============================================================================
// SHARED BUTTON STYLES
// =============================================================================

const railButtonStyles = {
  base: [
    "relative inline-flex items-center justify-center rounded-lg border transition-all duration-[120ms]",
    "cursor-pointer outline-none",
    "focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:relative [&_svg]:z-10 [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:stroke-[1.7]",
  ].join(" "),
  default: [
    "bg-[#f0f2f5] border-[#5c6578] text-[#5c6578]",
    "shadow-[0_6px_14px_rgba(0,0,0,0.12)]",
    "hover:bg-[#e4e7ec] hover:border-[#3d4555] hover:text-[#3d4555]",
    "hover:shadow-[0_10px_18px_rgba(0,0,0,0.14)] hover:-translate-y-px",
  ].join(" "),
  pressed: [
    "bg-[hsla(156,64%,48%,0.15)] border-[hsl(156,64%,48%)] text-[hsl(156,64%,48%)]",
    "[&_svg]:text-[hsl(156,64%,48%)]",
  ].join(" "),
  flyout: [
    "border-slate-900/12 bg-[#f8fafc] text-[#0f172a]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_14px_rgba(0,0,0,0.08)]",
    "hover:bg-[#eef2f7] hover:border-slate-900/20 hover:-translate-y-px",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_18px_rgba(0,0,0,0.12)]",
  ].join(" "),
  flyoutPressed: [
    "bg-[#f3fff8] border-[hsl(var(--accent))]",
    "shadow-[0_0_0_2px_rgba(63,207,142,0.3),inset_0_1px_0_rgba(255,255,255,0.75)]",
  ].join(" "),
} as const;

const railButtonVariants = cva(railButtonStyles.base, {
  variants: {
    variant: {
      default: railButtonStyles.default,
      flyout: railButtonStyles.flyout,
    },
    size: {
      default: "size-11",
      sm: "size-9",
      lg: "size-12",
    },
    pressed: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { variant: "default", pressed: true, className: railButtonStyles.pressed },
    { variant: "flyout", pressed: true, className: railButtonStyles.flyoutPressed },
  ],
  defaultVariants: {
    variant: "default",
    size: "default",
    pressed: false,
  },
});

// =============================================================================
// TOOL RAIL CONTAINER
// =============================================================================

export interface ToolRailProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Position configuration */
  position?: "left" | "right" | "custom";
  /** Show divider line on the left edge (for secondary rails) */
  showDivider?: boolean;
}

const ToolRail = React.forwardRef<HTMLDivElement, ToolRailProps>(
  ({ className, position = "custom", showDivider = false, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="toolbar"
        data-slot="tool-rail"
        data-position={position}
        className={cn(
          "flex flex-col gap-1.5 p-3 rounded-[var(--radius)] z-[2147483646]",
          "animate-[float-in_260ms_ease_both]",
          position === "left" && "fixed left-[var(--tool-rail-left)] top-[var(--tool-rail-top)] w-[var(--tool-rail-width)]",
          position === "right" && [
            "fixed",
            "left-[calc(var(--tool-rail-left)+var(--tool-rail-width)+var(--rails-gap))]",
            "top-[var(--tool-rail-top)]",
            "isolate",
          ],
          showDivider && [
            "before:content-[''] before:absolute before:top-0 before:bottom-0",
            "before:left-[calc(-1*(var(--rails-gap)/2))]",
            "before:w-[var(--rails-divider-width)] before:bg-[var(--rails-divider-color)]",
            "before:-translate-x-1/2 before:rounded-full before:z-0 before:pointer-events-none",
          ],
          className
        )}
        style={{
          willChange: "transform",
          backfaceVisibility: "hidden",
          ...style,
        }}
        {...props}
      />
    );
  }
);
ToolRail.displayName = "ToolRail";

// =============================================================================
// RAIL SECTION (Group of items with optional layout)
// =============================================================================

export interface RailSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns for grid layout */
  columns?: 1 | 2 | 3 | 4;
  /** Section label for accessibility */
  label?: string;
}

const RailSection = React.forwardRef<HTMLDivElement, RailSectionProps>(
  ({ className, columns = 1, label, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="group"
        data-slot="rail-section"
        data-columns={columns}
        aria-label={label}
        className={cn(
          "grid gap-1.5",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
          columns === 4 && "grid-cols-4",
          className
        )}
        {...props}
      />
    );
  }
);
RailSection.displayName = "RailSection";

// =============================================================================
// RAIL SEPARATOR
// =============================================================================

export interface RailSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Span across multiple columns */
  colSpan?: number;
}

const RailSeparator = React.forwardRef<HTMLDivElement, RailSeparatorProps>(
  ({ className, colSpan, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="separator"
        data-slot="rail-separator"
        className={cn(
          "h-px w-full my-1.5 bg-white/8 rounded-full",
          colSpan === 2 && "col-span-2",
          colSpan === 3 && "col-span-3",
          colSpan === 4 && "col-span-4",
          className
        )}
        {...props}
      />
    );
  }
);
RailSeparator.displayName = "RailSeparator";

// =============================================================================
// RAIL BUTTON (Action button with immediate effect)
// =============================================================================

export interface RailButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof railButtonVariants> {
  asChild?: boolean;
}

const RailButton = React.forwardRef<HTMLButtonElement, RailButtonProps>(
  ({ className, variant, size, pressed = false, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        data-slot="rail-button"
        data-variant={variant}
        data-size={size}
        aria-pressed={pressed ?? undefined}
        className={cn(railButtonVariants({ variant, size, pressed }), className)}
        style={{
          willChange: "transform",
          backfaceVisibility: "hidden",
          ...style,
        }}
        {...props}
      />
    );
  }
);
RailButton.displayName = "RailButton";

// =============================================================================
// RAIL TOGGLE GROUP (Single selection from multiple options)
// =============================================================================

export interface RailToggleGroupProps<T extends string = string> {
  /** Current selected value */
  value: T;
  /** Callback when selection changes */
  onValueChange: (value: T) => void;
  /** Children toggle items */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Disable the entire group */
  disabled?: boolean;
}

function RailToggleGroup<T extends string = string>({
  className,
  value,
  onValueChange,
  children,
  disabled,
}: RailToggleGroupProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="rail-toggle-group"
      type="single"
      value={value}
      onValueChange={(newValue) => newValue && onValueChange(newValue as T)}
      disabled={disabled}
      className={cn("contents", className)}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

// =============================================================================
// RAIL TOGGLE ITEM (Individual toggle button within a group)
// =============================================================================

export interface RailToggleItemProps
  extends Omit<React.ComponentProps<typeof ToggleGroupPrimitive.Item>, "className">,
    Omit<VariantProps<typeof railButtonVariants>, "pressed"> {
  className?: string;
}

const RailToggleItem = React.forwardRef<HTMLButtonElement, RailToggleItemProps>(
  ({ className, variant = "default", size, style, ...props }, ref) => {
    return (
      <ToggleGroupPrimitive.Item
        ref={ref}
        data-slot="rail-toggle-item"
        className={cn(
          railButtonStyles.base,
          railButtonStyles.default,
          size === "sm" && "size-9",
          size === "lg" && "size-12",
          (!size || size === "default") && "size-11",
          // Active state via data attribute - using Tailwind's data attribute syntax
          "data-[state=on]:bg-[hsla(156,64%,48%,0.15)]",
          "data-[state=on]:border-[hsl(156,64%,48%)]",
          "data-[state=on]:text-[hsl(156,64%,48%)]",
          "data-[state=on]:[&_svg]:text-[hsl(156,64%,48%)]",
          className
        )}
        style={{
          willChange: "transform",
          backfaceVisibility: "hidden",
          ...style,
        }}
        {...props}
      />
    );
  }
);
RailToggleItem.displayName = "RailToggleItem";

// =============================================================================
// RAIL POPOVER BUTTON (Button that opens a flyout)
// =============================================================================

export interface RailPopoverButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "content">,
    VariantProps<typeof railButtonVariants> {
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Popover content */
  content: React.ReactNode;
  /** Popover placement side */
  side?: "top" | "right" | "bottom" | "left";
  /** Popover alignment */
  align?: "start" | "center" | "end";
  /** Distance from trigger */
  sideOffset?: number;
  /** Popover content className */
  contentClassName?: string;
  /** Use Slot for trigger */
  asChild?: boolean;
}

const RailPopoverButton = React.forwardRef<HTMLButtonElement, RailPopoverButtonProps>(
  (
    {
      open,
      onOpenChange,
      content,
      side = "right",
      align = "start",
      sideOffset = 12,
      contentClassName,
      children,
      variant,
      size,
      pressed,
      className,
      style,
      ...buttonProps
    },
    ref
  ) => {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <RailButton
            ref={ref}
            variant={variant}
            size={size}
            pressed={pressed}
            className={className}
            style={style}
            {...buttonProps}
          >
            {children}
          </RailButton>
        </PopoverTrigger>
        <PopoverContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            "w-auto min-w-[280px] p-3 rounded-2xl",
            "shadow-[0_24px_48px_rgba(0,0,0,0.18)] border-slate-900/8",
            contentClassName
          )}
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }
);
RailPopoverButton.displayName = "RailPopoverButton";

// =============================================================================
// RAIL SWATCH (Color indicator overlay for buttons)
// =============================================================================

export interface RailSwatchProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  color?: string | null;
}

const RailSwatch = React.forwardRef<HTMLSpanElement, RailSwatchProps>(
  ({ className, color, ...props }, ref) => {
    const isTransparent = !color || color === "transparent";

    return (
      <span
        ref={ref}
        data-slot="rail-swatch"
        className={cn(
          "absolute inset-2 rounded-[9px] pointer-events-none z-0",
          isTransparent && [
            "bg-[linear-gradient(135deg,rgba(15,23,42,0.08)_25%,transparent_25%,transparent_50%,rgba(15,23,42,0.08)_50%,rgba(15,23,42,0.08)_75%,transparent_75%,transparent)]",
            "bg-[#f8fafc] bg-[length:8px_8px]",
            "border border-slate-900/12",
          ],
          !isTransparent && "border border-slate-900/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
          className
        )}
        style={!isTransparent ? { backgroundColor: color } : undefined}
        aria-hidden="true"
        {...props}
      />
    );
  }
);
RailSwatch.displayName = "RailSwatch";

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ToolRail,
  RailSection,
  RailSeparator,
  RailButton,
  RailToggleGroup,
  RailToggleItem,
  RailPopoverButton,
  RailSwatch,
  railButtonVariants,
  railButtonStyles,
};
