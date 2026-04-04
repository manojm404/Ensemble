import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Node, Edge, OnNodesChange, OnEdgesChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

const THROTTLE_MS = 50; // User Refinement: 50ms awareness throttle

export function useYjsSync(workflowId: string | null) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!workflowId) return;

    const wsProvider = new WebsocketProvider(
      'ws://localhost:1234',
      `ensemble-wf-${workflowId}`,
      ydoc
    );

    const yNodes = ydoc.getMap<Node>('nodes');
    const yEdges = ydoc.getMap<Edge>('edges');

    // Sync from Yjs to React Flow
    const observeNodes = () => {
      setNodes(Array.from(yNodes.values()));
    };
    const observeEdges = () => {
      setEdges(Array.from(yEdges.values()));
    };

    yNodes.observe(observeNodes);
    yEdges.observe(observeEdges);

    // Initial load
    observeNodes();
    observeEdges();

    // Awareness (Cursors & Presence)
    wsProvider.awareness.on('change', () => {
      const states = Array.from(wsProvider.awareness.getStates().values());
      setUsers(states.filter(s => s.user));
    });

    setProvider(wsProvider);

    return () => {
      yNodes.unobserve(observeNodes);
      yEdges.unobserve(observeEdges);
      wsProvider.disconnect();
      ydoc.destroy();
    };
  }, [workflowId, ydoc]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const nextNodes = applyNodeChanges(changes, nds);
      
      const yNodes = ydoc.getMap<Node>('nodes');
      ydoc.transact(() => {
        nextNodes.forEach(node => {
          yNodes.set(node.id, node);
        });
      });
      
      return nextNodes;
    });
  }, [ydoc]);

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => {
      const nextEdges = applyEdgeChanges(changes, eds);
      
      const yEdges = ydoc.getMap<Edge>('edges');
      ydoc.transact(() => {
        nextEdges.forEach(edge => {
          yEdges.set(edge.id, edge);
        });
      });
      
      return nextEdges;
    });
  }, [ydoc]);

  // Throttled Awareness Broadcast
  const [lastBroadcast, setLastBroadcast] = useState(0);
  const updateCursor = useCallback((x: number, y: number) => {
    if (!provider) return;
    const now = Date.now();
    if (now - lastBroadcast < THROTTLE_MS) return;

    provider.awareness.setLocalStateField('user', {
      name: 'Agent', // In a real app, this would be the user's name
      color: '#3b82f6',
      cursor: { x, y }
    });
    setLastBroadcast(now);
  }, [provider, lastBroadcast]);

  // Dirty State Recovery: Force Re-sync from Source
  const resyncFromSource = useCallback((sourceNodes: Node[], sourceEdges: Edge[]) => {
    ydoc.transact(() => {
      const yNodes = ydoc.getMap<Node>('nodes');
      const yEdges = ydoc.getMap<Edge>('edges');
      yNodes.clear();
      yEdges.clear();
      sourceNodes.forEach(n => yNodes.set(n.id, n));
      sourceEdges.forEach(e => yEdges.set(e.id, e));
    });
  }, [ydoc]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    users,
    updateCursor,
    resyncFromSource,
    setNodes,
    setEdges
  };
}
