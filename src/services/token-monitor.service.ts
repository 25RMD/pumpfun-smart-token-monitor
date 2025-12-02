import { EventEmitter } from 'events';
import { getPumpPortalListener, MigrationEvent } from './pumpportal-listener.service';
import { fetchRecentMigrations } from './pumpfun-api.service';
import { processNewMigration, getProcessedTokens, getStats } from './token-processor.service';
import { TokenAnalysis, MonitorStats } from '@/types';

class TokenMonitorService extends EventEmitter {
  private isRunning = false;
  private processedCount = 0;
  private initialLoadComplete = false;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Fetch and process recent graduated tokens
   */
  async loadRecentTokens(limit: number = 40): Promise<void> {
    if (this.initialLoadComplete) return;

    console.log(`📥 Loading last ${limit} graduated tokens...`);
    this.emit('loadingHistory', { count: limit });

    try {
      // Fetch recent migrations
      const recentMigrations = await fetchRecentMigrations(limit);

      if (recentMigrations.length === 0) {
        console.log('⚠️ No recent migrations found, continuing with live feed only');
        this.initialLoadComplete = true;
        this.emit('historyLoaded', { count: 0 });
        return;
      }

      console.log(`Found ${recentMigrations.length} recent migrations, processing...`);

      // Process each migration with timeout
      const batchSize = 2;
      for (let i = 0; i < recentMigrations.length; i += batchSize) {
        const batch = recentMigrations.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
          batch.map(async (migration) => {
            // Wrap in timeout
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 15000)
            );

            try {
              const event: MigrationEvent = {
                txType: 'migration',
                signature: migration.signature,
                mint: migration.mint,
                name: migration.name,
                symbol: migration.symbol,
                uri: migration.uri,
                pool: migration.pool,
                timestamp: migration.timestamp,
                marketCap: migration.marketCapSol ? migration.marketCapSol * 200 : undefined,
                creator: migration.creator,
              };

              const token = await Promise.race([
                processNewMigration(event),
                timeoutPromise
              ]);
              
              if (token) {
                this.processedCount++;
                if (token.analysis.passed) {
                  this.emit('tokenPassed', token);
                } else {
                  this.emit('tokenFiltered', token);
                }
                return token;
              }
            } catch {
              console.warn(`Skipping ${migration.mint.slice(0, 8)}... (timeout or error)`);
            }
            return null;
          })
        );

        // Count successful results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
        console.log(`  Batch ${Math.floor(i/batchSize) + 1}: ${successful}/${batch.length} processed`);

        // Delay between batches to avoid rate limits
        if (i + batchSize < recentMigrations.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      this.initialLoadComplete = true;
      console.log(`✅ Loaded ${this.processedCount} historical tokens`);
      this.emit('historyLoaded', { count: this.processedCount });

    } catch (error) {
      console.error('Error loading recent tokens:', error);
      this.initialLoadComplete = true;
      this.emit('historyLoaded', { count: 0 });
      this.emit('error', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Token monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Token Monitor Service...');

    // Load historical tokens first
    await this.loadRecentTokens(40);

    const listener = getPumpPortalListener();

    // Handle migration events
    listener.on('migration', async (event: MigrationEvent) => {
      try {
        console.log(`\n📦 New migration: ${event.name} ($${event.symbol})`);
        console.log(`   Mint: ${event.mint}`);
        
        const token = await processNewMigration(event, (analyzedToken) => {
          this.emit('tokenAnalyzed', analyzedToken);
        });

        if (token) {
          this.processedCount++;
          
          if (token.analysis.passed) {
            console.log(`✅ Token PASSED with score ${token.analysis.score}`);
            this.emit('tokenPassed', token);
          } else {
            console.log(`❌ Token FILTERED with score ${token.analysis.score}`);
            console.log(`   Flags: ${token.analysis.flags.join(', ')}`);
            this.emit('tokenFiltered', token);
          }
        }
      } catch (error) {
        console.error('Error processing migration:', error);
        this.emit('error', error);
      }
    });

    // Handle connection events
    listener.on('connected', () => {
      console.log('✅ Connected to PumpPortal');
      this.emit('connected');
    });

    listener.on('disconnected', () => {
      console.log('⚠️ Disconnected from PumpPortal');
      this.emit('disconnected');
    });

    listener.on('error', (error) => {
      console.error('PumpPortal error:', error);
      this.emit('error', error);
    });

    // Connect to PumpPortal
    try {
      await listener.connect();
    } catch (error) {
      console.error('Failed to connect to PumpPortal:', error);
      this.isRunning = false;
      throw error;
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    const listener = getPumpPortalListener();
    listener.disconnect();
    
    console.log('Token Monitor Service stopped');
    this.emit('stopped');
  }

  getTokens(onlyPassed: boolean = true): TokenAnalysis[] {
    return getProcessedTokens(onlyPassed);
  }

  getStats(): MonitorStats {
    return getStats();
  }

  get isConnected(): boolean {
    return getPumpPortalListener().isConnected;
  }

  get running(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let monitorService: TokenMonitorService | null = null;

export function getTokenMonitorService(): TokenMonitorService {
  if (!monitorService) {
    monitorService = new TokenMonitorService();
  }
  return monitorService;
}

export { TokenMonitorService };
