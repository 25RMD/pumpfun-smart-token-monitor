import WebSocket from 'ws';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { processNewMigration, getStats, getProcessedTokens } from './services/token-processor.service';
import { MigrationEvent, TokenAnalysis } from './types';

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const PORT = parseInt(process.env.PORT || '3001');
const PUMPPORTAL_WS_URL = process.env.PUMPPORTAL_WS_URL || 'wss://pumpportal.fun/api/data';

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server for frontend connections
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store for connected clients
let connectedClients = 0;
let pumpPortalWs: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

/**
 * Connect to PumpPortal WebSocket
 */
function connectToPumpPortal() {
  if (pumpPortalWs) {
    pumpPortalWs.close();
  }

  console.log('Connecting to PumpPortal WebSocket...');

  try {
    pumpPortalWs = new WebSocket(PUMPPORTAL_WS_URL);

    pumpPortalWs.on('open', () => {
      console.log('Connected to PumpPortal WebSocket');

      // Subscribe to migration events
      pumpPortalWs?.send(JSON.stringify({
        method: 'subscribeTokenMigration',
      }));

      // Notify clients
      io.emit('connection:status', { connected: true });
    });

    pumpPortalWs.on('message', async (data: WebSocket.RawData) => {
      try {
        const event = JSON.parse(data.toString());

        // Handle migration events
        if (event.txType === 'migration') {
          console.log(`Migration event received: ${event.mint}`);

          const migrationEvent: MigrationEvent = {
            txType: 'migration',
            signature: event.signature,
            mint: event.mint,
            timestamp: event.timestamp || Date.now(),
            marketCap: event.marketCap || 0,
            liquidity: event.liquidity || 0,
            creator: event.creator,
          };

          // Process the token
          const result = await processNewMigration(migrationEvent, (token: TokenAnalysis) => {
            // Emit to all connected clients
            if (token.analysis.passed) {
              io.emit('token:passed', token);
            }
            io.emit('token:analyzed', token);
            io.emit('stats:update', getStats());
          });

          if (result) {
            console.log(`Token ${result.address} analyzed. Score: ${result.analysis.score}`);
          }
        }
      } catch (error) {
        console.error('Error processing PumpPortal message:', error);
      }
    });

    pumpPortalWs.on('error', (error) => {
      console.error('PumpPortal WebSocket error:', error);
      io.emit('connection:status', { connected: false, error: 'Connection error' });
    });

    pumpPortalWs.on('close', () => {
      console.log('PumpPortal WebSocket closed, attempting reconnect...');
      io.emit('connection:status', { connected: false });

      // Attempt to reconnect after 5 seconds
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = setTimeout(connectToPumpPortal, 5000);
    });
  } catch (error) {
    console.error('Failed to connect to PumpPortal:', error);
    // Retry after 5 seconds
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    reconnectTimeout = setTimeout(connectToPumpPortal, 5000);
  }
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`Client connected. Total clients: ${connectedClients}`);

  // Send initial data
  socket.emit('stats:update', getStats());

  // Send recent tokens
  const recentTokens = getProcessedTokens(true);
  recentTokens.forEach((token) => {
    socket.emit('token:passed', token);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`Client disconnected. Total clients: ${connectedClients}`);
  });

  // Handle manual token analysis request
  socket.on('analyze:token', async (tokenAddress: string) => {
    console.log(`Manual analysis requested for: ${tokenAddress}`);
    
    const event: MigrationEvent = {
      txType: 'migration',
      signature: 'manual',
      mint: tokenAddress,
      timestamp: Date.now(),
      marketCap: 0,
      liquidity: 0,
    };

    const result = await processNewMigration(event);
    if (result) {
      socket.emit('token:analyzed', result);
      io.emit('stats:update', getStats());
    }
  });
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`PumpPortal URL: ${PUMPPORTAL_WS_URL}`);

  // Connect to PumpPortal
  connectToPumpPortal();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  
  if (pumpPortalWs) {
    pumpPortalWs.close();
  }
  
  io.close();
  httpServer.close();
  process.exit(0);
});
