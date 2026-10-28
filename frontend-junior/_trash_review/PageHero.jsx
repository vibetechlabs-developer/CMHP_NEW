import useAuth from '../hooks/useAuth'
import { HeroScene } from './PharmaArt'
import './PageHero.css'


/* =========================================================
   PAGE HERO

   The pharmaceutical banner shown at the top of every page
   (Dashboard, Inventory, HRMS, Quality Control ...).

   Props
   -----
   eyebrow   small pill above the title      (optional)
   title     main heading                    (required)
   subtitle  description under the heading   (optional)
   greeting  true  -> shows the time-based greeting
                      with the logged-in user's name
                      (used on the Dashboard)
   actions   buttons shown below the text    (optional)

   No business data is created here. The only values used
   are the logged-in user's name (from useAuth) and the
   current date/time of the device.
   ========================================================= */

function timeGreeting(date) {
  const hour = date.getHours()

  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}


export default function PageHero({
  eyebrow,
  title,
  subtitle,
  greeting = false,
  actions = null,
}) {
  const { user } = useAuth()

  const now = new Date()

  const name =
    user?.first_name ||
    user?.username ||
    ''

  const dateText = now.toLocaleDateString(
    'en-IN',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  )

  return (
    <section className="page-hero">

      <div className="page-hero-text">

        {greeting ? (

          <>
            <span className="page-hero-welcome">
              Welcome back,
            </span>

            <h1>
              {timeGreeting(now)}
              {name ? `, ${name}` : ''}!
              {' '}
              <span
                className="page-hero-wave"
                aria-hidden="true"
              >
                👋
              </span>
            </h1>
          </>

        ) : (

          <>
            {eyebrow && (
              <span className="page-hero-pill">
                {eyebrow}
              </span>
            )}

            <h1>{title}</h1>
          </>

        )}

        {subtitle && <p>{subtitle}</p>}

        {greeting && (
          <span className="page-hero-date">
            {dateText}
          </span>
        )}

        {actions && (
          <div className="page-hero-actions">
            {actions}
          </div>
        )}

      </div>

      <HeroScene />

    </section>
  )
}