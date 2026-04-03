import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface EnsembleEvent {
  id: string;
  type: 'THOUGHT' | 'ACTION' | 'RESULT' | 'PENDING_APPROVAL' | 'GOVERNANCE_TIMEOUT' | 'FAILURE' | 'audit_event';
  timestamp: string;
  agent_id?: string;
  data: any;
}

interface EventContextType {
  events: EnsembleEvent[];
  isConnected: boolean;
  clearEvents: () => void;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const useEvents = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
};

export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<EnsembleEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<any>(null);
  const companyId = 'company_alpha';

  const connect = useCallback(() => {
    // 🛡️ Guard: Avoid overlapping connection attempts
    if (ws.current) {
      if (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN) {
        return;
      }
      ws.current.close();
    }

    const socketUrl = `ws://127.0.0.1:8088/ws/${companyId}`;
    console.log(`📡 [GlobalProvider] Handsaking with ${socketUrl}...`);
    
    const socket = new WebSocket(socketUrl);
    ws.current = socket;

    socket.onopen = () => {
      console.log('📡 [GlobalProvider] Real-time diffusion ACTIVE');
      setIsConnected(true);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data);
        const { type, data } = rawData;
        const newEvent: EnsembleEvent = {
          id: data.id || Math.random().toString(36).substr(2, 9),
          type: type as any,
          timestamp: data.timestamp || new Date().toISOString(),
          agent_id: data.agent_id,
          data: data
        };
        setEvents((prev) => [...prev, newEvent]);
      } catch (e) {
        console.error('📡 [GlobalProvider] Parse Error:', e);
      }
    };

    socket.onclose = (event) => {
      console.log(`📡 [GlobalProvider] Closed (Code: ${event.code}). Reconnecting in 3s...`);
      setIsConnected(false);
      ws.current = null;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    socket.onerror = (err) => {
      console.error('📡 [GlobalProvider] Error:', err);
      socket.close(); // Force close to trigger onclose/reconnect
    };
  }, [companyId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      ws.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return (
    <EventContext.Provider value={{ events, isConnected, clearEvents }}>
      {children}
    </EventContext.Provider>
  );
};
