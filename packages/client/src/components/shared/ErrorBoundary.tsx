import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: unknown;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  const message = typeof value === 'string' ? value : String(value);
  return new Error(message || 'Unknown error');
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    const err = toError(error);
    console.error('[ErrorBoundary] Caught render error:', err.message);
    console.error('[ErrorBoundary] Original error type:', typeof error);
    if (error instanceof Error) {
      console.error('[ErrorBoundary] Original error name:', error.name);
      console.error('[ErrorBoundary] Original error message:', error.message);
    }
    console.error('[ErrorBoundary] Original error value:', error);
    if (errorInfo && typeof errorInfo === 'object' && 'componentStack' in errorInfo) {
      console.error('[ErrorBoundary] Component stack:', (errorInfo as React.ErrorInfo).componentStack);
    }
    console.error('[ErrorBoundary] Error stack:', err.stack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const err = toError(this.state.error);

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            background: 'var(--vscode-editor-background, #1e1e1e)',
            color: 'var(--vscode-editor-foreground, #d4d4d4)',
          }}
        >
          <div style={{ maxWidth: '600px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--vscode-descriptionForeground, #989898)',
                marginBottom: '1rem',
                wordBreak: 'break-word',
              }}
            >
              {err.message || 'Unknown error'}
            </p>
            <pre
              style={{
                fontSize: '0.75rem',
                textAlign: 'left',
                background: 'var(--vscode-textCodeBlock-background, #1a1a1a)',
                padding: '1rem',
                borderRadius: '0.5rem',
                overflow: 'auto',
                maxHeight: '300px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {err.stack || 'No stack trace available'}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--vscode-button-border, #444)',
                background: 'var(--vscode-button-background, #0078d4)',
                color: 'var(--vscode-button-foreground, white)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
