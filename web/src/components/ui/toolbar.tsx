"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

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

export { ToolbarButton };
