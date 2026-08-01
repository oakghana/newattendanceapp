import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, AlertCircle, Plus, Link2 } from 'lucide-react'

interface HODLink {
  id: string
  name: string
  employee_id: string
  role: string
  department: string
}

interface ManageHODLinkagesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffMember: {
    id: string
    first_name: string
    last_name: string
    email: string
  } | null
  currentLinks: HODLink[]
  availableHODs: HODLink[]
  onAddLink: (hodId: string) => Promise<void>
  onRemoveLink: (hodId: string) => Promise<void>
  loading?: boolean
}

export function ManageHODLinkagesModal({
  open,
  onOpenChange,
  staffMember,
  currentLinks,
  availableHODs,
  onAddLink,
  onRemoveLink,
  loading = false,
}: ManageHODLinkagesModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHods, setSelectedHods] = useState<string[]>([])
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [removeWarning, setRemoveWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemoveLink = async (hodId: string) => {
    try {
      setIsRemoving(hodId)
      setError(null)
      await onRemoveLink(hodId)
      setRemoveWarning(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsRemoving(null)
    }
  }

  const handleAddMultipleLinks = async () => {
    if (selectedHods.length === 0) return
    try {
      setError(null)
      for (const hodId of selectedHods) {
        await onAddLink(hodId)
      }
      setSelectedHods([])
    } catch (err) {
      setError(String(err))
    }
  }

  const filteredAvailable = availableHODs.filter((h) =>
    searchQuery === '' ||
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.employee_id.includes(searchQuery) ||
    h.department.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Manage HOD Linkages
          </DialogTitle>
          <DialogDescription>
            {staffMember && (
              <>
                Manage Department Head and Regional Manager assignments for{' '}
                <strong>
                  {staffMember.first_name} {staffMember.last_name}
                </strong>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="current" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current">
                Currently Linked ({currentLinks.length})
              </TabsTrigger>
              <TabsTrigger value="add">
                Add More
              </TabsTrigger>
            </TabsList>

            {/* Currently Linked HODs Tab */}
            <TabsContent value="current" className="space-y-3">
              {currentLinks.length === 0 ? (
                <div className="p-4 border rounded-lg text-center text-muted-foreground">
                  <p className="text-sm">No HOD linkages found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Switch to "Add More" tab to link this staff to a HOD
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentLinks.map((hod) => (
                    <div
                      key={hod.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{hod.name || 'Unknown HOD'}</div>
                        <div className="text-sm text-muted-foreground">
                          {hod.employee_id && `ID: ${hod.employee_id} • `}
                          {hod.role?.replace('_', ' ') || 'Unknown'} 
                          {hod.department && ` • ${hod.department}`}
                        </div>
                      </div>
                      <Badge variant="secondary" className="mr-3">
                        Active
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:border-destructive/20"
                        onClick={() => setRemoveWarning(hod.id)}
                        disabled={isRemoving === hod.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Remove Warning Dialog */}
                  {removeWarning && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="mt-2">
                        <p className="font-semibold mb-3">
                          Remove this HOD linkage?
                        </p>
                        <p className="text-sm mb-3">
                          All pending requests will be withdrawn and reassigned to remaining linked HODs (if any).
                          This action cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveLink(removeWarning)}
                            disabled={isRemoving !== null}
                          >
                            {isRemoving === removeWarning ? 'Removing...' : 'Yes, Remove'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRemoveWarning(null)}
                            disabled={isRemoving !== null}
                          >
                            Cancel
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Add More HODs Tab */}
            <TabsContent value="add" className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="search-hods">Search HOD / Regional Manager</Label>
                <Input
                  id="search-hods"
                  placeholder="Search by name, staff ID, or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Found {filteredAvailable.length} HODs
                </p>
              </div>

              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {filteredAvailable.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    {searchQuery ? 'No matching HODs found' : 'No additional HODs available'}
                  </p>
                ) : (
                  filteredAvailable.map((hod) => (
                    <div key={hod.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                      <input
                        type="checkbox"
                        id={`hod-${hod.id}`}
                        checked={selectedHods.includes(hod.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedHods([...selectedHods, hod.id])
                          } else {
                            setSelectedHods(selectedHods.filter((id) => id !== hod.id))
                          }
                        }}
                        className="h-4 w-4 rounded"
                      />
                      <label htmlFor={`hod-${hod.id}`} className="flex-1 cursor-pointer text-sm">
                        <div className="font-medium">{hod.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {hod.employee_id} • {hod.role.replace('_', ' ')} • {hod.department}
                        </div>
                      </label>
                    </div>
                  ))
                )}
              </div>

              {selectedHods.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedHods.length} HOD(s)
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {selectedHods.length > 0 && (
            <Button
              onClick={handleAddMultipleLinks}
              disabled={loading}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {loading ? 'Adding...' : `Add ${selectedHods.length} HOD(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
