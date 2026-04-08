import { useParams } from "react-router-dom";
import { useAIApps, defaultAIApps } from "@/lib/ai-apps";



const ExternalApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const { allAIApps } = useAIApps();

  const app = allAIApps.find((a) => a.id === appId) || defaultAIApps.find((a) => a.id === appId);

  if (!app) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        App not found
      </div>
    );
  }

  const openInNewTab = () => {
    window.open(app.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-b border-border/30 text-xs text-muted-foreground shrink-0">
        <img src={app.logoUrl} alt="" className="h-4 w-4 rounded" />
        <span className="truncate">{app.url}</span>
        <button
          onClick={openInNewTab}
          className="ml-auto text-[10px] hover:text-foreground transition-colors underline"
        >
          Open in new tab ↗
        </button>
      </div>
      <div className="flex-1 w-full bg-background relative">
        <iframe
          src={app.url}
          className="absolute inset-0 w-full h-full border-0"
          title={app.name}
          allow="microphone; camera; midi; encrypted-media; clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
};

export default ExternalApp;
