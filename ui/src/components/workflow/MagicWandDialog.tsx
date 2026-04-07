import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Sparkles, Loader2, ArrowRight } from "lucide-react";

interface MagicWandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
}

const examplePrompts = [
  "Build a code review pipeline with testing and documentation",
  "Create a marketing campaign with strategy, copy, and visuals",
  "Set up a full-stack app with architecture, code, tests, and deployment",
  "Design a data analysis workflow with insights and reporting",
];

export function MagicWandDialog({ open, onOpenChange, onGenerate, isGenerating }: MagicWandDialogProps) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      setPrompt("");
    }
  }, [open]);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim());
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

          {/* Dialog wrapper — flex centering avoids transform conflicts with framer-motion */}
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
                  <Wand2 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">AI Workflow Generator</h2>
                  <p className="text-xs text-muted-foreground">Describe what you need — we'll pick the agents and wire them up</p>
                </div>
              </div>

              {/* Prompt area */}
              <div className="p-5 space-y-4">
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. I need a workflow to review my code, write tests, fix bugs, and generate documentation..."
                    className="min-h-[120px] bg-secondary/30 border-border/50 text-sm resize-none pr-4"
                    disabled={isGenerating}
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-md backdrop-blur-sm">
                      <div className="flex items-center gap-2 text-primary">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Generating workflow...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Example prompts */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Try an example</p>
                  <div className="flex flex-wrap gap-1.5">
                    {examplePrompts.map((example, i) => (
                      <button
                        key={i}
                        onClick={() => setPrompt(example)}
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
                  ⌘ + Enter to generate
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
                    disabled={!prompt.trim() || isGenerating}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate Workflow
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
