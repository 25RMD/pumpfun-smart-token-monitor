import { Connection, PublicKey, ParsedAccountData, AccountInfo } from '@solana/web3.js';

// Helius RPC endpoint for better rate limits and reliability
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const BACKUP_RPC = 'https://api.mainnet-beta.solana.com';

// Singleton connection
let connection: Connection | null = null;

export function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = process.env.HELIUS_API_KEY ? HELIUS_RPC : BACKUP_RPC;
    connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: process.env.HELIUS_API_KEY 
        ? `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : undefined,
    });
  }
  return connection;
}

/**
 * Fetch token supply information
 */
export async function getTokenSupply(mintAddress: string): Promise<{
  supply: number;
  decimals: number;
} | null> {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const supplyInfo = await conn.getTokenSupply(mintPubkey);
    
    return {
      supply: parseFloat(supplyInfo.value.uiAmountString || '0'),
      decimals: supplyInfo.value.decimals,
    };
  } catch (error) {
    console.error(`Error fetching token supply for ${mintAddress}:`, error);
    return null;
  }
}

/**
 * Fetch all token accounts (holders) for a mint
 */
export async function getTokenAccounts(mintAddress: string): Promise<Array<{
  owner: string;
  amount: number;
  percentage: number;
}>> {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get token supply first
    const supplyInfo = await conn.getTokenSupply(mintPubkey);
    const totalSupply = parseFloat(supplyInfo.value.uiAmountString || '0');
    
    if (totalSupply === 0) return [];
    
    // Get largest accounts
    const largestAccounts = await conn.getTokenLargestAccounts(mintPubkey);
    
    const holders = await Promise.all(
      largestAccounts.value.map(async (account) => {
        try {
          const accountInfo = await conn.getParsedAccountInfo(account.address);
          const parsedData = accountInfo.value?.data as ParsedAccountData;
          const owner = parsedData?.parsed?.info?.owner || 'unknown';
          const amount = parseFloat(account.uiAmountString || '0');
          
          return {
            owner,
            amount,
            percentage: (amount / totalSupply) * 100,
          };
        } catch {
          return {
            owner: 'unknown',
            amount: parseFloat(account.uiAmountString || '0'),
            percentage: 0,
          };
        }
      })
    );
    
    return holders.filter((h) => h.amount > 0);
  } catch (error) {
    console.error(`Error fetching token accounts for ${mintAddress}:`, error);
    return [];
  }
}

/**
 * Get recent signatures for a token
 */
export async function getRecentSignatures(
  mintAddress: string,
  limit: number = 100
): Promise<string[]> {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    const signatures = await conn.getSignaturesForAddress(mintPubkey, { limit });
    return signatures.map((s: { signature: string }) => s.signature);
  } catch {
    console.error(`Error fetching signatures for ${mintAddress}`);
    return [];
  }
}

/**
 * Check if an account exists and is a valid token mint
 */
export async function isValidTokenMint(mintAddress: string): Promise<boolean> {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const accountInfo = await conn.getAccountInfo(mintPubkey);
    
    // Token Program ID
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    
    return accountInfo !== null && accountInfo.owner.equals(TOKEN_PROGRAM_ID);
  } catch (error) {
    return false;
  }
}

/**
 * Subscribe to account changes (for real-time updates)
 */
export function subscribeToAccount(
  address: string,
  callback: (accountInfo: AccountInfo<Buffer>) => void
): number {
  const conn = getConnection();
  const pubkey = new PublicKey(address);
  
  return conn.onAccountChange(pubkey, callback, 'confirmed');
}

/**
 * Unsubscribe from account changes
 */
export async function unsubscribeFromAccount(subscriptionId: number): Promise<void> {
  const conn = getConnection();
  await conn.removeAccountChangeListener(subscriptionId);
}
