import { Badge } from "@/components/ui/badge";

interface NamespaceBadgeProps {
  namespace: string;
  packId?: string;
  size?: "sm" | "md" | "lg";
}

const config: Record<string, { bg: string; text: string; border: string; label: string; emoji: string }> = {
  native: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
    label: "NATIVE",
    emoji: "🔵"
  },
  core: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-400",
    border: "border-indigo-500/30",
    label: "CORE",
    emoji: "🟦"
  },
  pack: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    label: "PACK",
    emoji: "🟢"
  },
  custom: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "CUSTOM",
    emoji: "🟡"
  },
  integration: {
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/30",
    label: "INTEGRATION",
    emoji: "🟣"
  }
};

const sizeClasses = {
  sm: "text-[9px] px-2 py-0.5",
  md: "text-[10px] px-2.5 py-1",
  lg: "text-xs px-3 py-1"
};

export function NamespaceBadge({ namespace, packId, size = "sm" }: NamespaceBadgeProps) {
  const style = config[namespace] || config.custom;
  const label = (namespace === "pack" && packId) ? `PACK:${packId}` : style.label;

  return (
    <Badge className={`${style.bg} ${style.text} ${style.border} gap-1.5 ${sizeClasses[size]} font-bold uppercase tracking-wider`}>
      <span>{style.emoji}</span>
      <span>{label}</span>
    </Badge>
  );
}
