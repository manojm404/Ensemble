import { useState, useEffect } from "react";
import { FolderTree, File, Folder, ChevronRight, ChevronDown } from "lucide-react";
import { getWorkspaceTree } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WorkspaceNode {
  path: string;
  name: string;
  type: "file" | "folder";
  children?: WorkspaceNode[];
}

function WorkspaceTreeItem({ node, depth }: { node: WorkspaceNode; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = node.type === "folder";

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-secondary/50 rounded-md cursor-pointer group transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => isFolder && setExpanded(!expanded)}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isFolder ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            )
          ) : null}
        </div>
        {isFolder ? (
          <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0 fill-blue-400/20" />
        ) : (
          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs truncate text-foreground group-hover:text-foreground/80 transition-colors">
          {node.name}
        </span>
      </div>
      
      {isFolder && expanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <WorkspaceTreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFileTree() {
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getWorkspaceTree().then((data) => {
      if (mounted) {
        setTree(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div className="text-xs text-muted-foreground p-4">Loading workspace...</div>;
  }

  if (tree.length === 0) {
    return <div className="text-xs text-muted-foreground p-4">Workspace is empty.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-0.5">
        {tree.map((node) => (
          <WorkspaceTreeItem key={node.path} node={node} depth={0} />
        ))}
      </div>
    </ScrollArea>
  );
}
