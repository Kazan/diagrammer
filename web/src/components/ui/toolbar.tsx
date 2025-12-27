"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const toolbarVariants = cva(
  "flex gap-1.5 p-2 rounded-[var(--radius)] z-[2147483646]",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
);

const toolbarButtonVariants = cva(
  [
    "relative inline-flex items-center justify-center rounded-lg border transition-all duration-[120ms]",
    "cursor-pointer outline-none",
    "focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:relative [&_svg]:z-10 [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:stroke-[1.7]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          // Light opaque background with dark icon and border
          "bg-[#f0f2f5] border-[#5c6578] text-[#5c6578]",
          "shadow-[0_6px_14px_rgba(0,0,0,0.12)]",
          "hover:bg-[#e4e7ec] hover:border-[#3d4555] hover:text-[#3d4555]",
          "hover:shadow-[0_10px_18px_rgba(0,0,0,0.14)] hover:-translate-y-px",
        ].join(" "),
        ghost: [
          "border-transparent bg-transparent text-[#5c6578]",
          "hover:bg-slate-200/60 hover:text-[#3d4555]",
        ].join(" "),
        flyout: [
          "border-slate-900/12 bg-[#f8fafc] text-[#0f172a]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_14px_rgba(0,0,0,0.08)]",
          "hover:bg-[#eef2f7] hover:border-slate-900/20 hover:-translate-y-px",
          "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_18px_rgba(0,0,0,0.12)]",
        ].join(" "),
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
      {
        variant: "default",
        pressed: true,
        className: [
          "bg-[#3d4555] border-[#3d4555] text-[#e4e7ec]",
          "[&_svg]:text-[#e4e7ec]",
          "hover:bg-[#4a5568] hover:border-[#4a5568] hover:text-[#f0f2f5]",
        ].join(" "),
      },
      {
        variant: "flyout",
        pressed: true,
        className: [
          "bg-[#f3fff8] border-[hsl(var(--accent))]",
          "shadow-[0_0_0_2px_rgba(63,207,142,0.3),inset_0_1px_0_rgba(255,255,255,0.75)]",
        ].join(" "),
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      pressed: false,
    },
  }
);

export interface ToolbarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toolbarVariants> {}

function Toolbar({ className, orientation, style, ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      data-slot="toolbar"
      data-orientation={orientation}
      className={cn(toolbarVariants({ orientation }), className)}
      style={{
        willChange: "transform",
        backfaceVisibility: "hidden",
        ...style,
      }}
      {...props}
    />
  );
}

export interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof toolbarButtonVariants> {
  asChild?: boolean;
}

const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ className, variant, size, pressed = false, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        data-slot="toolbar-button"
        data-variant={variant}
        data-size={size}
        aria-pressed={pressed ?? undefined}
        className={cn(toolbarButtonVariants({ variant, size, pressed }), className)}
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
ToolbarButton.displayName = "ToolbarButton";

interface ToolbarSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

function ToolbarSeparator({
  className,
  orientation = "horizontal",
  ...props
}: ToolbarSeparatorProps) {
  return (
    <div
      role="separator"
      data-slot="toolbar-separator"
      data-orientation={orientation}
      className={cn(
        "bg-white/8 rounded-full",
        orientation === "horizontal" ? "h-px w-full my-1" : "w-px h-6 mx-1",
        className
      )}
      {...props}
    />
  );
}

interface ToolbarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

function ToolbarGroup({
  className,
  orientation = "vertical",
  ...props
}: ToolbarGroupProps) {
  return (
    <div
      role="group"
      data-slot="toolbar-group"
      data-orientation={orientation}
      className={cn(
        "flex gap-1.5",
        orientation === "horizontal"
          ? "flex-row flex-wrap"
          : "flex-col",
        className
      )}
      {...props}
    />
  );
}

interface ToolbarSwatchProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
  color?: string | null;
}

function ToolbarSwatch({ className, color, ...props }: ToolbarSwatchProps) {
  const isTransparent = !color || color === "transparent";

  return (
    <span
      data-slot="toolbar-swatch"
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

export {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarGroup,
  ToolbarSwatch,
  toolbarVariants,
  toolbarButtonVariants,
};
