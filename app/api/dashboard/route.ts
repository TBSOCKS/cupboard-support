import { NextResponse } from 'next/server';
import {
  getHeadlineNumbers,
  getVolumeByIntent,
  getDeflectionByAgent,
  getEscalationReasons,
  getDurationByAgent,
  getToolCallStats,
  getDeflectionOpportunities,
} from '@/lib/dashboard/queries';

export const runtime = 'nodejs';
export const revalidate = 300; // cache for 5 min - dashboard doesn't need second-by-second freshness

export async function GET() {
  try {
    const [
      headline,
      volume,
      deflection,
      escalation,
      duration,
      tools,
      opportunities,
    ] = await Promise.all([
      getHeadlineNumbers(),
      getVolumeByIntent(),
      getDeflectionByAgent(),
      getEscalationReasons(),
      getDurationByAgent(),
      getToolCallStats(),
      getDeflectionOpportunities(),
    ]);

    return NextResponse.json({
      headline,
      volume,
      deflection,
      escalation,
      duration,
      tools,
      opportunities,
    });
  } catch (err) {
    console.error('Dashboard API error', err);
    return NextResponse.json(
      { error: 'Failed to load dashboard data', detail: String(err) },
      { status: 500 }
    );
  }
}
