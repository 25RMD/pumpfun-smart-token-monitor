import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { TokenSecurity, LaunchAnalysis } from '@/types';

// Helius RPC
const getHeliusRpc = () => {
  const key = process.env.HELIUS_API_KEY;
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com';
};

let connection: Connection | null = null;
function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(getHeliusRpc(), 'confirmed');
  }
  return connection;
}

/**
 * Check token mint and freeze authorities
 */
export async function checkTokenAuthorities(tokenMint: string): Promise<{
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
}> {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    
    const mintInfo = await conn.getParsedAccountInfo(mintPubkey);
    const data = mintInfo.value?.data as { parsed?: { info?: { mintAuthority?: string | null; freezeAuthority?: string | null } } };
    
    const mintAuthority = data?.parsed?.info?.mintAuthority;
    const freezeAuthority = data?.parsed?.info?.freezeAuthority;
    
    // null or undefined means revoked
    const mintRevoked = mintAuthority === null || mintAuthority === undefined;
    const freezeRevoked = freezeAuthority === null || freezeAuthority === undefined;
    
    console.log(`🔐 ${tokenMint.slice(0, 8)} authorities: mint=${mintAuthority ?? 'REVOKED'}, freeze=${freezeAuthority ?? 'REVOKED'}`);
    
    return {
      mintAuthorityRevoked: mintRevoked,
      freezeAuthorityRevoked: freezeRevoked,
    };
  } catch (error) {
    // For pump.fun tokens, if RPC fails, assume authorities are revoked (they always are)
    console.warn(`RPC error checking authorities for ${tokenMint.slice(0, 8)}, assuming revoked (pump.fun default)`);
    return {
      mintAuthorityRevoked: true, // Pump.fun always revokes
      freezeAuthorityRevoked: true,
    };
  }
}

/**
 * Check LP lock status using Rugcheck API
 */
export async function checkLPLock(tokenMint: string): Promise<{
  lpLocked: boolean;
  lpLockPercentage: number;
  lpLockDuration: number;
}> {
  try {
    // Try Rugcheck.xyz API
    const response = await axios.get(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`,
      { timeout: 5000 }
    );
    
    const data = response.data;
    
    if (data?.risks) {
      const lpRisk = data.risks.find((r: { name: string }) => 
        r.name?.toLowerCase().includes('liquidity') || r.name?.toLowerCase().includes('lp')
      );
      
      return {
        lpLocked: !lpRisk || data.score > 500,
        lpLockPercentage: data.markets?.[0]?.lp?.lpLockedPct || 0,
        lpLockDuration: 0, // Would need more detailed API response
      };
    }
    
    return { lpLocked: false, lpLockPercentage: 0, lpLockDuration: 0 };
  } catch {
    // Fallback: Try GoPlus API
    try {
      const goplusResponse = await axios.get(
        `https://api.gopluslabs.io/api/v1/token_security/solana?contract_addresses=${tokenMint}`,
        { timeout: 5000 }
      );
      
      const tokenData = goplusResponse.data?.result?.[tokenMint.toLowerCase()];
      
      if (tokenData) {
        return {
          lpLocked: tokenData.lp_holders?.[0]?.is_locked === '1',
          lpLockPercentage: parseFloat(tokenData.lp_holders?.[0]?.percent || '0') * 100,
          lpLockDuration: 0,
        };
      }
    } catch {
      // Silent fail
    }
    
    return { lpLocked: false, lpLockPercentage: 0, lpLockDuration: 0 };
  }
}

/**
 * Analyze launch for bundled buys and snipers using Helius
 */
