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

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, ExternalLink, FileText, FolderTree, Eye, ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "@/lib/api";

export interface OutputFile {
  path: string;
  content: string;
  language?: string;
}

export interface WorkflowOutput {
  markdown?: string;
  files?: OutputFile[];
  /** Workflow ID for fetching preview HTML */
  workflowId?: string;
}

/* ─── Markdown Renderer ─── */
/**
 * White document style markdown renderer with copy/download.
 * Same styling as OrgTasks TaskOutputDocument.
 */
function MarkdownRenderer({ content }: { content: string }) {
  const copyToClipboard = () => navigator.clipboard.writeText(content);

  const renderInline = (text: string): React.ReactNode => {
    if (/\*\*(.*?)\*\*/g.test(text)) {
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;
      while (/\*\*(.*?)\*\*/g.test(remaining)) {
        const match = remaining.match(/\*\*(.*?)\*\*/);
        if (match) {
          const idx = remaining.indexOf(match[0]);
          if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
          parts.push(<strong key={key++} className="font-semibold text-gray-900 dark:text-foreground">{match[1]}</strong>);
          remaining = remaining.slice(idx + match[0].length);
        } else break;
      }
      if (remaining) parts.push(<span key={key++}>{remaining}</span>);
      return <>{parts}</>;
    }
    if (/`([^`]+)`/g.test(text)) {
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;
      while (/`([^`]+)`/g.test(remaining)) {
        const match = remaining.match(/`([^`]+)`/);
        if (match) {
          const idx = remaining.indexOf(match[0]);
          if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
          parts.push(<code key={key++} className="bg-blue-50 dark:bg-primary/10 px-1.5 py-0.5 rounded text-xs font-mono text-blue-700 dark:text-primary">{match[1]}</code>);
          remaining = remaining.slice(idx + match[0].length);
        } else break;
      }
      if (remaining) parts.push(<span key={key++}>{remaining}</span>);
      return <>{parts}</>;
    }
    return text;
  };

  const renderLines = () => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const Tag = listType;
        elements.push(
          <Tag key={`list-${elements.length}`} className={`ml-6 my-2 space-y-1 ${listType === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {listItems.map((item, i) => <li key={i} className="text-sm text-gray-700 dark:text-muted-foreground leading-relaxed">{renderInline(item)}</li>)}
          </Tag>
        );
        listItems = [];
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          flushList();
          elements.push(
            <pre key={`code-${elements.length}`} className="bg-gray-50 dark:bg-secondary/80 border border-gray-200 dark:border-border/50 rounded-lg p-4 my-3 overflow-x-auto">
              <code className="text-xs font-mono text-gray-700 dark:text-primary leading-relaxed">{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          flushList();
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) { codeContent.push(line); continue; }
      if (line.startsWith('### ')) { flushList(); elements.push(<h4 key={elements.length} className="text-base font-bold text-gray-900 dark:text-foreground mt-5 mb-2">{renderInline(line.slice(4))}</h4>); continue; }
      if (line.startsWith('## ')) { flushList(); elements.push(<h3 key={elements.length} className="text-lg font-bold text-gray-900 dark:text-foreground mt-6 mb-3 pb-1 border-b border-gray-200 dark:border-border/20">{renderInline(line.slice(3))}</h3>); continue; }
      if (line.startsWith('# ')) { flushList(); elements.push(<h2 key={elements.length} className="text-xl font-bold text-gray-900 dark:text-foreground mt-4 mb-3">{renderInline(line.slice(2))}</h2>); continue; }
      if (line.startsWith('---') || line.startsWith('***')) { flushList(); elements.push(<hr key={elements.length} className="my-4 border-gray-200 dark:border-border/20" />); continue; }
      if (/^\s*[-*•] /.test(line)) { listType = listType || 'ul'; listItems.push(line.replace(/^\s*[-*•] /, '')); continue; }
      if (/^\s*\d+[\.\)] /.test(line)) { listType = listType || 'ol'; listItems.push(line.replace(/^\s*\d+[\.\)] /, '')); continue; }
      flushList();
      if (line.trim() === '') { elements.push(<div key={elements.length} className="h-3" />); continue; }
      elements.push(<p key={elements.length} className="text-sm text-gray-700 dark:text-muted-foreground leading-relaxed my-1">{renderInline(line)}</p>);
    }
    flushList();
    return elements;
  };

  return (
    <div className="relative">
      {/* Floating action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground" onClick={copyToClipboard} title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground" title="Download .md"
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
      {/* Theme-aware document container */}
      <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 p-5 max-h-[calc(100vh-200px)] overflow-y-auto">
        <div className="space-y-0">
          {renderLines()}
        </div>
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
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(selectedFile.content || "")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <pre className="text-[11px] text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/30 overflow-x-auto whitespace-pre-wrap">
                {selectedFile.content}
              </pre>
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
 * Fetches HTML from the backend preview endpoint and renders via srcdoc.
 */
function LivePreview({ workflowId }: { workflowId?: string }) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/workflows/${workflowId}/preview`)
      .then(res => {
        if (!res.ok) throw new Error("No preview found");
        return res.json();
      })
      .then(data => {
        setHtmlContent(data.html);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [workflowId]);

  if (!workflowId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <Eye className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground text-center">No preview available for this output type</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Loading preview...</p>
      </div>
    );
  }

  if (error || !htmlContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <Eye className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground text-center">No HTML preview found</p>
        <p className="text-[10px] text-muted-foreground/60">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="text-xs text-muted-foreground truncate">Live Preview</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
          const blob = new Blob([htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
        }}>
          <ExternalLink className="h-3 w-3" /> Open in tab
        </Button>
      </div>
      <div className="flex-1 bg-white rounded-b-lg overflow-hidden">
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin"
        />
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
        <LivePreview workflowId={output.workflowId} />
      </TabsContent>
    </Tabs>
  );
}
