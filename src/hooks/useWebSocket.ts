'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTokenStore } from '@/store';
import { TokenAnalysis, MonitorStats } from '@/types';

interface WebSocketMessage {
  type: 'token:passed' | 'token:analyzed' | 'stats:update' | 'connection:status';
  data: TokenAnalysis | MonitorStats | { connected: boolean; error?: string };
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { 
    addToken, 
    updateStats, 
    setConnectionStatus,
    isConnected,
    connectionError,
  } = useTokenStore();

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    
    try {
      const ws = new WebSocket(`${wsUrl}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus(true);
        
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'token:passed':
            case 'token:analyzed':
              addToken(message.data as TokenAnalysis);
              break;
            case 'stats:update':
              updateStats(message.data as MonitorStats);
              break;
            case 'connection:status':
              const status = message.data as { connected: boolean; error?: string };
              setConnectionStatus(status.connected, status.error);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus(false, 'Connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed, attempting reconnect...');
        setConnectionStatus(false);
        
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setConnectionStatus(false, 'Failed to connect');
    }
  }, [addToken, updateStats, setConnectionStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus(false);
  }, [setConnectionStatus]);

  // Send message through WebSocket
  const sendMessage = useCallback((type: string, data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    sendMessage,
  };
}
