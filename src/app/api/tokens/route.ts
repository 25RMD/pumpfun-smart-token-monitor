import { NextResponse } from 'next/server';
import { getProcessedTokens, getStats } from '@/services/token-processor.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const onlyPassed = searchParams.get('passed') === 'true';

  try {
    const tokens = getProcessedTokens(onlyPassed);
    const stats = getStats();

    return NextResponse.json({
      success: true,
      data: {
        tokens,
        stats,
        count: tokens.length,
      },
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch tokens',
      },
      { status: 500 }
    );
  }
}
