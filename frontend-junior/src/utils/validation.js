export function required(
  value,
  label
) {

  if (

    value === null ||

    value === undefined ||

    String(value).trim() === ''

  ) {

    return `${label} is required.`

  }


  return ''

}


export function validEmail(
  value
) {

  if (!value) {

    return ''

  }


  const normalized =
    String(value).trim()


  const pattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/


  return pattern.test(
    normalized
  )

    ? ''

    : 'Enter a valid email address.'

}


export function validPhone(
  value
) {

  if (!value) {

    return ''

  }


  const cleaned =
    String(value)

      .trim()

      .replace(
        /[\s()-]/g,
        ''
      )


  const pattern =
    /^\+?[0-9]{10,15}$/


  return pattern.test(
    cleaned
  )

    ? ''

    : 'Enter a valid phone number.'

}


export function validPassword(
  value
) {

  if (!value) {

    return ''

  }


  const password =
    String(value)


  if (
    password.length < 8
  ) {

    return (
      'Password must contain at least 8 characters.'
    )

  }


  if (
    !/[A-Z]/.test(password)
  ) {

    return (
      'Password must contain at least one uppercase letter.'
    )

  }


  if (
    !/[a-z]/.test(password)
  ) {

    return (
      'Password must contain at least one lowercase letter.'
    )

  }


  if (
    !/[0-9]/.test(password)
  ) {

    return (
      'Password must contain at least one number.'
    )

  }


  return ''

}


export function positiveNumber(
  value,
  label
) {

  if (

    value === '' ||

    value === null ||

    value === undefined

  ) {

    return ''

  }


  const number =
    Number(value)


  if (

    !Number.isFinite(
      number
    ) ||

    number < 0

  ) {

    return (
      `${label} must be a valid positive number.`
    )

  }


  return ''

}


export function validDate(
  value,
  label = 'Date'
) {

  if (!value) {

    return ''

  }


  const date =
    new Date(value)


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return (
      `${label} must be a valid date.`
    )

  }


  return ''

}


export function minLength(
  value,
  length,
  label
) {

  if (!value) {

    return ''

  }


  if (

    String(value)
      .trim()
      .length < Number(length)

  ) {

    return (
      `${label} must contain at least ${length} characters.`
    )

  }


  return ''

}


export function validateEmployee(
  form
) {

  const errors = {}


  const nameError =
    required(
      form.first_name,
      'First name'
    )


  if (nameError) {

    errors.first_name =
      nameError

  }


  const emailError =
    validEmail(
      form.email
    )


  if (emailError) {

    errors.email =
      emailError

  }


  const phoneError =
    validPhone(
      form.phone
    )


  if (phoneError) {

    errors.phone =
      phoneError

  }


  const salaryError =
    positiveNumber(
      form.salary,
      'Salary'
    )


  if (salaryError) {

    errors.salary =
      salaryError

  }


  return errors

}


export function validateCustomer(
  form
) {

  const errors = {}


  const nameError =
    required(
      form.name,
      'Customer name'
    )


  if (nameError) {

    errors.name =
      nameError

  }


  const emailError =
    validEmail(
      form.email
    )


  if (emailError) {

    errors.email =
      emailError

  }


  const phoneError =
    validPhone(
      form.phone
    )


  if (phoneError) {

    errors.phone =
      phoneError

  }


  return errors

}