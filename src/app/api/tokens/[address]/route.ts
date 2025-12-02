import { NextResponse } from 'next/server';
import { getTokenByAddress } from '@/services/token-processor.service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  try {
    const token = getTokenByAddress(address);

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: token,
    });
  } catch (error) {
    console.error('Error fetching token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch token',
      },
      { status: 500 }
    );
  }
}
