import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: keyof React.JSX.IntrinsicElements;
  variant?: "default" | "strong" | "inset";
  rim?: boolean;
  sheen?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

/**
 * The single liquid-glass surface primitive. Every dashboard tile,
 * sidebar, modal, and form sits inside one of these.
 */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      as: Tag = "div",
      variant = "default",
      rim = false,
      sheen = false,
      padding = "md",
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const Component = Tag as React.ElementType;
    return (
      <Component
        ref={ref}
        className={cn(
          "relative rounded-2xl",
          variant === "default" && "glass",
          variant === "strong" && "glass-strong",
          variant === "inset" && "glass-inset",
          rim && "rim-light",
          sheen && "sheen",
          padding === "sm" && "p-4",
          padding === "md" && "p-6",
          padding === "lg" && "p-8",
          className,
        )}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
GlassPanel.displayName = "GlassPanel";
