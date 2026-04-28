import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("rounded-xl border border-border/50 bg-card p-4 space-y-3", className)}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-secondary/80 animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-1/3 rounded bg-secondary/80 animate-pulse" />
          <div className="h-2.5 w-2/3 rounded bg-secondary/50 animate-pulse" />
        </div>
      </div>
      <div className="h-2.5 w-full rounded bg-secondary/50 animate-pulse" />
      <div className="h-2.5 w-4/5 rounded bg-secondary/50 animate-pulse" />
      <div className="flex gap-2 pt-1">
        <div className="h-5 w-16 rounded-full bg-secondary/50 animate-pulse" />
        <div className="h-5 w-12 rounded-full bg-secondary/50 animate-pulse" />
      </div>
    </motion.div>
  );
}

export function SkeletonList({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5"
        >
          <div className="h-8 w-8 rounded-lg bg-secondary/80 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/5 rounded bg-secondary/80 animate-pulse" />
            <div className="h-2.5 w-3/5 rounded bg-secondary/50 animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonChat({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6 p-4", className)}>
      {[false, true, false].map((isUser, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`flex gap-3 ${isUser ? "justify-end" : ""}`}
        >
          {!isUser && <div className="h-8 w-8 rounded-lg bg-secondary/80 animate-pulse shrink-0" />}
          <div className={`space-y-2 ${isUser ? "items-end" : ""}`} style={{ maxWidth: "70%" }}>
            <div className={`rounded-xl px-4 py-3 ${isUser ? "bg-primary/20" : "bg-card border border-border/50"}`}>
              <div className="space-y-2">
                <div className="h-3 w-48 rounded bg-secondary/60 animate-pulse" />
                <div className="h-3 w-36 rounded bg-secondary/50 animate-pulse" />
              </div>
            </div>
          </div>
          {isUser && <div className="h-8 w-8 rounded-lg bg-secondary/80 animate-pulse shrink-0" />}
        </motion.div>
      ))}
    </div>
  );
}
