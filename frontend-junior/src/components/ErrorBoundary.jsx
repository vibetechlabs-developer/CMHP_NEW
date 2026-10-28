import React from 'react'

export default class ErrorBoundary
  extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(
    error,
    errorInfo
  ) {
    console.error(
      'CMHP ERP application error:',
      error,
      errorInfo
    )
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const errorMessage = this.state.error?.message || this.state.error?.toString?.() || ''

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f5f8fc',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '540px',
            background: '#ffffff',
            borderRadius: '18px',
            padding: '36px',
            textAlign: 'center',
            boxShadow:
              '0 18px 50px rgba(15, 23, 42, 0.12)',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 10px', color: '#0f172a' }}>
            Something went wrong
          </h2>

          <p
            style={{
              color: '#64748b',
              lineHeight: 1.6,
              margin: '0 0 20px',
            }}
          >
            The CMHP ERP encountered an unexpected error. You can try recovering this view or reload the application.
          </p>

          {errorMessage && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px',
                textAlign: 'left',
                fontSize: '12.5px',
                color: '#991b1b',
                fontFamily: 'monospace',
                wordBreak: 'break-word',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                borderRadius: '10px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: 0,
                background: '#2563eb',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '10px 22px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      </div>
    )
  }
}