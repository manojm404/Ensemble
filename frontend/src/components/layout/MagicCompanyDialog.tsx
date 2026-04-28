import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Sparkles, Loader2, ArrowRight, Building2 } from "lucide-react";

interface MagicCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (mission: string) => void;
  isGenerating: boolean;
}

const exampleMissions = [
  "Build a SaaS analytics platform for e-commerce stores",
  "Launch a mobile food delivery app for our city",
  "Create an AI-powered code review and documentation tool",
  "Build a game studio making multiplayer indie games",
];

export function MagicCompanyDialog({ open, onOpenChange, onGenerate, isGenerating }: MagicCompanyDialogProps) {
  const [mission, setMission] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      setMission("");
    }
  }, [open]);

  const handleSubmit = () => {
    if (!mission.trim() || isGenerating) return;
    onGenerate(mission.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => !isGenerating && onOpenChange(false)}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg mx-4 rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Start Your Company</h2>
                  <p className="text-xs text-muted-foreground">Describe your mission — we'll build the team, starting with a CEO</p>
                </div>
              </div>

              {/* Mission input */}
              <div className="p-5 space-y-4">
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. Build a SaaS analytics platform that helps e-commerce stores track customer behavior and optimize conversions..."
                    className="min-h-[120px] bg-secondary/30 border-border/50 text-sm resize-none pr-4"
                    disabled={isGenerating}
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-md backdrop-blur-sm">
                      <div className="flex items-center gap-2 text-primary">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Building your company...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Example missions */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Try a mission</p>
                  <div className="flex flex-wrap gap-1.5">
                    {exampleMissions.map((example, i) => (
                      <button
                        key={i}
                        onClick={() => setMission(example)}
                        disabled={isGenerating}
                        className="text-[11px] px-2.5 py-1.5 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-transparent hover:border-border/50 disabled:opacity-50"
                      >
                        {example.length > 50 ? example.slice(0, 50) + "…" : example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  ⌘ + Enter to build
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={isGenerating}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!mission.trim() || isGenerating}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Build Company
                    {!isGenerating && <ArrowRight className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
