'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Send,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  Timeline,
  TimelineItem,
  TimelineConnector,
  TimelineHeader,
  TimelineTitle,
  TimelineDescription,
  TimelineIcon,
} from '@/components/ui/timeline'

interface AuditEntry {
  id: string
  fd_review_id: string
  action_by_user_id: string
  action_type: 'viewed' | 'submitted' | 'approved' | 'rejected' | 'forwarded'
  action_timestamp: string
  ip_address?: string
  user_agent?: string
  notes?: string
}

interface FDAuditLogProps {
  fdReviewId: string
}

export function FDAuditLog({ fdReviewId }: FDAuditLogProps) {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchAuditLog()
  }, [fdReviewId])

  const fetchAuditLog = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/loan/fd-review/${fdReviewId}/audit`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch audit log')
      }

      const data = await response.json()
      setAuditLog(data.audit || [])
    } catch (error) {
      console.error('[v0] Audit log fetch error:', error)
      toast({
        title: 'Error',
        description: 'Failed to load audit log',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'submitted':
        return <Send className="h-5 w-5 text-blue-500" />
      case 'approved':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'viewed':
        return <Eye className="h-5 w-5 text-gray-500" />
      case 'forwarded':
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      default:
        return <FileText className="h-5 w-5 text-gray-500" />
    }
  }

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case 'submitted':
        return 'Submitted'
      case 'approved':
        return 'Approved'
      case 'rejected':
        return 'Rejected'
      case 'viewed':
        return 'Viewed'
      case 'forwarded':
        return 'Forwarded to HR'
      default:
        return actionType
    }
  }

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'submitted':
        return 'bg-blue-50 border-blue-200'
      case 'approved':
        return 'bg-green-50 border-green-200'
      case 'rejected':
        return 'bg-red-50 border-red-200'
      case 'viewed':
        return 'bg-gray-50 border-gray-200'
      case 'forwarded':
        return 'bg-amber-50 border-amber-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading audit log...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gray-600" />
          FD Request History
        </CardTitle>
        <CardDescription>
          Timeline of all actions taken on this FD request
        </CardDescription>
      </CardHeader>
      <CardContent>
        {auditLog.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No audit history available
          </div>
        ) : (
          <div className="space-y-4">
            {auditLog.map((entry, index) => (
              <div
                key={entry.id}
                className={`p-4 rounded-lg border ${getActionColor(entry.action_type)} transition-colors`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {getActionIcon(entry.action_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {getActionLabel(entry.action_type)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          Action {index + 1}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatDate(entry.action_timestamp)}
                      </p>
                      {entry.notes && (
                        <p className="text-sm text-gray-700 mt-2 italic">
                          {entry.notes}
                        </p>
                      )}
                      {entry.ip_address && (
                        <p className="text-xs text-gray-500 mt-1">
                          IP: {entry.ip_address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
