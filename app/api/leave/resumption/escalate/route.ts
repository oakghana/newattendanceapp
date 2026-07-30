import { checkAndEscalateNonResumption } from '@/lib/leave-resumption-service'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Scheduled API endpoint for escalation workflow
 * Call via Vercel Cron or external scheduler (e.g., EasyCron)
 * Add to vercel.json crons: { "schedule": "0 9 * * *" }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || 'default-secret'

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid cron secret' },
        { status: 401 }
      )
    }

    // Run the escalation check
    await checkAndEscalateNonResumption()

    return NextResponse.json({
      success: true,
      message: 'Non-resumption escalation check completed',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[v0] Escalation error:', error)
    return NextResponse.json(
      { error: 'Failed to process escalation' },
      { status: 500 }
    )
  }
}

/**
 * Manual trigger endpoint for testing
 * POST with cron_secret in body to trigger escalation
 */
export async function GET(request: NextRequest) {
  try {
    const cron_secret = request.nextUrl.searchParams.get('secret')
    const expectedSecret = process.env.CRON_SECRET || 'default-secret'

    if (cron_secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid secret' },
        { status: 401 }
      )
    }

    await checkAndEscalateNonResumption()

    return NextResponse.json({
      success: true,
      message: 'Escalation triggered successfully',
    })
  } catch (error) {
    console.error('[v0] Manual escalation error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger escalation' },
      { status: 500 }
    )
  }
}
