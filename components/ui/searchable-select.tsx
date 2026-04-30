"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"

export interface SearchableSelectOption {
  value: string
  label: string
  keywords?: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select option",
  searchPlaceholder = "Search...",
  emptyText = "No matches found",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      setOpen(false)
      setQuery("")
    }

    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const selected = useMemo(() => options.find((opt) => opt.value === value) || null, [options, value])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => {
      const hay = `${opt.label} ${opt.keywords || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [options, query])

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "border-input data-[placeholder=true]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        )}
        data-placeholder={!selected}
      >
        <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {open && !disabled && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full rounded-md border shadow-md">
          <div className="p-2 border-b">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-sm">{emptyText}</p>
            ) : (
              filteredOptions.map((opt) => {
                const active = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      active && "bg-accent/60",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && <Check className="h-4 w-4" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
