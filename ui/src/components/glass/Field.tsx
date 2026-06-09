import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
