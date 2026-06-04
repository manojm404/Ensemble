import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { WS_BASE_URL } from './api';
import { scopedStorageKey } from './storage-scope';

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

interface Event {
  type: string;
  payload: any;
}

interface EventContextType {
  status: WebSocketStatus;
  lastEvent: Event | null;
}

const EventContext = createContext<EventContextType | null>(null);

export const useEventContext = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEventContext must be used within an EventProvider');
  }
  return context;
};

export const EventProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<Event | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  const connect = useCallback(() => {
    setStatus('connecting');
    const token = localStorage.getItem('ensemble_auth_token');
    if (!token) {
      setStatus('disconnected');
      return;
    }

    const companyScope = localStorage.getItem(scopedStorageKey('ensemble_current_company')) || 'user:anonymous';

    const ws = new WebSocket(`${WS_BASE_URL}/ws/${encodeURIComponent(companyScope)}?token=${token}`);

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => {
      setStatus('disconnected');
      // Optional: implement reconnect logic here
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: data.type, payload: data.payload });
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };

    setSocket(ws);
  }, []);

  useEffect(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }
    return () => {
      socket?.close();
    };
  }, [socket, connect]);

  const value = { status, lastEvent };

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
};
