import { useParams } from "react-router-dom";
import { useAIApps, defaultAIApps } from "@/lib/ai-apps";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback } from "react";

const ExternalApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const { allAIApps } = useAIApps();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Webview | null>(null);

  const app = allAIApps.find((a) => a.id === appId) || defaultAIApps.find((a) => a.id === appId);
  const inTauri = isTauri();

  const cleanupWebview = useCallback(() => {
    if (webviewRef.current) {
      webviewRef.current.close().catch((err) => {
        console.log("Webview already closed:", err);
      });
      webviewRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!inTauri || !app || !containerRef.current) return;

    let isMounted = true;

    const mountWebview = async () => {
      try {
        setLoading(true);
        setError(null);
        setWebviewReady(false);

        // Cleanup any existing webview first
        cleanupWebview();

        // Wait for DOM to be ready and get accurate bounds
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isMounted || !containerRef.current) return;

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const appWindow = getCurrentWindow();
        const label = `ensemble-app-${app.id}`;

        // Check if a webview with this label already exists and close it
        const existingWebview = await Webview.getByLabel(label);
        if (existingWebview) {
          await existingWebview.close();
        }

        // Create the webview with proper positioning
        // In Tauri 2, webview position is relative to window content area (not screen)
        // So we only need the container's position within the window, not the window position
        const webview = new Webview(appWindow, label, {
          url: app.url,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        });

        if (!isMounted) {
          webview.close().catch(console.error);
          return;
        }

        webviewRef.current = webview;

        // Listen for webview events
        webview.once('tauri://created', () => {
          if (isMounted) {
            setWebviewReady(true);
            setLoading(false);
          }
        });

        webview.once('tauri://error', (e: any) => {
          console.error("Webview error:", e);
          if (isMounted) {
            setLoading(false);
            setError(`Failed to load ${app.name}: ${JSON.stringify(e.payload || e)}`);
          }
        });

        // Enable auto-resize so webview adjusts when window resizes
        await webview.setAutoResize(true);

      } catch (e: any) {
        console.error("Failed to mount Tauri webview:", e);
        if (isMounted) {
          setLoading(false);
          setError(e.message || e.toString());
        }
      }
    };

    mountWebview();

    // Cleanup on unmount or when app changes
    return () => {
      isMounted = false;
      cleanupWebview();
    };
  }, [inTauri, app, cleanupWebview]);

  // Handle window resize to reposition the webview
  useEffect(() => {
    if (!inTauri || !webviewRef.current || !containerRef.current) return;

    const handleResize = async () => {
      try {
        const container = containerRef.current;
        if (!container || !webviewRef.current) return;

        const rect = container.getBoundingClientRect();

        await webviewRef.current.setPosition({
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        });

        await webviewRef.current.setSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      } catch (e) {
        console.error("Failed to resize webview:", e);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [inTauri]);

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
    <div className="h-full w-full flex flex-col bg-background relative">
      {/* Header bar with app info */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-b border-border/30 text-xs text-muted-foreground shrink-0 z-10">
        <img src={app.logoUrl} alt="" className="h-4 w-4 rounded" />
        <span className="truncate font-medium">{app.name}</span>
        <span className="text-[10px] opacity-60">•</span>
        <span className="truncate text-[10px] opacity-60">{app.url}</span>

        <div className="ml-auto flex items-center gap-2">
          {inTauri && webviewReady && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Embedded
            </span>
          )}
          <button
            onClick={openInBrowser}
            className="text-[10px] hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            Open in browser
            <span className="text-xs">↗</span>
          </button>
        </div>
      </div>

      {/* Container for the Tauri Webview */}
      <div ref={containerRef} className="flex-1 w-full relative">
        {/* Loading state */}
        {loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background z-20">
            <div className="relative">
              <div className="h-12 w-12 rounded-2xl bg-secondary/30 flex items-center justify-center border border-border/50">
                <img src={app.logoUrl} alt={app.name} className="h-8 w-8 object-contain" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin bg-background" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Loading {app.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Embedding within Ensemble...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-background z-20">
            <div className="max-w-md w-full flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/30">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Failed to Embed {app.name}</h2>
                <p className="text-sm text-muted-foreground">
                  This app may not allow embedding within other applications for security reasons.
                </p>
                <div className="mt-3 p-3 bg-card/50 border border-border/30 rounded-md text-destructive text-xs text-left overflow-auto max-h-24 font-mono">
                  {error}
                </div>
              </div>
              <button
                onClick={openInBrowser}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
              >
                Open {app.name} in browser
                <span className="text-lg leading-none">↗</span>
              </button>
            </div>
          </div>
        )}

        {/* Browser mode fallback */}
        {!inTauri && !error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-background z-20">
            <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
              <div className="h-20 w-20 rounded-2xl bg-secondary/30 flex items-center justify-center p-4 shadow-sm border border-border/50">
                <img src={app.logoUrl} alt={app.name} className="w-full h-full object-contain" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">Open {app.name}</h2>
                <p className="text-sm text-muted-foreground">
                  You're currently running Ensemble in browser mode. For the best experience with external apps, we recommend using the Ensemble desktop app.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={openInBrowser}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  Open {app.name} in new tab
                  <span className="text-lg leading-none">↗</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* When webview is ready and loaded, we show empty div - webview overlays it */}
        {inTauri && webviewReady && !error && (
          <div className="w-full h-full" />
        )}
      </div>
    </div>
  );
};

export default ExternalApp;
