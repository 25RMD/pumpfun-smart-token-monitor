// Test script to verify holder count fetching
import { config } from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';

// Load .env.local
config({ path: '.env.local' });

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
console.log('HELIUS_API_KEY loaded:', HELIUS_API_KEY ? `${HELIUS_API_KEY.slice(0, 8)}...` : 'NOT FOUND');

// Test token (a known pump.fun graduated token)
const TEST_TOKEN = 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC';

async function testHeliusHolderCount(tokenMint) {
  if (!HELIUS_API_KEY) {
    console.log('❌ No Helius API key');
    return null;
  }
  
  console.log(`\n📊 Testing Helius DAS API for ${tokenMint.slice(0, 8)}...`);
  
  try {
    const response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'holder-count',
          method: 'getTokenAccounts',
          params: {
            mint: tokenMint,
            limit: 1,
            options: { showZeroBalance: false }
          }
        })
      }
    );

    const data = await response.json();
    console.log('Helius response:', JSON.stringify(data, null, 2).slice(0, 500));
    
    if (data.result?.total) {
      console.log(`✅ Helius holder count: ${data.result.total}`);
      return data.result.total;
    }
    
    if (data.error) {
      console.log('❌ Helius error:', data.error);
    }
    
    return null;
  } catch (e) {
    console.log('❌ Helius request failed:', e.message);
    return null;
  }
}

async function testSolscanHolderCount(tokenMint) {
  console.log(`\n📊 Testing Solscan API for ${tokenMint.slice(0, 8)}...`);
  
  try {
    const response = await fetch(
      `https://api-v2.solscan.io/v2/token/holders?address=${tokenMint}&page=1&page_size=1`,
      { 
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        } 
      }
    );

    const data = await response.json();
    console.log('Solscan response:', JSON.stringify(data, null, 2).slice(0, 500));
    
    if (data.data?.total) {
      console.log(`✅ Solscan holder count: ${data.data.total}`);
      return data.data.total;
    }
    
    return null;
  } catch (e) {
    console.log('❌ Solscan request failed:', e.message);
    return null;
  }
}

async function testRpcEstimate(tokenMint) {
  console.log(`\n📊 Testing RPC estimate for ${tokenMint.slice(0, 8)}...`);
  
  const rpcUrl = HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';
  
  console.log(`Using RPC: ${HELIUS_API_KEY ? 'Helius' : 'Public'}`);
  
  try {
    const conn = new Connection(rpcUrl, 'confirmed');
    const mintPubkey = new PublicKey(tokenMint);
    
    const supply = await conn.getTokenSupply(mintPubkey);
    console.log('Token supply:', supply.value.uiAmountString);
    
    const largestAccounts = await conn.getTokenLargestAccounts(mintPubkey);
    console.log(`Found ${largestAccounts.value.length} largest accounts`);
    
    if (largestAccounts.value.length > 0) {
      const totalAmount = largestAccounts.value.reduce(
        (sum, acc) => sum + parseFloat(acc.uiAmountString || '0'), 
        0
      );
      const totalSupply = parseFloat(supply.value.uiAmountString || '0');
      
      if (totalSupply > 0) {
        const top20Percentage = (totalAmount / totalSupply) * 100;
        console.log(`Top ${largestAccounts.value.length} accounts hold ${top20Percentage.toFixed(1)}% of supply`);
        
        // Show top 5 holders
        console.log('\nTop 5 holders:');
        for (let i = 0; i < Math.min(5, largestAccounts.value.length); i++) {
          const acc = largestAccounts.value[i];
          const pct = totalSupply > 0 ? (parseFloat(acc.uiAmountString || '0') / totalSupply * 100).toFixed(2) : 0;
          console.log(`  ${i+1}. ${acc.address.toBase58().slice(0, 8)}... - ${pct}%`);
        }
        
        // Estimate
        let estimatedHolders;
        if (top20Percentage >= 90) {
          estimatedHolders = Math.max(20, Math.round(20 / (top20Percentage / 100)));
        } else if (top20Percentage >= 70) {
          estimatedHolders = Math.round(50 / (top20Percentage / 100));
        } else if (top20Percentage >= 50) {
          estimatedHolders = Math.round(100 / (top20Percentage / 100));
        } else {
          estimatedHolders = Math.round(200 / (top20Percentage / 100));
        }
        
        console.log(`\n✅ Estimated holder count: ${estimatedHolders}`);
        return estimatedHolders;
      }
    }
    
    return largestAccounts.value.length;
  } catch (e) {
    console.log('❌ RPC request failed:', e.message);
    return null;
  }
}

async function main() {
  console.log('=== Holder Count Test ===\n');
  
  // Test all methods
  const heliusCount = await testHeliusHolderCount(TEST_TOKEN);
  const solscanCount = await testSolscanHolderCount(TEST_TOKEN);
  const rpcCount = await testRpcEstimate(TEST_TOKEN);
  
  console.log('\n=== Summary ===');
  console.log(`Helius: ${heliusCount ?? 'failed'}`);
  console.log(`Solscan: ${solscanCount ?? 'failed'}`);
  console.log(`RPC Estimate: ${rpcCount ?? 'failed'}`);
}

main().catch(console.error);
