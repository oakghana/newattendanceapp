/**
 * Table virtualization utilities for rendering large datasets efficiently
 * Implements window scrolling pattern - only renders visible rows
 */

export interface VirtualTableConfig {
  itemHeight: number
  containerHeight: number
  itemsPerPage: number
  totalItems: number
}

export interface VirtualTableState {
  startIndex: number
  endIndex: number
  offsetY: number
  visibleItems: number
}

export const calculateVirtualTableState = (
  scrollTop: number,
  config: VirtualTableConfig
): VirtualTableState => {
  const { itemHeight, containerHeight, itemsPerPage, totalItems } = config

  // Calculate how many items fit in the container
  const visibleItems = Math.ceil(containerHeight / itemHeight) + 1

  // Calculate which item is at the top of the viewport
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1)

  // Calculate which item is at the bottom of the viewport
  const endIndex = Math.min(totalItems, startIndex + visibleItems + 2)

  // Calculate the offset for the visible items container
  const offsetY = startIndex * itemHeight

  return {
    startIndex,
    endIndex,
    offsetY,
    visibleItems,
  }
}

/**
 * Pagination helper for API responses
 * Reduces payload size by fetching data in chunks
 */
export interface PaginationState {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  offset: number
}

export const calculatePaginationState = (
  page: number,
  pageSize: number,
  totalItems: number
): PaginationState => {
  const totalPages = Math.ceil(totalItems / pageSize)
  const offset = (page - 1) * pageSize

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    offset,
  }
}

/**
 * Sort and filter optimization
 * Use stable sort to avoid unnecessary re-renders
 */
export const stableSortArray = <T extends Record<string, any>>(
  array: T[],
  compareFn: (a: T, b: T) => number
): T[] => {
  return array
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareFn(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item)
}

export const filterAndPaginateArray = <T extends Record<string, any>>(
  array: T[],
  filterFn: (item: T) => boolean,
  page: number,
  pageSize: number
): {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
} => {
  const filtered = array.filter(filterFn)
  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const offset = (page - 1) * pageSize
  const items = filtered.slice(offset, offset + pageSize)

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  }
}
