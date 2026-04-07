/**
 * OutputViewer.tsx — Tabbed Output Display for Workflow Results
 * 
 * Three viewing modes:
 * 1. Document — Rendered markdown with copy/download buttons
 * 2. Files — VS Code-style file tree with content viewer
 * 3. Preview — Iframe for live web output (with "Open in tab" button)
 * 
 * PRODUCTION-READY: This component only renders data.
 * All mock data comes from WorkflowExecutionPanel.
 * 
 * DO NOT CHANGE:
 * - Tab layout (TabsList height, icon sizes)
 * - File tree indentation formula (depth * 12 + 8)
 * - Prose styling classes on MarkdownRenderer
 * - Download blob creation pattern
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, ExternalLink, FileText, FolderTree, Eye, ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface OutputFile {
  path: string;
  content: string;
  language?: string;
}

export interface WorkflowOutput {
  markdown?: string;
  files?: OutputFile[];
  /** URL for iframe preview (e.g., deployed web app) */
  previewUrl?: string;
}

/* ─── Markdown Renderer ─── */
/**
 * Simple markdown-to-JSX renderer.
 * Handles: H1/H2/H3, lists, code fences (as <hr>), paragraphs.
 * 
 * NOTE: This is a simplified renderer. For production, consider
 * react-markdown or rehype for full spec compliance.
 * 
 * Copy button: copies raw markdown to clipboard
 * Download button: creates .md blob and triggers download
 */
function MarkdownRenderer({ content }: { content: string }) {
  const copyToClipboard = () => navigator.clipboard.writeText(content);

  return (
    <div className="relative">
      {/* Floating action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        {/* Copy raw markdown to clipboard */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={copyToClipboard} title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {/* Download as .md file */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Download .md"
          onClick={() => {
            const blob = new Blob([content], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "output.md"; a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Rendered content — DO NOT CHANGE prose class chain */}
      <div className="prose prose-invert prose-sm max-w-none p-4 text-foreground
        prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground
        prose-code:text-primary prose-code:bg-secondary/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
        prose-pre:bg-secondary/80 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-li:text-muted-foreground prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground">
        {content.split("\n").map((line, i) => {
          if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-4 mb-1">{line.slice(4)}</h3>;
          if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold mt-5 mb-2">{line.slice(3)}</h2>;
          if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold mt-6 mb-2">{line.slice(2)}</h1>;
          if (line.startsWith("- ")) return <li key={i} className="text-xs text-muted-foreground ml-4 list-disc">{line.slice(2)}</li>;
          if (line.startsWith("```")) return <hr key={i} className="border-border/30 my-2" />;
          if (line.trim() === "") return <br key={i} />;
          return <p key={i} className="text-xs text-muted-foreground leading-relaxed">{line}</p>;
        })}
      </div>
    </div>
  );
}

/* ─── File Explorer ─── */

interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileTreeNode[];
  content?: string;
  language?: string;
}

/** Builds a nested tree structure from flat file paths */
function buildFileTree(files: OutputFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path: parts.slice(0, i + 1).join("/"),
          isFolder: !isLast,
          children: isLast ? undefined : [],
          content: isLast ? file.content : undefined,
          language: isLast ? file.language : undefined,
        };
        current.push(existing);
      }
      if (!isLast) current = existing.children!;
    }
  }
  return root;
}

