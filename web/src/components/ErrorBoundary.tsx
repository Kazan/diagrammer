import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches JavaScript errors anywhere in the component tree below it,
 * logs the error, and displays a fallback UI. This is particularly important for
 * handling edge cases on e-ink devices (e.g., Boox Air 4C) where unusual touch
 * event behavior can sometimes cause rendering issues.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Report to native bridge if available
    if (typeof window !== "undefined" && window.NativeBridge) {
      try {
        // Log to native console via WebView
        console.error(`[ErrorBoundary] ${error.name}: ${error.message}`);
      } catch (_e) {
        // Ignore logging failures
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-[var(--bg)] text-[var(--text)] font-[system-ui,sans-serif] p-5 text-center">
          <h2 className="text-[var(--status-error)] mb-4">
            Something went wrong
          </h2>
          <p className="text-[var(--legacy-muted)] mb-6 max-w-[400px]">
            An unexpected error occurred. This may happen on some devices during
            certain touch interactions.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-6 py-3 text-base bg-[var(--status-ok)] text-[var(--bg)] border-none rounded-lg cursor-pointer font-semibold hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
          {this.state.error && (
            <details className="mt-6 text-xs text-[var(--legacy-muted)] max-w-[90vw] text-left">
              <summary className="cursor-pointer mb-2">
                Error Details
              </summary>
              <pre className="bg-[var(--bg-2)] p-3 rounded-lg overflow-auto max-h-[200px]">
                {this.state.error.name}: {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
