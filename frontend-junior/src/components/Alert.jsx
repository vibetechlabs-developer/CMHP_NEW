import './components.css'

export default function Alert({
  type = 'error',
  children,
  message = '',
}) {
  const content =
    children !== undefined &&
    children !== null &&
    children !== ''
      ? children
      : message

  if (
    content === undefined ||
    content === null ||
    content === ''
  ) {
    return null
  }

  return (
    <div
      className={`alert alert-${type}`}
      role="alert"
    >
      {content}
    </div>
  )
}