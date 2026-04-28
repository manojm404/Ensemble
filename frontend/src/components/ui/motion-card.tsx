import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const MotionCard = forwardRef<HTMLDivElement, HTMLMotionProps<"div"> & { className?: string }>(
  ({ className, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{
        y: -2,
        scale: 1.01,
        transition: { type: "spring", stiffness: 400, damping: 20 },
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "rounded-xl border border-border/50 bg-card transition-shadow duration-300 hover:border-primary/30 hover:glow-primary cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
);
MotionCard.displayName = "MotionCard";

function StaggerContainer({
  children,
  className,
  staggerDelay = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12, scale: 0.97 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { MotionCard, StaggerContainer, StaggerItem };