/** Recursive file tree item — folders expand/collapse, files are selectable */
function FileTreeItem({ node, depth, selectedPath, onSelect }: {
  node: FileTreeNode; depth: number; selectedPath: string | null; onSelect: (node: FileTreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = selectedPath === node.path;

  if (node.isFolder) {
    return (
      <div>
        {/* Folder row — click toggles expand/collapse */}
        <button
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs hover:bg-secondary/50 rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <Folder className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="text-foreground truncate">{node.name}</span>
        </button>
        <AnimatePresence>
          {expanded && node.children && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              {node.children.map((child) => (
                <FileTreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    /* File row — click selects and shows content in right pane */
    <button
      className={`flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs rounded transition-colors ${isSelected ? "bg-primary/15 text-primary" : "hover:bg-secondary/50 text-muted-foreground"}`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onSelect(node)}
    >
      <File className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

/** File explorer — tree on left, content viewer on right */
function FileExplorer({ files }: { files: OutputFile[] }) {
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const tree = buildFileTree(files);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <FolderTree className="h-3.5 w-3.5 text-primary" />
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{files.length} files</Badge>
        </div>
        {/* Download All — concatenates all files into a single .txt */}
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            const blob = new Blob([files.map(f => `// ${f.path}\n${f.content}`).join("\n\n")], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "workflow-output.txt"; a.click();
            URL.revokeObjectURL(url);
          }}>
          <Download className="h-3 w-3" /> Download All
        </Button>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Left: file tree */}
        <ScrollArea className="w-48 border-r border-border/30 shrink-0">
          <div className="py-1">
            {tree.map((node) => (
              <FileTreeItem key={node.path} node={node} depth={0} selectedPath={selectedFile?.path || null} onSelect={setSelectedFile} />
            ))}
          </div>
        </ScrollArea>
        {/* Right: file content viewer */}
        <ScrollArea className="flex-1">
          {selectedFile ? (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">{selectedFile.path}</span>
                {/* Copy file content to clipboard */}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(selectedFile.content || "")} disabled={selectedFile.path.match(/\.(xlsx|docx|pdf|png|jpg)$/i) !== null}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Smart Content Viewer: Detect binary files */}
              {selectedFile.path.match(/\.(xlsx|docx|pdf)$/i) ? (
                <div className="flex flex-col items-center justify-center p-12 bg-secondary/20 rounded-xl border border-dashed border-border/50 gap-4">
                   <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                     <FileText className="h-8 w-8 text-primary" />
                   </div>
                   <div className="text-center">
                     <p className="text-sm font-semibold text-foreground">Binary Document</p>
                     <p className="text-[11px] text-muted-foreground mt-1">This file type is best viewed in its native application.</p>
                   </div>
                   <Button size="sm" className="gap-2" onClick={() => window.open(`http://127.0.0.1:8089/api/workspace/download?path=${encodeURIComponent(selectedFile.path)}`, "_blank")}>
                     <Download className="h-3.5 w-3.5" /> Download {selectedFile.name}
                   </Button>
                </div>
              ) : (
                <pre className="text-[11px] text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/30 overflow-x-auto whitespace-pre-wrap">
                  {selectedFile.content}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-8">
              Select a file to view its contents
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/* ─── Live Preview ─── */
/**
 * Iframe-based live preview.
 * Shows when workflow output includes a previewUrl (e.g., deployed web app).
 * Currently MOCKED — no workflows produce a previewUrl yet.
 */
function LivePreview({ url }: { url?: string }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <Eye className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground text-center">No preview available for this output type</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="text-xs text-muted-foreground truncate">{url}</span>
        {/* Opens preview in a new browser tab */}
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(url, "_blank")}>
          <ExternalLink className="h-3 w-3" /> Open in tab
        </Button>
      </div>
      <div className="flex-1 bg-white rounded-b-lg overflow-hidden">
        <iframe src={url} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin" />
      </div>
    </div>
  );
}

/* ─── Main Output Viewer ─── */
/**
 * Tabbed container that auto-selects the best tab based on available output.
 * Priority: Document > Files > Preview
 */
export function OutputViewer({ output }: { output: WorkflowOutput | null }) {
  if (!output) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <FileText className="h-10 w-10 text-muted-foreground/20" />
        <p className="text-xs text-muted-foreground">Run the workflow to see results here</p>
      </div>
    );
  }

  const defaultTab = output.markdown ? "document" : output.files?.length ? "files" : "preview";

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col h-full">
      {/* Tab buttons — disabled when that output type isn't available */}
      <TabsList className="mx-3 mt-2 bg-secondary/50 h-8">
        <TabsTrigger value="document" className="text-xs gap-1.5 h-6 px-3" disabled={!output.markdown}>
          <FileText className="h-3 w-3" /> Document
        </TabsTrigger>
        <TabsTrigger value="files" className="text-xs gap-1.5 h-6 px-3" disabled={!output.files?.length}>
          <FolderTree className="h-3 w-3" /> Files
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs gap-1.5 h-6 px-3" disabled={!output.previewUrl}>
          <Eye className="h-3 w-3" /> Preview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="document" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full">
          {output.markdown && <MarkdownRenderer content={output.markdown} />}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="files" className="flex-1 mt-0 min-h-0">
        {output.files && <FileExplorer files={output.files} />}
      </TabsContent>
      <TabsContent value="preview" className="flex-1 mt-0 min-h-0">
        <LivePreview url={output.previewUrl} />
      </TabsContent>
    </Tabs>
  );
}
