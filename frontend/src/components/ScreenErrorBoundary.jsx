import { Component } from 'react'
import { Link } from 'react-router-dom'

// Recovery only: a screen that throws shows a readable message and a way back,
// instead of a blank page. The underlying fault still needs fixing.
export default class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(error) {
    return { failed: true, message: error?.message || String(error) }
  }

  // Keep the real error in the console so the fault can be found and fixed.
  componentDidCatch(error, info) {
    console.error('Screen failed to render:', error, info?.componentStack)
  }

  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="screen-error">
          <h2>This screen could not be displayed.</h2>
          <p>Try again from the Orders page. If it keeps happening, tell the administrator which screen you were on.</p>
          <Link to="/orders">Back to Orders</Link>
          {this.state.message && (
            <details className="screen-error-details">
              <summary>Technical details</summary>
              <code>{this.state.message}</code>
            </details>
          )}
        </section>
      )
    }
    return this.props.children
  }
}
