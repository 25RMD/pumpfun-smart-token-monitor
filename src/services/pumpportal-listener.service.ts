import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { getCachedSolPrice } from './sol-price.service';

// PumpPortal WebSocket for migration events
const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';

// Pump.fun Program IDs
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_MIGRATION_PROGRAM_ID = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

export interface MigrationEvent {
  txType: 'migration';
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  pool: string;
  timestamp: number;
  marketCap?: number;
  liquidity?: number;
  creator?: string;
}

export interface TradeEvent {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'buy' | 'sell';
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
}

type PumpPortalEvent = 
  | { txType: 'migration'; signature: string; mint: string; name: string; symbol: string; uri: string; pool: string; marketCapSol?: number; creator?: string }
  | { txType: 'buy' | 'sell'; signature: string; mint: string; traderPublicKey: string; tokenAmount: number; solAmount: number };

class PumpPortalListener extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private isConnecting = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(PUMPPORTAL_WS);

        this.ws.on('open', () => {
          console.log('✅ Connected to PumpPortal WebSocket');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Subscribe to migration events
          this.subscribeMigrations();
          
          // Start ping interval to keep connection alive
          this.startPingInterval();
          
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString()) as PumpPortalEvent;
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing PumpPortal message:', error);
          }
        });

        this.ws.on('error', (error) => {
          console.warn('PumpPortal WebSocket error:', error instanceof Error ? error.message : error);
          this.isConnecting = false;
          // Don't emit error to prevent uncaught exceptions - just log and reconnect
        });

        this.ws.on('close', (code, reason) => {
          console.log(`PumpPortal WebSocket closed: ${code} - ${reason}`);
          this.isConnecting = false;
          this.stopPingInterval();
          this.emit('disconnected');
          
          // Attempt to reconnect
          this.scheduleReconnect();
        });

        // Handle connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            console.warn('PumpPortal connection timeout');
            this.scheduleReconnect();
            resolve(); // Don't reject, just continue
          }
        }, 10000);

      } catch (error) {
        this.isConnecting = false;
        console.warn('PumpPortal connection error:', error instanceof Error ? error.message : error);
        this.scheduleReconnect();
        resolve(); // Don't reject, just continue
      }
    });
  }

  private subscribeMigrations(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Subscribe to all migration events
    const subscribeMessage = {
      method: 'subscribeMigration',
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    this.subscriptions.add('migrations');
    console.log('📡 Subscribed to migration events');
  }

  subscribeToToken(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    if (this.subscriptions.has(mint)) return;

    const subscribeMessage = {
      method: 'subscribeTokenTrade',
      keys: [mint],
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    this.subscriptions.add(mint);
    console.log(`📡 Subscribed to token trades: ${mint.slice(0, 8)}...`);
  }

  unsubscribeFromToken(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    if (!this.subscriptions.has(mint)) return;

    const unsubscribeMessage = {
      method: 'unsubscribeTokenTrade',
      keys: [mint],
    };
    
    this.ws.send(JSON.stringify(unsubscribeMessage));
    this.subscriptions.delete(mint);
  }

  private handleMessage(message: PumpPortalEvent): void {
    if (message.txType === 'migration') {
      console.log(`🔍 PumpPortal migration data:`, JSON.stringify(message, null, 2));
      const migrationEvent: MigrationEvent = {
        txType: 'migration',
        signature: message.signature,
        mint: message.mint,
        name: message.name,
        symbol: message.symbol,
        uri: message.uri,
        pool: message.pool,
        timestamp: Date.now(),
        marketCap: message.marketCapSol ? message.marketCapSol * (getCachedSolPrice() || 0) : undefined,
        liquidity: undefined,
        creator: message.creator,
      };
      
      console.log(`🚀 Migration detected: ${message.name} ($${message.symbol})`);
      this.emit('migration', migrationEvent);
    } else if (message.txType === 'buy' || message.txType === 'sell') {
      const tradeEvent: TradeEvent = {
        signature: message.signature,
        mint: message.mint,
        traderPublicKey: message.traderPublicKey,
        txType: message.txType,
        tokenAmount: message.tokenAmount,
        solAmount: message.solAmount,
        timestamp: Date.now(),
      };
      
      this.emit('trade', tradeEvent);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached for PumpPortal');
      this.emit('maxReconnectAttempts');
      // Reset attempts after some time to allow future reconnects
      setTimeout(() => {
        this.reconnectAttempts = 0;
        console.log('🔄 Resetting PumpPortal reconnection attempts');
      }, 60000);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    
    console.log(`Reconnecting to PumpPortal in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch((err) => {
        console.warn('PumpPortal reconnect failed:', err instanceof Error ? err.message : err);
      });
    }, delay);
  }

  disconnect(): void {
    this.stopPingInterval();
    this.subscriptions.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let pumpPortalListener: PumpPortalListener | null = null;

export function getPumpPortalListener(): PumpPortalListener {
  if (!pumpPortalListener) {
    pumpPortalListener = new PumpPortalListener();
  }
  return pumpPortalListener;
}

export { PumpPortalListener };
