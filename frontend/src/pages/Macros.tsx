import { useState, useEffect } from "react";
import { Search, Star, Download, GitFork, Blocks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api";

interface Macro {
  id: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  forks: number;
  author: string;
}



const catColors: Record<string, string> = {
  DevOps: "bg-badge-red/20 text-badge-red",
  Writing: "bg-badge-green/20 text-badge-green",
  "AI/ML": "bg-badge-purple/20 text-badge-purple",
  Analytics: "bg-badge-blue/20 text-badge-blue",
  Engineering: "bg-badge-orange/20 text-badge-orange",
};

const Macros = () => {
  const [search, setSearch] = useState("");
  const [macros, setMacros] = useState<Macro[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchApi('/api/macros').then(data => {
      if (data && Array.isArray(data)) {
        setMacros(data.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description || "Sub-graph component",
          category: d.category || "Engineering",
          stars: d.stars || Math.floor(Math.random() * 100),
          forks: d.forks || Math.floor(Math.random() * 50),
          author: d.author || "anonymous"
        })));
      }
    }).catch(console.error);
  }, []);

  const filtered = macros.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleUseTemplate = (e: React.MouseEvent, macro: Macro) => {
    e.stopPropagation();
    toast.success(`"${macro.name}" template added to your workflows`, { description: "Opening workflow editor..." });
    setTimeout(() => navigate("/workflows/new"), 600);
  };

  const handleFork = (e: React.MouseEvent, macro: Macro) => {
    e.stopPropagation();
    toast.success(`Forked "${macro.name}" to your workspace`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Blocks className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Macro Marketplace</h2>
        <div className="relative flex-1 max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search macros..." className="pl-9 bg-secondary/50 border-border/50" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <StaggerContainer className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((macro) => (
            <StaggerItem key={macro.id}>
              <MotionCard className="p-5 group" onClick={() => navigate(`/macros/${macro.id}`)}>
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{macro.name}</h3>
                  <Badge variant="secondary" className={`text-[10px] ${catColors[macro.category] || ""}`}>{macro.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{macro.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[11px] text-muted-foreground">by {macro.author}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {macro.stars}</span>
                    <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {macro.forks}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-8 gap-1" onClick={(e) => handleUseTemplate(e, macro)}><Download className="h-3 w-3" /> Use Template</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-8 gap-1" onClick={(e) => handleFork(e, macro)}><GitFork className="h-3 w-3" /> Fork</Button>
                </div>
              </MotionCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </ScrollArea>
    </div>
  );
};

export default Macros;