export async function analyzeLaunch(
  tokenMint: string,
  creationTimestamp: number
): Promise<LaunchAnalysis> {
  const defaultResult: LaunchAnalysis = {
    bundledBuys: 0,
    sniperCount: 0,
    firstBuyerHoldings: 0,
    avgFirstBuySize: 0,
    creatorBoughtBack: false,
  };

  if (!process.env.HELIUS_API_KEY) {
    return defaultResult;
  }

  try {
    // Fetch first transactions after token creation
    const response = await axios.get(
      `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions`,
      {
        params: {
          'api-key': process.env.HELIUS_API_KEY,
          limit: 100,
          type: 'SWAP',
        },
        timeout: 8000,
      }
    );

    const transactions = response.data || [];
    
    if (transactions.length === 0) {
      return defaultResult;
    }

    // Sort by timestamp (Helius returns Unix seconds, convert to ms for comparison)
    const sortedTxs = transactions.sort((a: { timestamp: number }, b: { timestamp: number }) => 
      a.timestamp - b.timestamp
    );

    // Get the earliest transaction timestamp as reference (this is likely close to creation)
    const firstTxTimestamp = sortedTxs[0]?.timestamp * 1000; // Convert to ms
    
    // If creationTimestamp seems wrong (too far from first tx), use first tx as reference
    const referenceTime = Math.abs(creationTimestamp - firstTxTimestamp) < 600000 
      ? creationTimestamp 
      : firstTxTimestamp;

    // Analyze first transactions (within 60 seconds of first activity)
    const launchWindowEnd = referenceTime + 60000; // 60 seconds in ms
    const sniperWindowEnd = referenceTime + 300000; // 5 minutes in ms
    
    const launchTxs = sortedTxs.filter((tx: { timestamp: number }) => 
      tx.timestamp * 1000 <= launchWindowEnd
    );
    
    const sniperTxs = sortedTxs.filter((tx: { timestamp: number }) => 
      tx.timestamp * 1000 <= sniperWindowEnd
    );
    
    // Count unique wallets that bought early
    const earlyBuyers = new Set<string>();
    const sniperBuyers = new Set<string>();
    let totalEarlyBuySize = 0;
    
    for (const tx of launchTxs) {
      if (tx.type === 'SWAP' && tx.tokenTransfers?.length > 0) {
        const buyer = tx.feePayer || tx.source;
        if (buyer) {
          earlyBuyers.add(buyer);
          // Sum up SOL amounts (rough estimate)
          const solTransfer = tx.nativeTransfers?.find((t: { fromUserAccount: string }) => 
            t.fromUserAccount === buyer
          );
          if (solTransfer) {
            totalEarlyBuySize += (solTransfer.amount || 0) / 1e9;
          }
        }
      }
    }
    
    for (const tx of sniperTxs) {
      if (tx.type === 'SWAP') {
        const buyer = tx.feePayer || tx.source;
        if (buyer) sniperBuyers.add(buyer);
      }
    }

    // Check if same slot (bundled) - compare to first transaction's slot
    const firstTxSlot = sortedTxs[0]?.slot;
    const bundledCount = firstTxSlot 
      ? sortedTxs.filter((tx: { slot: number }) => tx.slot === firstTxSlot).length
      : 0;

    console.log(`🎯 Launch analysis for ${tokenMint.slice(0, 8)}: ${bundledCount} bundled, ${sniperBuyers.size} snipers (in first 5min)`);

    return {
      bundledBuys: bundledCount > 1 ? bundledCount : 0,
      sniperCount: sniperBuyers.size,
      firstBuyerHoldings: 0, // Would need holder check
      avgFirstBuySize: earlyBuyers.size > 0 ? totalEarlyBuySize / earlyBuyers.size : 0,
      creatorBoughtBack: false, // Would need creator wallet check
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Only log full error if it's not a timeout
    if (errorMessage.includes('timeout')) {
      console.warn(`Launch analysis timed out for ${tokenMint.slice(0, 8)}`);
    } else {
      console.warn(`Error analyzing launch for ${tokenMint.slice(0, 8)}: ${errorMessage}`);
    }
    return defaultResult;
  }
}

/**
 * Check if top holders are contracts (potential honeypot)
 */
export async function checkHolderWallets(
  holders: Array<{ address: string; percentage: number }>
): Promise<boolean> {
  const conn = getConnection();
  let contractCount = 0;
  
  // Check top 5 holders
  for (const holder of holders.slice(0, 5)) {
    try {
      const accountInfo = await conn.getAccountInfo(new PublicKey(holder.address));
      
      // If account has executable data or is owned by a program (not system), it's a contract
      if (accountInfo?.executable || 
          (accountInfo?.owner && !accountInfo.owner.equals(new PublicKey('11111111111111111111111111111111')))) {
        contractCount++;
      }
    } catch {
      // Skip errors
    }
  }
  
  // If more than 2 of top 5 are contracts, flag it
  return contractCount >= 2;
}

/**
 * Full security check
 * NOTE: For pump.fun graduated tokens, mint/freeze are ALWAYS revoked and LP is burned.
 * We verify on-chain but default to secure since pump.fun enforces this.
 */
export async function performSecurityCheck(
  tokenMint: string,
  holders: Array<{ address: string; percentage: number }>,
  isPumpFun: boolean = true // Default true since this monitor is for pump.fun tokens
): Promise<TokenSecurity> {
  // For pump.fun tokens, we know these are guaranteed:
  // - Mint authority is revoked (can't mint more)
  // - Freeze authority is revoked (can't freeze transfers)
  // - LP tokens are burned (100% locked forever)
  // We still verify on-chain but default to these values
  
  if (isPumpFun) {
    // Quick verification - check mint/freeze on-chain
    let mintRevoked = true;
    let freezeRevoked = true;
    
    try {
      const authorities = await checkTokenAuthorities(tokenMint);
      mintRevoked = authorities.mintAuthorityRevoked;
      freezeRevoked = authorities.freezeAuthorityRevoked;
      
      // If on-chain says not revoked, that's a red flag for a "fake" pump.fun token
      if (!mintRevoked || !freezeRevoked) {
        console.warn(`🚨 ${tokenMint.slice(0, 8)}: Claims to be pump.fun but authorities NOT revoked!`);
      }
    } catch {
      // If RPC fails, trust that pump.fun did its job
      mintRevoked = true;
      freezeRevoked = true;
    }
    
    // Check holder wallets (quick check)
    let holdersAreContracts = false;
    try {
      holdersAreContracts = await checkHolderWallets(holders);
    } catch {
      // Ignore errors
    }
    
    return {
      mintAuthorityRevoked: mintRevoked,
      freezeAuthorityRevoked: freezeRevoked,
      lpLocked: true, // Pump.fun burns LP tokens = 100% locked forever
      lpLockPercentage: 100, // LP is burned, not locked
      lpLockDuration: Infinity, // Forever (burned)
      isRugpullRisk: !mintRevoked || !freezeRevoked || holdersAreContracts,
      topHoldersAreContracts: holdersAreContracts,
    };
  }
  
  // Non-pump.fun tokens: full security check
  try {
    const [authorities, lpLock, holdersAreContracts] = await Promise.all([
      checkTokenAuthorities(tokenMint),
      checkLPLock(tokenMint),
      checkHolderWallets(holders),
    ]);

    const isRugpullRisk = 
      !authorities.mintAuthorityRevoked ||
      !authorities.freezeAuthorityRevoked ||
      (!lpLock.lpLocked && lpLock.lpLockPercentage < 50) ||
      holdersAreContracts;

    return {
      mintAuthorityRevoked: authorities.mintAuthorityRevoked,
      freezeAuthorityRevoked: authorities.freezeAuthorityRevoked,
      lpLocked: lpLock.lpLocked,
      lpLockPercentage: lpLock.lpLockPercentage,
      lpLockDuration: lpLock.lpLockDuration,
      isRugpullRisk,
      topHoldersAreContracts: holdersAreContracts,
    };
  } catch (error) {
    console.error(`Security check failed for ${tokenMint.slice(0, 8)}:`, error);
    return {
      mintAuthorityRevoked: false,
      freezeAuthorityRevoked: false,
      lpLocked: false,
      lpLockPercentage: 0,
      lpLockDuration: 0,
      isRugpullRisk: true,
      topHoldersAreContracts: false,
    };
  }
}
