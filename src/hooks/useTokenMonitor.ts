import { useEffect, useRef, useState } from 'react';
import { useTokenStore } from '@/store/tokenStore';
import { TokenAnalysis } from '@/types';

export function useTokenMonitor() {
  const { 
    addToken, 
    setConnectionStatus, 
    updateStats,
    setTokens,
  } = useTokenStore();
  
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      console.log('Connecting to token stream...');
      setConnectionStatus(false);

      const eventSource = new EventSource('/api/stream');
      eventSourceRef.current = eventSource;

      // Set a maximum loading timeout (30 seconds)
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        console.log('⚠️ Loading timeout - stopping loading indicator');
        setIsLoadingHistory(false);
      }, 30000);

      eventSource.onopen = () => {
        console.log('✅ Connected to token stream');
        setConnectionStatus(true);
      };

      eventSource.onerror = (error) => {
        console.error('Stream error:', error);
        setConnectionStatus(false, 'Connection lost');
        setIsLoadingHistory(false); // Stop loading on error
        
        // Attempt to reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 5000);
      };

      // Handle loading history status
      eventSource.addEventListener('loading', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`Loading ${data.count} historical tokens...`);
          setIsLoadingHistory(true);
        } catch (error) {
          console.error('Error parsing loading event:', error);
        }
      });

      // Handle history loaded
      eventSource.addEventListener('loaded', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`Loaded ${data.count} historical tokens`);
          setIsLoadingHistory(false);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
        } catch (error) {
          console.error('Error parsing loaded event:', error);
        }
      });

      // Handle initial data
      eventSource.addEventListener('initial', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tokens && data.tokens.length > 0) {
            setTokens(data.tokens);
            console.log(`Received ${data.tokens.length} initial tokens`);
          }
          if (data.stats) {
            updateStats(data.stats);
          }
          setIsLoadingHistory(false);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
        } catch (error) {
          console.error('Error parsing initial data:', error);
        }
      });

      // Handle new tokens
      eventSource.addEventListener('token', (event) => {
        try {
          const data = JSON.parse(event.data);
          const token: TokenAnalysis = data.token;
          
          if (token) {
            addToken(token);
            console.log(`New token: ${token.metadata.name} (${data.type})`);
          }
        } catch (error) {
          console.error('Error parsing token event:', error);
        }
      });

      // Handle connection status updates
      eventSource.addEventListener('status', (event) => {
        try {
          const data = JSON.parse(event.data);
          setConnectionStatus(data.status === 'connected');
        } catch (error) {
          console.error('Error parsing status:', error);
        }
      });

      // Handle heartbeat with stats
      eventSource.addEventListener('heartbeat', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.stats) {
            updateStats(data.stats);
          }
        } catch (error) {
          console.error('Error parsing heartbeat:', error);
        }
      });

      eventSource.addEventListener('connected', () => {
        setConnectionStatus(true);
      });
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [addToken, setConnectionStatus, updateStats, setTokens]);

  return { isLoadingHistory };
}

