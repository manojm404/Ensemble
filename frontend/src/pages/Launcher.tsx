import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { allApps, useTabContext } from "@/lib/tab-context";

const Launcher = () => {
  const navigate = useNavigate();
  const { openApp, tabs, closeTab } = useTabContext();

  const launchableApps = allApps.filter((a) => a.id !== "settings");

  const handleOpen = (app: (typeof allApps)[0]) => {
    // Close the launcher tab
    const launcherTab = tabs.find((t) => t.url === "/launcher");
    if (launcherTab) closeTab(launcherTab.id);
    openApp(app);
    navigate(app.url);
  };

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      {/* Ensemble branded background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/5 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full bg-primary/3 blur-[120px]" />
        <div className="absolute top-0 left-1/4 w-[250px] h-[250px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h2 className="text-xl font-bold tracking-tight text-foreground mb-0.5">
            Ensemble
          </h2>
          <p className="text-xs text-muted-foreground">
            Choose an app to get started
          </p>
        </motion.div>

        <div className="glass border border-border/30 rounded-2xl p-8 shadow-xl">
          <div className="grid grid-cols-5 gap-8">
            {launchableApps.map((app, i) => {
              const Icon = app.icon;
              return (
                <motion.button
                  key={app.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.04, type: "spring", stiffness: 300 }}
                  whileHover={{ scale: 1.1, y: -4 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => handleOpen(app)}
                  className="flex flex-col items-center gap-2.5 group"
                >
                  <div className="h-14 w-14 rounded-2xl glass border-border/30 flex items-center justify-center shadow-sm group-hover:shadow-lg group-hover:border-primary/30 group-hover:glow-primary transition-all duration-300">
                    <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[72px]">
                    {app.title}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-[10px] text-muted-foreground/40 mt-2"
        >
          Your AI workspace — everything in one place
        </motion.p>
      </div>
    </div>
  );
};

export default Launcher;
