import { X, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface InspectorContextType {
  isOpen: boolean;
  title: string;
  content: ReactNode | null;
  open: (title: string, content: ReactNode) => void;
  close: () => void;
}

const InspectorContext = createContext<InspectorContextType>({
  isOpen: false,
  title: "",
  content: null,
  open: () => {},
  close: () => {},
});

export const useInspector = () => useContext(InspectorContext);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<ReactNode | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-close on navigation to ensure clean state
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const open = (t: string, c: ReactNode) => {
    setTitle(t);
    setContent(c);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  return (
    <InspectorContext.Provider value={{ isOpen, title, content, open, close }}>
      <div className="flex h-full w-full">
        <div className="flex-1 min-w-0">{children}</div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0, x: 20 }}
              animate={{ width: isExpanded ? 520 : 380, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 20 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="h-full border-l border-primary/20 bg-card/60 backdrop-blur-2xl overflow-hidden shrink-0 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] relative"
            >
              {/* Subtle border glow */}
              <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-transparent via-primary/40 to-transparent" />
              
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/5">
                <div className="flex flex-col min-w-0">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-0.5">Inspector</h3>
                  <h2 className="text-sm font-bold text-foreground truncate">
                    {title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={close}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[calc(100%-73px)]">
                <div className="p-6 space-y-6">{content}</div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </InspectorContext.Provider>
  );
}
