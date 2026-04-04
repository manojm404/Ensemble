import { useState, useEffect, useRef } from 'react';
import { 
  FileText, Terminal, X, Download, Archive, 
  Activity, ExternalLink, RefreshCcw,
  Globe, Code, Layout, FolderOpen, Shield,
  Fingerprint, Diff, Eye, Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { diff_match_patch } from 'diff-match-patch';
import { useEvents } from '../../context/EventContext';
import { NeuralMirror } from './NeuralMirror';

interface Artifact {
  id: string;
  name: string;
  hash: string;
  type: string;
  content: string;
  previous_content?: string;
  run_id: string;
}

interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
}

interface ViewerPaneProps {
  runId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewerPane({ runId, isOpen, onClose }: ViewerPaneProps) {
  const [isDevMode, setIsDevMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'artifacts' | 'logs' | 'preview'>('preview');
  const [previewSubTab, setPreviewSubTab] = useState<'browser' | 'workspace'>('workspace');
  
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<{path: string, content: string} | null>(null);
  
  const { events } = useEvents();
  const [viewMode, setViewMode] = useState<'raw' | 'diff'>('raw');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default to logs if a runId just appeared
  useEffect(() => {
    if (runId && activeTab === 'preview') {
      setActiveTab('logs');
    }
  }, [runId]);

  useEffect(() => {
    if (activeTab === 'logs') {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [events, activeTab]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (runId) {
          const artRes = await fetch(`http://localhost:8088/api/runs/${runId}/artifacts`);
          const artData = await artRes.json();
          setArtifacts(artData);
          if (artData.length > 0 && !selectedArtifact) {
            setSelectedArtifact(artData[0]);
          }
        } else {
          setArtifacts([]);
          setSelectedArtifact(null);
        }

        const treeRes = await fetch(`http://localhost:8088/api/workspace/tree`);
        const treeData = await treeRes.json();
        setWorkspaceTree(treeData);
      } catch (e) {
        console.error("Failed to fetch viewer data:", e);
      }
    };
    if (isOpen) fetchData();
  }, [runId, isOpen, selectedArtifact]);

  const fetchFileContent = async (path: string) => {
    try {
      const res = await fetch(`http://localhost:8088/api/workspace/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setSelectedFile(data);
    } catch (e) {
      console.error("Failed to fetch file content:", e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 w-[600px] h-full bg-[#121212] border-l border-white/5 z-[200] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-[#1a1a1a] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Activity size={18} className={`${runId ? 'text-blue-500 animate-pulse' : 'text-gray-600'}`} />
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tactical Viewer v3</span>
            <span className="text-xs font-bold text-gray-300">
              {runId ? `RUN_ID: ${runId.substring(0, 8)}...` : 'IDLE / EXPLORER'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full border border-white/5">
            <span className={`text-[9px] font-black uppercase tracking-widest ${!isDevMode ? 'text-blue-400' : 'text-gray-600'}`}>Product</span>
            <button 
              onClick={() => {
                setIsDevMode(!isDevMode);
                setActiveTab(isDevMode ? 'preview' : 'logs');
              }}
              className={`w-8 h-4 rounded-full relative transition-all ${isDevMode ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isDevMode ? 'left-4.5' : 'left-0.5'}`} />
            </button>
            <span className={`text-[9px] font-black uppercase tracking-widest ${isDevMode ? 'text-blue-400' : 'text-gray-600'}`}>Inspector</span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>
      </div>

      {isDevMode && (
        <div className="flex bg-black/20 border-b border-white/5">
          <button 
            onClick={() => setActiveTab('logs')}
            disabled={!runId}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${
              !runId ? 'opacity-20 cursor-not-allowed' :
              activeTab === 'logs' ? 'text-blue-400 border-b-2 border-blue-400 bg-white/5' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Terminal size={12} /> Neural Logs
          </button>
          <button 
            onClick={() => setActiveTab('artifacts')}
            disabled={!runId}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${
              !runId ? 'opacity-20 cursor-not-allowed' :
              activeTab === 'artifacts' ? 'text-blue-400 border-b-2 border-blue-400 bg-white/5' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Archive size={12} /> CAS Artifacts
          </button>
          <button 
            onClick={() => setActiveTab('preview')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'preview' ? 'text-blue-400 border-b-2 border-blue-400 bg-white/5' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Layout size={12} /> Product Preview
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {activeTab === 'logs' && (
          <div className="h-full overflow-hidden">
            <NeuralMirror runId={runId || ''} />
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="flex bg-[#1a1a1a] border-b border-white/5 px-4 h-12 items-center gap-6">
              <button 
                onClick={() => setPreviewSubTab('workspace')}
                className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                  previewSubTab === 'workspace' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <FolderOpen size={14} className={previewSubTab === 'workspace' ? 'animate-pulse' : ''} /> Workspace
              </button>
              <button 
                onClick={() => setPreviewSubTab('browser')}
                className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                  previewSubTab === 'browser' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Globe size={14} className={previewSubTab === 'browser' ? 'animate-pulse' : ''} /> Browser
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
              {previewSubTab === 'workspace' && (
                <div className="flex flex-1 overflow-hidden">
                  <div className="w-48 border-r border-white/5 bg-black/20 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-white/5 flex items-center justify-between bg-black/40">
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Directory</span>
                      <button onClick={() => {}} className="text-gray-500 hover:text-white transition-all">
                        <RefreshCcw size={12} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                      {workspaceTree.map((file: WorkspaceFile) => (
                        <button 
                          key={file.path}
                          onClick={() => fetchFileContent(file.path)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all ${
                            selectedFile?.path === file.path ? 'bg-blue-600/20 text-blue-400' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                          }`}
                        >
                          <FileText size={14} />
                          <span className="text-[11px] truncate font-medium">{file.name}</span>
                        </button>
                      ))}
                      {workspaceTree.length === 0 && (
                        <div className="text-center py-8 text-[9px] text-gray-700 uppercase font-black italic tracking-tighter">Empty</div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col bg-black/40 overflow-hidden relative">
                    {selectedFile ? (
                      <div className="h-full flex flex-col">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#1a1a1a]">
                          <div className="flex items-center gap-2">
                            <Code size={14} className="text-blue-500" />
                            <span className="text-xs font-bold text-gray-300">{selectedFile.path}</span>
                          </div>
                          <button onClick={() => setSelectedFile(null)} className="text-gray-600 hover:text-white">
                            <ExternalLink size={14} />
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 font-mono text-[12px] text-gray-400 bg-[#0d0d0d]">
                          <pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-700 font-black uppercase text-[10px] tracking-widest italic opacity-20">
                        Select a file to observe content
                      </div>
                    )}
                  </div>
                </div>
              )}

              {previewSubTab === 'browser' && (
                <div className="w-full h-full flex flex-col">
                  <div className="h-10 bg-[#1a1a1a] border-b border-white/5 flex items-center px-4 gap-4">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/40" />
                      <div className="w-2 h-2 rounded-full bg-amber-500/40" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
                    </div>
                    <div className="flex-1 bg-black/40 h-6 rounded px-3 flex items-center text-[10px] text-gray-500 font-mono">
                      http://localhost:3000
                    </div>
                  </div>
                  <iframe 
                    src="http://localhost:3000" 
                    className="flex-1 w-full bg-white border-none"
                    title="Live Preview"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="h-full flex flex-col overflow-hidden bg-[#0d0d0d]">
            <div className="p-6 bg-blue-500/5 border-b border-blue-500/10 mb-2">
               <div className="flex items-center gap-3 text-blue-400 mb-2">
                 <Shield size={18} />
                 <h4 className="text-xs font-black uppercase tracking-widest">EnsembleSpace Artifacts</h4>
               </div>
               <p className="text-[10px] text-gray-500 leading-relaxed max-w-md italic">
                 Formal, immutable deliverables committed by the agent network. Each artifact is versioned using SHA-256 CAS for a deterministic audit log.
               </p>
            </div>

            {artifacts.length > 0 ? (
              <div className="flex-1 flex overflow-hidden">
                <div className="w-20 border-r border-white/5 bg-black/20 flex flex-col items-center py-4 gap-4 overflow-y-auto">
                  {artifacts.map((a: Artifact) => (
                    <button 
                      key={a.id}
                      onClick={() => setSelectedArtifact(a)}
                      className={`p-3 rounded-xl transition-all ${
                        selectedArtifact?.id === a.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-600 hover:text-gray-400'
                      }`}
                      title={a.name}
                    >
                      <FileText size={20} />
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  {selectedArtifact ? (
                    <div className="animate-in fade-in zoom-in-95 duration-500">
                      <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">
                            {selectedArtifact.type} Deliverable
                          </span>
                          <h3 className="text-lg font-bold text-gray-200">{selectedArtifact.name}</h3>
                          <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-gray-600 bg-black/20 px-2 py-1 rounded w-fit">
                             <Fingerprint size={10} />
                             <span>SHA-256: {selectedArtifact.hash.substring(0, 16)}...</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-black/40 rounded-lg p-1 border border-white/5">
                            <button 
                              onClick={() => setViewMode('raw')}
                              className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'raw' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                            >
                              <Eye size={10} className="inline mr-1" /> Raw
                            </button>
                            <button 
                              onClick={() => setViewMode('diff')}
                              className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'diff' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                            >
                              <Diff size={10} className="inline mr-1" /> Diff
                            </button>
                          </div>
                          <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">
                            <Download size={14} /> EXTRACT
                          </button>
                        </div>
                      </div>

                      {selectedArtifact.content.length > 10 * 1024 * 1024 ? (
                        <div className="p-8 border border-dashed border-amber-500/20 rounded-2xl bg-amber-500/5 text-center">
                          <Info className="mx-auto text-amber-500 mb-2" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">
                            Large file threshold exceeded (10MB+). Visual diffing disabled.
                          </span>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-blue max-w-none prose-sm">
                          {viewMode === 'raw' ? (
                            <ReactMarkdown>{selectedArtifact.content}</ReactMarkdown>
                          ) : (
                            <div className="font-mono text-[11px] leading-relaxed bg-[#050505] p-6 rounded-2xl border border-white/5 whitespace-pre-wrap">
                              {renderDiff(selectedArtifact.previous_content || '', selectedArtifact.content)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-700 font-black uppercase text-[10px] tracking-widest italic opacity-20">
                      Select an artifact to perform forensic review
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                <Archive size={48} />
                <span className="mt-4 text-[10px] font-black uppercase tracking-widest">No CAS commits detected</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderDiff(oldStr: string, newStr: string) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldStr, newStr);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map((part, index) => {
    const [type, value] = part;
    if (type === 1) {
      return <span key={index} className="bg-emerald-500/20 text-emerald-400 px-1 rounded">{value}</span>;
    }
    if (type === -1) {
      return <span key={index} className="bg-red-500/20 text-red-400 px-1 rounded line-through decoration-red-900">{value}</span>;
    }
    return <span key={index} className="text-gray-500">{value}</span>;
  });
}
