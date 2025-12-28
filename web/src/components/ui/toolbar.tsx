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
    "will-change-transform backface-hidden",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          // Light opaque background with dark icon and border
          "bg-[var(--btn-bg)] border-[var(--btn-border)] text-[var(--btn-border)]",
          "hover:bg-[var(--btn-hover-bg)] hover:border-[var(--btn-hover-border)] hover:text-[var(--btn-hover-border)]",
          "hover:-translate-y-px",
        ].join(" "),
        ghost: [
          "border-transparent bg-transparent text-[var(--btn-border)]",
          "hover:bg-slate-200/60 hover:text-[var(--btn-hover-border)]",
        ].join(" "),
        flyout: [
          "border-[var(--flyout-item-border)] bg-[var(--flyout-item-bg)] text-[var(--flyout-text)]",
          "hover:bg-[var(--flyout-item-hover-bg)] hover:border-[var(--flyout-item-hover-border)] hover:-translate-y-px",
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
          "bg-[var(--btn-pressed-bg)] border-[var(--btn-pressed-border)] text-[var(--btn-pressed-text)]",
          "[&_svg]:text-[var(--btn-pressed-text)]",
          "hover:bg-[var(--btn-pressed-hover-bg)] hover:border-[var(--btn-pressed-hover-border)] hover:text-[var(--btn-pressed-hover-text)]",
        ].join(" "),
      },
      {
        variant: "flyout",
        pressed: true,
        className: [
          "bg-[#f3fff8] border-[hsl(var(--accent))]",
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

function Toolbar({ className, orientation, ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      data-slot="toolbar"
      data-orientation={orientation}
      className={cn(
        toolbarVariants({ orientation }),
        "will-change-transform backface-hidden",
        className
      )}
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
  ({ className, variant, size, pressed = false, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        data-slot="toolbar-button"
        data-variant={variant}
        data-size={size}
        aria-pressed={pressed ?? undefined}
        className={cn(
          toolbarButtonVariants({ variant, size, pressed }),
          className
        )}
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
          "bg-[var(--flyout-item-bg)] bg-[length:8px_8px]",
          "border border-[var(--flyout-item-border)]",
        ],
        !isTransparent && "border border-[var(--flyout-item-border)]",
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
