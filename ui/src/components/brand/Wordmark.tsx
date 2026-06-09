import { cn } from "@/lib/utils";

const LOGO_URL = "/brand/0101-logo-lockup.png";

interface WordmarkProps {
  className?: string;
  /** Pixel height of the mark. */
  size?: number;
  /** Accessible label. */
  label?: string;
}

/**
 * 0101 brand mark. The source PNG is on a black plate, so we use
 * mix-blend-mode: screen to drop the black and keep only the chrome glyph.
 */
export function Wordmark({ className, size = 28, label = "0101" }: WordmarkProps) {
  return (
    <img
      src={LOGO_URL}
      alt={label}
      height={size}
      style={{ height: size, width: "auto", mixBlendMode: "screen" }}
      className={cn("select-none object-contain", className)}
      draggable={false}
    />
  );
}
