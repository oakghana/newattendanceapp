import { NextRequest, NextResponse } from 'next/server'
import {
  createCarryoverRequests,
  processForfeitureForDeadline,
  getCarryoverSummary,
} from '@/lib/carryover-workflow'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, leaveYear, forfeitureDate } = body

    // Validate inputs
    if (!action || !leaveYear) {
      return NextResponse.json(
        { error: 'action and leaveYear are required' },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'create_requests':
        result = await createCarryoverRequests(leaveYear)
        break

      case 'process_forfeiture':
        if (!forfeitureDate) {
          return NextResponse.json(
            { error: 'forfeitureDate is required for forfeiture processing' },
            { status: 400 }
          )
        }
        result = await processForfeitureForDeadline(leaveYear, new Date(forfeitureDate))
        break

      case 'get_summary':
        result = await getCarryoverSummary(leaveYear)
        break

      default:
        return NextResponse.json(
          { error: 'Unknown action. Valid actions: create_requests, process_forfeiture, get_summary' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[v0] Carryover workflow error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process carryover workflow' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/leave/carryover/workflow',
    actions: [
      {
        name: 'create_requests',
        description: 'Create pending carryover requests for all staff at end of leave year',
        body: { action: 'create_requests', leaveYear: '2025/2026' },
      },
      {
        name: 'process_forfeiture',
        description: 'Auto-forfeit pending carryover requests past deadline',
        body: { action: 'process_forfeiture', leaveYear: '2025/2026', forfeitureDate: '2026-05-31' },
      },
      {
        name: 'get_summary',
        description: 'Get carryover summary statistics',
        body: { action: 'get_summary', leaveYear: '2025/2026' },
      },
    ],
  })
}
