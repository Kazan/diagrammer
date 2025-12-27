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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            width: "100vw",
            backgroundColor: "#060a18",
            color: "#e7ecf5",
            fontFamily: "system-ui, sans-serif",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#ef4444", marginBottom: "16px" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#9aa7bd", marginBottom: "24px", maxWidth: "400px" }}>
            An unexpected error occurred. This may happen on some devices during
            certain touch interactions.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: "#3fcf8e",
              color: "#060a18",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
          {this.state.error && (
            <details
              style={{
                marginTop: "24px",
                fontSize: "12px",
                color: "#9aa7bd",
                maxWidth: "90vw",
                textAlign: "left",
              }}
            >
              <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                Error Details
              </summary>
              <pre
                style={{
                  backgroundColor: "#0c1226",
                  padding: "12px",
                  borderRadius: "8px",
                  overflow: "auto",
                  maxHeight: "200px",
                }}
              >
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
