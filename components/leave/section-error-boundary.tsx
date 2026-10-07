"use client"

import React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  title: string
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[v0] ${this.props.title} render error:`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <div>
            <p className="font-medium text-red-800">{this.props.title} could not be displayed</p>
            <p className="mt-1 text-sm text-red-600">{this.state.error.message || "An unexpected error occurred"}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

// Calls a render function inside the boundary's subtree so a throw in it is caught here
// rather than in the parent's own render.
export function DeferredRender({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>
}
