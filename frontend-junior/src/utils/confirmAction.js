export function confirmAction(
  message =
    'Are you sure you want to continue?'
) {

  if (

    typeof window ===
      'undefined' ||

    typeof window.confirm !==
      'function'

  ) {

    return true

  }


  return window.confirm(
    String(message)
  )

}