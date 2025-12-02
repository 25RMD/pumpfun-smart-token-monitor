import { NextRequest } from 'next/server';
import { getTokenMonitorService } from '@/services/token-monitor.service';
import { TokenAnalysis } from '@/types';

// Server-Sent Events endpoint for real-time token updates
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      const monitor = getTokenMonitorService();
      
      // Send initial connection message
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream closed
        }
      };

      // Send connection status
      sendEvent('connected', { 
        status: monitor.isConnected ? 'connected' : 'connecting',
        timestamp: Date.now() 
      });

      // Listen for loading history
      const onLoadingHistory = (data: { count: number }) => {
        sendEvent('loading', { status: 'loading_history', count: data.count });
      };

      const onHistoryLoaded = (data: { count: number }) => {
        sendEvent('loaded', { status: 'history_loaded', count: data.count });
        
        // Send all loaded tokens (both passed AND filtered)
        const tokens = monitor.getTokens(false); // false = get ALL tokens
        console.log(`Sending ${tokens.length} tokens to frontend`);
        if (tokens.length > 0) {
          sendEvent('initial', { 
            tokens: tokens.slice(0, 30),
            stats: monitor.getStats()
          });
        }
      };

      // Listen for new tokens
      const onTokenPassed = (token: TokenAnalysis) => {
        sendEvent('token', { token, type: 'passed' });
      };

      const onTokenFiltered = (token: TokenAnalysis) => {
        sendEvent('token', { token, type: 'filtered' });
      };

      const onConnected = () => {
        sendEvent('status', { status: 'connected' });
      };

      const onDisconnected = () => {
        sendEvent('status', { status: 'disconnected' });
      };

      monitor.on('loadingHistory', onLoadingHistory);
      monitor.on('historyLoaded', onHistoryLoaded);
      monitor.on('tokenPassed', onTokenPassed);
      monitor.on('tokenFiltered', onTokenFiltered);
      monitor.on('connected', onConnected);
      monitor.on('disconnected', onDisconnected);

      // Start monitor if not running
      if (!monitor.running) {
        monitor.start().catch(console.error);
      } else {
        // If already running, send existing tokens immediately
        const existingTokens = monitor.getTokens(false); // false = get ALL tokens
        console.log(`Monitor already running, sending ${existingTokens.length} existing tokens`);
        if (existingTokens.length > 0) {
          sendEvent('initial', { 
            tokens: existingTokens.slice(0, 30),
            stats: monitor.getStats()
          });
        }
        // Tell client loading is done
        sendEvent('loaded', { status: 'history_loaded', count: existingTokens.length });
      }

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        sendEvent('heartbeat', { 
          timestamp: Date.now(),
          stats: monitor.getStats()
        });
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        monitor.off('loadingHistory', onLoadingHistory);
        monitor.off('historyLoaded', onHistoryLoaded);
        monitor.off('tokenPassed', onTokenPassed);
        monitor.off('tokenFiltered', onTokenFiltered);
        monitor.off('connected', onConnected);
        monitor.off('disconnected', onDisconnected);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
