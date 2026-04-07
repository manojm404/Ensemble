import { X, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createContext, useContext, useState, ReactNode } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<ReactNode | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

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
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isExpanded ? 480 : 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="h-full border-l border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden shrink-0"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {title}
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={close}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[calc(100%-49px)]">
                <div className="p-4">{content}</div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </InspectorContext.Provider>
  );
}
