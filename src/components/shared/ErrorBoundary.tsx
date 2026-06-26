"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Content to render when there is no error */
  children: ReactNode;
  /**
   * Optional custom fallback UI. Receives the caught error and a reset callback.
   * When omitted the built-in fallback is used (Tailwind-styled card + retry button).
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class-based error boundary.
 *
 * Catches render / lifecycle errors in the subtree and shows a friendly
 * fallback UI with a "Try again" button. Designed to be composed anywhere in
 * the component tree.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <MyFeature />
 * </ErrorBoundary>
 *
 * // With custom fallback:
 * <ErrorBoundary fallback={(err, reset) => <MyFallback error={err} onReset={reset} />}>
 *   <MyFeature />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console during development; Sentry will pick this up in production
    // via its own error boundary integration.
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  reset(): void {
    this.setState({ hasError: false, error: null });
  }

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (!hasError || !error) {
      return children;
    }

    if (fallback) {
      return fallback(error, this.reset);
    }

    return <DefaultFallback error={error} onReset={this.reset} />;
  }
}

// ── Default fallback UI ───────────────────────────────────────────────────────

interface DefaultFallbackProps {
  error: Error;
  onReset: () => void;
}

function DefaultFallback({ error, onReset }: DefaultFallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      {/* Icon */}
      <div
        className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="size-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      {/* Heading */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {/* Show error message only in development */}
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-2 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
      </div>

      {/* Retry */}
      <button
        onClick={onReset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Try again
      </button>
    </div>
  );
}

export default ErrorBoundary;
