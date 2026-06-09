import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassButton = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-tight transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-foreground text-background hover:bg-foreground/90 shadow-[0_8px_30px_-8px_oklch(1_0_0/0.35)]",
        glass:
          "glass border border-white/10 text-foreground hover:bg-white/[0.08] hover:border-white/20",
        ghost: "text-foreground/80 hover:text-foreground hover:bg-white/[0.06]",
        outline:
          "border border-white/15 text-foreground hover:bg-white/[0.06] hover:border-white/25",
        rim: "relative bg-gradient-to-b from-white/[0.12] to-white/[0.04] text-foreground border border-white/15 hover:border-rim/60 shadow-[inset_0_1px_0_oklch(1_0_0/0.15),0_8px_24px_-8px_oklch(0.78_0.06_240/0.5)]",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof glassButton> {
  asChild?: boolean;
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild, ...rest }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(glassButton({ variant, size }), className)} {...rest} />;
  },
);
GlassButton.displayName = "GlassButton";
