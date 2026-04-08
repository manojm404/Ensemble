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
        <main className="flex-1 min-h-0 overflow-hidden">
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
      </div>
    </TabProvider>
  );
}
