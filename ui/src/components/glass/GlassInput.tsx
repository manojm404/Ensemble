import * as React from "react";
import { cn } from "@/lib/utils";

export const GlassInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full h-11 rounded-xl px-4 text-sm",
      "bg-black/30 border border-white/10 text-foreground placeholder:text-muted-foreground/70",
      "transition-colors focus:outline-none focus:border-rim/60 focus:bg-black/40",
      "shadow-[inset_0_1px_2px_oklch(0_0_0/0.4)]",
      className,
    )}
    {...rest}
  />
));
GlassInput.displayName = "GlassInput";

export const GlassTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full min-h-24 rounded-xl px-4 py-3 text-sm resize-y",
      "bg-black/30 border border-white/10 text-foreground placeholder:text-muted-foreground/70",
      "transition-colors focus:outline-none focus:border-rim/60 focus:bg-black/40",
      "shadow-[inset_0_1px_2px_oklch(0_0_0/0.4)]",
      className,
    )}
    {...rest}
  />
));
GlassTextarea.displayName = "GlassTextarea";
