import { NextRequest, NextResponse } from 'next/server';
import { getTokenMonitorService } from '@/services/token-monitor.service';

// Start the monitor when server starts
let monitorStarted = false;

async function ensureMonitorStarted() {
  if (!monitorStarted) {
    try {
      const monitor = getTokenMonitorService();
      await monitor.start();
      monitorStarted = true;
    } catch (error) {
      console.error('Failed to start monitor:', error);
    }
  }
}

export async function GET(request: NextRequest) {
  // Ensure monitor is running
  await ensureMonitorStarted();
  
  const { searchParams } = new URL(request.url);
  const onlyPassed = searchParams.get('passed') !== 'false';
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const monitor = getTokenMonitorService();
    const tokens = monitor.getTokens(onlyPassed).slice(0, limit);
    const stats = monitor.getStats();

    return NextResponse.json({
      success: true,
      data: {
        tokens,
        stats,
        count: tokens.length,
        isConnected: monitor.isConnected,
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
