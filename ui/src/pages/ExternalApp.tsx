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

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-b border-border/30 text-xs text-muted-foreground">
        <img src={app.logoUrl} alt="" className="h-4 w-4 rounded" />
        <span className="truncate">{app.url}</span>
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[10px] hover:text-foreground transition-colors"
        >
          Open externally ↗
        </a>
      </div>
      <iframe
        src={app.url}
        title={app.name}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
};

export default ExternalApp;
