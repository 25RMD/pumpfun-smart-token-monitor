import axios from 'axios';
import { Transaction, TransactionType } from '@/types';

const HELIUS_BASE_URL = 'https://api.helius.xyz';

/**
 * Fetches transaction history for a token address using Helius
 */
export async function fetchTransactionHistory(
  tokenAddress: string,
  limit: number = 100
): Promise<Transaction[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  
  if (!apiKey) {
    console.warn('HELIUS_API_KEY not configured');
    return [];
  }

  try {
    const response = await axios.get(
      `${HELIUS_BASE_URL}/v0/addresses/${tokenAddress}/transactions`,
      {
        params: {
          'api-key': apiKey,
          limit,
        },
      }
    );

    const transactions = response.data || [];

    return transactions.map((tx: HeliusTransaction) => {
      const type = mapHeliusType(tx.type);
      const tokenTransfer = tx.tokenTransfers?.[0];
      
      return {
        signature: tx.signature,
        timestamp: tx.timestamp * 1000, // Convert to milliseconds
        type,
        source: tx.feePayer,
        feePayer: tx.feePayer,
        amount: tokenTransfer?.tokenAmount || 0,
        toUserAccount: tokenTransfer?.toUserAccount,
        fromUserAccount: tokenTransfer?.fromUserAccount,
      };
    });
  } catch (error) {
    console.error(`Error fetching transactions from Helius for ${tokenAddress}:`, error);
    return [];
  }
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  feePayer: string;
  tokenTransfers?: Array<{
    mint: string;
    tokenAmount: number;
    fromUserAccount?: string;
    toUserAccount?: string;
  }>;
}

function mapHeliusType(heliusType: string): TransactionType {
  const typeMap: Record<string, TransactionType> = {
    SWAP: 'SWAP',
    TRANSFER: 'TRANSFER',
    BUY: 'BUY',
    SELL: 'SELL',
  };
  
  return typeMap[heliusType.toUpperCase()] || 'TRANSFER';
}

/**
 * Fetches enhanced transaction data for specific signatures
 */
export async function fetchEnhancedTransactions(
  signatures: string[]
): Promise<Transaction[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  
  if (!apiKey || signatures.length === 0) {
    return [];
  }

  try {
    const response = await axios.post(
      `${HELIUS_BASE_URL}/v0/transactions`,
      { transactions: signatures },
      {
        params: { 'api-key': apiKey },
      }
    );

    return response.data.map((tx: HeliusTransaction) => ({
      signature: tx.signature,
      timestamp: tx.timestamp * 1000,
      type: mapHeliusType(tx.type),
      source: tx.feePayer,
      feePayer: tx.feePayer,
      amount: tx.tokenTransfers?.[0]?.tokenAmount || 0,
      toUserAccount: tx.tokenTransfers?.[0]?.toUserAccount,
      fromUserAccount: tx.tokenTransfers?.[0]?.fromUserAccount,
    }));
  } catch (error) {
    console.error('Error fetching enhanced transactions:', error);
    return [];
  }
}

/**
 * Get token holders using Helius DAS API
 */
export async function fetchTokenHolders(tokenAddress: string): Promise<Array<{
  address: string;
  amount: number;
}>> {
  const apiKey = process.env.HELIUS_API_KEY;
  
  if (!apiKey) {
    return [];
  }

  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        jsonrpc: '2.0',
        id: 'holders-query',
        method: 'getTokenLargestAccounts',
        params: [tokenAddress],
      }
    );

    const accounts = response.data?.result?.value || [];
    
    return accounts.map((account: { address: string; amount: string; decimals: number }) => ({
      address: account.address,
      amount: parseFloat(account.amount) / Math.pow(10, account.decimals || 6),
    }));
  } catch (error) {
    console.error(`Error fetching token holders from Helius for ${tokenAddress}:`, error);
    return [];
  }
}

/**
 * Get developer wallet holdings
 */
export async function fetchDeveloperHoldings(
  tokenMint: string,
  developerWallet: string
): Promise<number> {
  const apiKey = process.env.HELIUS_API_KEY;
  
  if (!apiKey || !developerWallet) {
    return 0;
  }

  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        jsonrpc: '2.0',
        id: 'dev-holdings',
        method: 'getTokenAccountsByOwner',
        params: [
          developerWallet,
          { mint: tokenMint },
          { encoding: 'jsonParsed' }
        ],
      }
    );

    const accounts = response.data?.result?.value || [];
    
    if (accounts.length > 0) {
      const tokenAccount = accounts[0];
      return parseFloat(
        tokenAccount.account.data.parsed.info.tokenAmount.uiAmount || '0'
      );
    }
    
    return 0;
  } catch (error) {
    console.warn(`Error fetching dev holdings for ${developerWallet}:`, error);
    return 0;
  }
}
