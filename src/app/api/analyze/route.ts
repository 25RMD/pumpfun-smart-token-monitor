import { NextResponse } from 'next/server';
import { processNewMigration } from '@/services/token-processor.service';
import { MigrationEvent } from '@/types';

// Analyze a token manually
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tokenAddress, creator } = body;

    if (!tokenAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token address is required',
        },
        { status: 400 }
      );
    }

    // Create a mock migration event
    const event: MigrationEvent = {
      txType: 'migration',
      signature: 'manual-analysis',
      mint: tokenAddress,
      timestamp: Date.now(),
      marketCap: 0,
      liquidity: 0,
      creator: creator || undefined,
    };

    const result = await processNewMigration(event);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to analyze token',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error analyzing token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze token',
      },
      { status: 500 }
    );
  }
}
