import { useParams } from "react-router-dom";
import { useAIApps, defaultAIApps } from "@/lib/ai-apps";

const ExternalApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const { allAIApps } = useAIApps();

  const app = allAIApps.find((a) => a.id === appId) || defaultAIApps.find((a) => a.id === appId);

  const openInBrowser = () => {
    if (app) {
      window.open(app.url, "_blank", "noopener,noreferrer");
    }
  };

  if (!app) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        App not found
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-b border-border/30 text-xs text-muted-foreground shrink-0 z-10">
        <img src={app.logoUrl} alt="" className="h-4 w-4 rounded" />
        <span className="truncate font-medium">{app.name}</span>
        <span className="text-[10px] opacity-60">•</span>
        <span className="truncate text-[10px] opacity-60">{app.url}</span>
        <div className="ml-auto">
          <button
            onClick={openInBrowser}
            className="text-[10px] hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            Open in browser
            <span className="text-xs">↗</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <iframe
          src={app.url}
          title={app.name}
          className="w-full h-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
};

export default ExternalApp;
