'use client'

import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc' | null

export interface ColumnDef<T> {
  /** Unique key for the column */
  key: string
  /** Display label for the header */
  label: string
  /** Extract value from row for sorting/filtering */
  getValue: (row: T) => string | number | Date | null | undefined
  /** Optional: custom render for the cell */
  render?: (row: T, value: any) => React.ReactNode
  /** Optional: allow sorting this column (default: true) */
  sortable?: boolean
  /** Optional: allow filtering this column (default: true) */
  filterable?: boolean
  /** Optional: custom filter function (default: case-insensitive string match) */
  filterFn?: (value: any, filterText: string) => boolean
  /** Optional: custom sort comparator */
  compareFn?: (a: any, b: any) => number
  /** Optional: CSS class for the cell */
  className?: string
}

interface SortableTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  rowKey: (row: T) => string | number
  /** Optional: render custom row content */
  renderRow?: (row: T) => React.ReactNode
  /** Optional: show global search field */
  showGlobalSearch?: boolean
  /** Optional: global search placeholder */
  searchPlaceholder?: string
  /** Optional: custom container class */
  containerClassName?: string
  /** Optional: custom table class */
  tableClassName?: string
  /** Optional: return inline style for each row */
  getRowStyle?: (row: T) => React.CSSProperties | undefined
}

interface FilterState {
  [columnKey: string]: string
}

export function SortableTable<T>({
  data,
  columns,
  rowKey,
  renderRow,
  showGlobalSearch = true,
  searchPlaceholder = 'Search...',
  containerClassName,
  tableClassName,
  getRowStyle,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [columnFilters, setColumnFilters] = useState<FilterState>({})
  const [globalSearch, setGlobalSearch] = useState('')

  // Apply sorting and filtering
  const processedData = useMemo(() => {
    let result = [...data]

    // Apply column-level filters
    result = result.filter((row) => {
      return columns.every((col) => {
        if (!col.filterable || !columnFilters[col.key]) return true

        const value = col.getValue(row)
        const filterText = columnFilters[col.key]

        if (col.filterFn) {
          return col.filterFn(value, filterText)
        }

        // Default: case-insensitive string match
        const strValue = String(value || '').toLowerCase()
        return strValue.includes(filterText.toLowerCase())
      })
    })

    // Apply global search
    if (globalSearch) {
      result = result.filter((row) => {
        return columns.some((col) => {
          const value = col.getValue(row)
          const strValue = String(value || '').toLowerCase()
          return strValue.includes(globalSearch.toLowerCase())
        })
      })
    }

    // Apply sorting
    if (sortKey && sortDirection) {
      const column = columns.find((c) => c.key === sortKey)
      if (column) {
        result.sort((a, b) => {
          const aVal = column.getValue(a)
          const bVal = column.getValue(b)

          if (column.compareFn) {
            return sortDirection === 'asc'
              ? column.compareFn(aVal, bVal)
              : column.compareFn(bVal, aVal)
          }

          // Default comparator
          if (aVal == null && bVal == null) return 0
          if (aVal == null) return 1
          if (bVal == null) return -1

          if (aVal instanceof Date && bVal instanceof Date) {
            const cmp = aVal.getTime() - bVal.getTime()
            return sortDirection === 'asc' ? cmp : -cmp
          }

          const cmp = String(aVal).localeCompare(String(bVal))
          return sortDirection === 'asc' ? cmp : -cmp
        })
      }
    }

    return result
  }, [data, columns, columnFilters, globalSearch, sortKey, sortDirection])

  const handleSort = (columnKey: string) => {
    const column = columns.find((c) => c.key === columnKey)
    if (!column?.sortable) return

    if (sortKey === columnKey) {
      // Cycle through: asc → desc → null
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortKey(null)
      }
    } else {
      setSortKey(columnKey)
      setSortDirection('asc')
    }
  }

  const handleColumnFilterChange = (columnKey: string, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [columnKey]: value,
    }))
  }

  const clearAllFilters = () => {
    setColumnFilters({})
    setGlobalSearch('')
    setSortKey(null)
    setSortDirection(null)
  }

  const hasActiveFilters =
    Object.values(columnFilters).some((v) => v) || globalSearch || sortKey

  return (
    <div className={cn('w-full space-y-3', containerClassName)}>
      {/* Global Search + Clear Filters */}
      <div className="flex items-center gap-2">
        {showGlobalSearch && (
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={searchPlaceholder}
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllFilters}
            className="whitespace-nowrap"
          >
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="relative w-full overflow-x-auto rounded-lg border border-slate-200">
        <table
          className={cn(
            'w-full caption-bottom text-sm bg-white',
            tableClassName
          )}
        >
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left align-middle font-semibold text-slate-700 whitespace-nowrap',
                    column.className,
                    column.sortable && 'cursor-pointer hover:bg-slate-100 transition-colors'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => column.sortable && handleSort(column.key)}
                      className="flex items-center gap-1 flex-1"
                    >
                      <span>{column.label}</span>
                      {sortKey === column.key && sortDirection && (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 text-blue-600" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-blue-600" />
                        )
                      )}
                    </div>
                  </div>
                  {column.filterable && (
                    <Input
                      placeholder={`Filter ${column.label.toLowerCase()}...`}
                      value={columnFilters[column.key] || ''}
                      onChange={(e) =>
                        handleColumnFilterChange(column.key, e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 h-8 text-xs"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {processedData.length > 0 ? (
              processedData.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="transition-colors"
                  style={getRowStyle ? getRowStyle(row) : undefined}
                >
                  {renderRow ? (
                    <td colSpan={columns.length}>{renderRow(row)}</td>
                  ) : (
                    columns.map((column) => {
                      const value = column.getValue(row)
                      return (
                        <td
                          key={`${rowKey(row)}-${column.key}`}
                          className={cn('px-4 py-3 align-middle', column.className)}
                        >
                          {column.render ? column.render(row, value) : String(value || '—')}
                        </td>
                      )
                    })
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  No results found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Results count */}
      <div className="text-xs text-slate-500">
        Showing {processedData.length} of {data.length} result{data.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
