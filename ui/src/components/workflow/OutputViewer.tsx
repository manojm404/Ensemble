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
function MarkdownRenderer({ content, workflowTitle = "Workflow Output" }: { content: string, workflowTitle?: string }) {
  const copyToClipboard = () => navigator.clipboard.writeText(content);

  const handleDownloadPDF = () => {
    // Create a temporary iframe to hold the content for printing
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "-10000px";
    iframe.style.bottom = "-10000px";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    // Copy all stylesheets from the parent document to ensure Tailwind/Prose styles work
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(tag => tag.outerHTML)
      .join('\n');

    // Get the HTML content to print
    const contentHtml = document.getElementById("markdown-content")?.innerHTML || "";

    // Build the print document
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${workflowTitle}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          ${styleTags}
          <style>
            /* Print-specific overrides to ensure a clean, professional PDF */
            @page { 
              margin: 1in; 
              size: letter portrait;
            }
            
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
              background: white !important;
              color: #1f2937 !important;
              line-height: 1.6 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            
            /* Ensemble Watermark */
            .watermark {
              position: fixed;
              top: 45%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 130px;
              font-weight: 800;
              color: rgba(0, 0, 0, 0.03) !important;
              z-index: -1;
              pointer-events: none;
              letter-spacing: 0.15em;
              white-space: nowrap;
            }
            
            /* Beautiful Header */
            .pdf-header {
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 1.25rem;
              margin-bottom: 2.5rem;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            
            .pdf-header .brand {
              font-size: 1.5rem;
              font-weight: 800;
              color: #111827;
              display: flex;
              align-items: center;
              gap: 0.5rem;
              letter-spacing: -0.025em;
            }
            
            .pdf-header .brand svg {
              width: 28px;
              height: 28px;
              color: #4f46e5; /* Indigo */
            }
            
            .pdf-header .meta {
              text-align: right;
              font-size: 0.875rem;
              color: #6b7280;
            }

            .pdf-header .meta .title {
              font-weight: 700;
              color: #374151;
              margin-bottom: 0.25rem;
              font-size: 1rem;
            }
            
            /* Prose Typography Overrides */
            .prose { 
              max-width: none !important; 
            }
            .prose h1, .prose h2, .prose h3, .prose h4 { 
              color: #111827 !important; 
              font-family: 'Inter', sans-serif !important;
              break-after: avoid; 
            }
            .prose h1 { font-size: 2.25rem !important; font-weight: 800 !important; margin-bottom: 1.5rem !important; letter-spacing: -0.025em; }
            .prose h2 { font-size: 1.5rem !important; font-weight: 700 !important; margin-top: 2.5rem !important; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.5rem; }
            .prose p, .prose li { color: #374151 !important; font-size: 11pt !important; }
            
            /* Code blocks */
            .prose pre {
              background-color: #f8fafc !important;
              border: 1px solid #e2e8f0 !important;
              border-radius: 0.5rem !important;
              padding: 1.25rem !important;
              break-inside: avoid !important;
              box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
            }
            .prose code { color: #db2777 !important; font-weight: 600 !important; }
            .prose pre code { color: #334155 !important; font-weight: 400 !important; font-size: 9.5pt !important; }
            
            /* Tables */
            .prose table { width: 100% !important; border-collapse: collapse !important; margin: 2rem 0 !important; }
            .prose th, .prose td { border: 1px solid #e2e8f0 !important; padding: 0.75rem 1rem !important; text-align: left; }
            .prose th { background-color: #f8fafc !important; font-weight: 600 !important; color: #111827 !important; }
            
            /* Hide UI elements */
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <div class="watermark">ENSEMBLE</div>
          <div style="max-width: 8.5in; margin: 0 auto; padding: 0.5in 0;">
            <div class="pdf-header">
              <div class="brand">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Ensemble Platform
              </div>
              <div class="meta">
                <div class="title">${workflowTitle}</div>
                <div>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
            
            <div class="prose prose-sm max-w-none">
              ${contentHtml}
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    // Wait for styles to apply before printing
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      
      // Cleanup the iframe after printing dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

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
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Floating action buttons */}
      <div className="absolute top-6 right-6 flex gap-2 z-10 no-print">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background/80 backdrop-blur border-border/50 text-xs font-semibold shadow-sm" onClick={copyToClipboard}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background/80 backdrop-blur border-border/50 text-xs font-semibold shadow-sm"
          onClick={handleDownloadPDF}
        >
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
      </div>

      {/* Document container — centered paper style */}
      <div className="flex-1 overflow-y-auto bg-secondary/10 print:bg-white">
        <div className="px-4 py-8 md:px-8 min-h-full print:p-0">
          <div id="markdown-content" className="bg-card print:bg-white min-h-[11in] w-full max-w-4xl mx-auto shadow-2xl print:shadow-none shadow-black/20 border border-border/30 print:border-none rounded-xl print:rounded-none p-8 md:p-16 lg:p-20 print:p-0">
            <div className="prose prose-sm dark:prose-invert print:prose-p:text-black print:prose-headings:text-black max-w-none">
              {renderLines()}
            </div>
          </div>
          {/* Bottom spacer */}
          <div className="h-12 print:hidden" />
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
    <Tabs defaultValue={defaultTab} className="flex flex-col h-full overflow-hidden">
      {/* Tab buttons */}
      <div className="px-6 py-2 border-b border-border/30 bg-card/50 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between">
        <TabsList className="bg-secondary/50 h-9 p-1">
          <TabsTrigger value="document" className="text-xs gap-1.5 h-7 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" disabled={!output.markdown}>
            <FileText className="h-3.5 w-3.5" /> Document
          </TabsTrigger>
          <TabsTrigger value="files" className="text-xs gap-1.5 h-7 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" disabled={!output.files?.length}>
            <FolderTree className="h-3.5 w-3.5" /> Files
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs gap-1.5 h-7 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" disabled={!output.workflowId}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </TabsTrigger>
        </TabsList>
        
        {/* Context metadata if available */}
        <div className="hidden md:flex items-center gap-4">
           {output.markdown && (
             <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
               {output.markdown.split(/\s+/).length} Words
             </div>
           )}
           {output.files && (
             <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
               {output.files.length} Files
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 min-h-[400px] h-full relative overflow-hidden">
        <TabsContent value="document" className="absolute inset-0 mt-0 focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col">
          {output.markdown && <MarkdownRenderer content={output.markdown} />}
        </TabsContent>

        <TabsContent value="files" className="absolute inset-0 mt-0 focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col">
          {output.files && <FileExplorer files={output.files} />}
        </TabsContent>

        <TabsContent value="preview" className="absolute inset-0 mt-0 focus-visible:ring-0 data-[state=active]:flex data-[state=active]:flex-col">
          <LivePreview workflowId={output.workflowId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
