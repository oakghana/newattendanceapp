import { NextRequest, NextResponse } from 'next/server'

// This endpoint should be called by a cron job service (e.g., Vercel Crons, external scheduler)
// to run daily and check for missing check-ins and send pre-resumption alerts

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from an authorized cron service
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Step 1: Send pre-resumption alerts (2-week and 1-week reminders)
    console.log('[v0] Running pre-resumption alert check...')
    const alertsResponse = await fetch(`${appUrl}/api/leave/resumption/send-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_pre_resumption_alerts' })
    })

    const alertsData = await alertsResponse.json()
    console.log('[v0] Pre-resumption alerts sent:', alertsData)

    // Step 2: Check for missing check-ins (on or after resumption date with no check-in)
    console.log('[v0] Running missing check-in detection...')
    const missingCheckInsResponse = await fetch(`${appUrl}/api/leave/resumption/check-missing-checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_missing_checkins' })
    })

    const missingCheckInData = await missingCheckInsResponse.json()
    console.log('[v0] Missing check-in alerts processed:', missingCheckInData)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      preResumptionAlerts: alertsData,
      missingCheckIns: missingCheckInData,
      message: 'Cron job completed successfully'
    })
  } catch (error) {
    console.error('[v0] Cron job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'leave-resumption-cron',
    timestamp: new Date().toISOString()
  })
}
