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
    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden bg-background">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[20%] left-[30%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl px-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center px-3 py-1 mb-5 rounded-full bg-primary/10 border border-primary/20 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Sovereign Core OS</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4 drop-shadow-sm">
            Esemble Intelligence
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto">
            Choose an application to begin your autonomous workflow session.
          </p>
        </motion.div>

        {/* The Grid: 3 columns, large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
          {launchableApps.map((app, i) => {
            const Icon = app.icon;
            return (
              <motion.button
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: "easeOut" }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleOpen(app)}
                className="group relative flex flex-col items-start text-left p-6 rounded-2xl glass border border-border/40 hover:border-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 overflow-hidden bg-card/40 hover:bg-card/60"
              >
                {/* Subtle hover gradient inside the card */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="relative z-10 flex items-center justify-center h-14 w-14 rounded-xl bg-background/80 border border-border/50 shadow-sm mb-5 group-hover:scale-110 group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:shadow-md transition-all duration-300">
                  <Icon className="h-7 w-7 text-foreground/70 group-hover:text-primary transition-colors duration-300" />
                </div>
                
                <h3 className="relative z-10 text-xl font-semibold text-foreground group-hover:text-primary transition-colors duration-300">
                  {app.title}
                </h3>
                <p className="relative z-10 mt-2 text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed">
                  {app.description}
                </p>
              </motion.button>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-[11px] text-muted-foreground/40 mt-16 tracking-widest uppercase font-semibold"
        >
          Your AI workspace — Everything in one place
        </motion.p>
      </div>
    </div>
  );
};

export default Launcher;
