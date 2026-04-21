import { Outlet, useLocation } from "react-router-dom";
import { InspectorProvider } from "./InspectorPanel";
import { TopBar } from "./TopBar";
import { TabProvider } from "@/lib/tab-context";
import { AnimatePresence, motion } from "framer-motion";

const pageVariants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.1, ease: [0.25, 0.1, 0.25, 1] } },
};

export function AppLayout() {
  const location = useLocation();

  return (
    <TabProvider>
      <div className="h-screen flex flex-col w-full overflow-hidden">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-hidden border-t border-border/20 shadow-inner">
          <InspectorProvider>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </InspectorProvider>
        </main>
        
        {/* Professional Bottom Border / Status Bar */}
        <footer className="h-6 shrink-0 bg-secondary/80 border-t border-border/20 px-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 select-none">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5">
               <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
               <span>Sovereign Core Online</span>
             </div>
             <span className="opacity-30">|</span>
             <span>Local Port: 8000</span>
          </div>
          <div className="flex items-center gap-4">
             <span>Ensemble V1.0.4-Stable</span>
             <span className="opacity-30">|</span>
             <span className="text-primary/40">SOP Engine Active</span>
          </div>
        </footer>
      </div>
    </TabProvider>
  );
}
