import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

interface DeleteLeaveRequestOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useDeleteLeaveRequest(options: DeleteLeaveRequestOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const { toast } = useToast()

  const deleteRequest = async (requestId: string, staffName?: string) => {
    try {
      setIsLoading(true)

      console.log(`[v0] Deleting leave request: ${requestId}`)

      const response = await fetch(`/api/leave/delete-request?id=${requestId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete leave request')
      }

      const result = await response.json()

      toast({
        title: 'Leave request deleted',
        description: `Successfully deleted leave request for ${staffName || 'staff member'}. All related records have been removed from the database.`,
        variant: 'default',
      })

      if (options.onSuccess) {
        options.onSuccess()
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('[v0] Error deleting leave request:', errorMessage)

      toast({
        title: 'Delete failed',
        description: errorMessage,
        variant: 'destructive',
      })

      if (options.onError) {
        options.onError(errorMessage)
      }

      throw error
    } finally {
      setIsLoading(false)
      setIsConfirming(false)
    }
  }

  const confirmAndDelete = (requestId: string, staffName?: string) => {
    // Return a function that shows confirmation and then deletes
    return {
      isConfirming,
      setIsConfirming,
      deleteRequest: () => deleteRequest(requestId, staffName),
    }
  }

  return {
    deleteRequest,
    confirmAndDelete,
    isLoading,
    isConfirming,
    setIsConfirming,
  }
}
