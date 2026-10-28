import { Link } from 'react-router-dom'

import './NotFound.css'


export default function NotFound() {

  return (
    <main className="not-found">
      <div className="not-found-card">
        <span className="not-found-code">
          404
        </span>

        <h1>
          Page not found
        </h1>

        <p>
          The page you are looking for does not exist or may have been moved.
        </p>

        <Link
          to="/dashboard"
          className="not-found-button"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  )
}
