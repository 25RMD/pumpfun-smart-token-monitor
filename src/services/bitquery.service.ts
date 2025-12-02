import axios from 'axios';
import { Holder, Transaction, TransactionType } from '@/types';

const BITQUERY_URL = 'https://streaming.bitquery.io/graphql';

const bitqueryClient = axios.create({
  baseURL: BITQUERY_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BITQUERY_API_KEY || ''}`,
  },
});

/**
 * Fetches holder distribution for a token using Bitquery
 */
export async function fetchHolderDistribution(tokenAddress: string): Promise<Holder[]> {
  const query = `
    query GetTokenHolders($tokenAddress: String!) {
      Solana {
        BalanceUpdates(
          where: {
            Currency: {MintAddress: {is: $tokenAddress}}
            Balance: {Amount: {gt: "0"}}
          }
          orderBy: {descendingByField: "Balance_Amount"}
          limit: {count: 100}
        ) {
          BalanceUpdate {
            Account {
              Address
            }
            Amount
          }
        }
      }
    }
  `;

  try {
    const response = await bitqueryClient.post('', {
      query,
      variables: { tokenAddress },
    });

    const updates = response.data?.data?.Solana?.BalanceUpdates || [];
    
    // Calculate total supply from holders
    const totalAmount = updates.reduce(
      (sum: number, update: { BalanceUpdate: { Amount: string } }) => 
        sum + parseFloat(update.BalanceUpdate.Amount || '0'),
      0
    );

    return updates.map((update: { 
      BalanceUpdate: { 
        Account: { Address: string }; 
        Amount: string 
      } 
    }) => ({
      address: update.BalanceUpdate.Account.Address,
      amount: parseFloat(update.BalanceUpdate.Amount || '0'),
      percentage: totalAmount > 0 
        ? (parseFloat(update.BalanceUpdate.Amount || '0') / totalAmount) * 100 
        : 0,
    }));
  } catch (error) {
    console.error(`Error fetching holders for ${tokenAddress}:`, error);
    // Return empty array on error, will use fallback
    return [];
  }
}

/**
 * Fetches recent transactions for a token using Bitquery
 */
export async function fetchTokenTransactions(tokenAddress: string): Promise<Transaction[]> {
  const query = `
    query GetTokenTransactions($tokenAddress: String!) {
      Solana {
        Transfers(
          where: {
            Currency: {MintAddress: {is: $tokenAddress}}
          }
          orderBy: {descending: Block_Time}
          limit: {count: 200}
        ) {
          Transfer {
            Sender
            Receiver
            Amount
            Currency {
              Symbol
            }
          }
          Block {
            Time
          }
          Transaction {
            Signature
            FeePayer
          }
        }
      }
    }
  `;

  try {
    const response = await bitqueryClient.post('', {
      query,
      variables: { tokenAddress },
    });

    const transfers = response.data?.data?.Solana?.Transfers || [];

    return transfers.map((tx: {
      Transfer: { Sender: string; Receiver: string; Amount: string };
      Block: { Time: string };
      Transaction: { Signature: string; FeePayer: string };
    }, index: number) => {
      // Determine transaction type based on sender/receiver patterns
      let type: TransactionType = 'TRANSFER';
      
      // Simple heuristic: if sender is a known DEX pool, it's a BUY
      // if receiver is a known DEX pool, it's a SELL
      // This is simplified - in production you'd check against known pool addresses
      const amount = parseFloat(tx.Transfer.Amount || '0');
      
      return {
        signature: tx.Transaction.Signature || `tx-${index}`,
        timestamp: new Date(tx.Block.Time).getTime(),
        type,
        source: tx.Transfer.Sender,
        feePayer: tx.Transaction.FeePayer,
        amount,
        toUserAccount: tx.Transfer.Receiver,
        fromUserAccount: tx.Transfer.Sender,
      };
    });
  } catch (error) {
    console.error(`Error fetching transactions for ${tokenAddress}:`, error);
    return [];
  }
}

/**
 * Fetches trading statistics using Bitquery
 */
export async function fetchTradingStats(tokenAddress: string): Promise<{
  volume24h: number;
  trades24h: number;
  uniqueTraders: number;
}> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const query = `
    query GetTradingStats($tokenAddress: String!, $since: DateTime!) {
      Solana {
        DEXTradeByTokens(
          where: {
            Trade: {
              Currency: {MintAddress: {is: $tokenAddress}}
            }
            Block: {Time: {after: $since}}
          }
        ) {
          Trade {
            AmountInUSD
            Account {
              Address
            }
          }
          count
        }
      }
    }
  `;

  try {
    const response = await bitqueryClient.post('', {
      query,
      variables: { tokenAddress, since: yesterday },
    });

    const trades = response.data?.data?.Solana?.DEXTradeByTokens || [];
    
    const uniqueTraders = new Set(
      trades.map((t: { Trade: { Account: { Address: string } } }) => 
        t.Trade.Account.Address
      )
    ).size;

    const volume24h = trades.reduce(
      (sum: number, t: { Trade: { AmountInUSD: number } }) => 
        sum + (t.Trade.AmountInUSD || 0),
      0
    );

    return {
      volume24h,
      trades24h: trades.length,
      uniqueTraders,
    };
  } catch (error) {
    console.warn(`Error fetching trading stats for ${tokenAddress}`);
    return {
      volume24h: 0,
      trades24h: 0,
      uniqueTraders: 0,
    };
  }
}
