import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { createPortal } from 'react-dom'

import './CustomerSearchSelect.css'


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/


const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .trim()


const getCustomerName = (customer) =>
  String(
    customer?.name ||
    customer?.customer_name ||
    customer?.company_name ||
    ''
  ).trim()


const getCustomerCode = (customer) =>
  String(
    customer?.code ||
    customer?.customer_code ||
    ''
  ).trim()


const getCustomerPhone = (customer) =>
  String(
    customer?.phone ||
    customer?.mobile ||
    customer?.mobile_number ||
    ''
  ).trim()


const getCustomerEmail = (customer) =>
  String(
    customer?.email ||
    ''
  ).trim()


const getInitials = (name) => {

  const cleanName =
    String(name || '').trim()

  if (!cleanName) {
    return '?'
  }


  const words =
    cleanName
      .split(/\s+/)
      .filter(Boolean)


  if (words.length === 1) {

    return words[0]
      .slice(0, 2)
      .toUpperCase()

  }


  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase()

}


/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/


export default function CustomerSearchSelect({

  customers = [],

  value = '',

  onChange,

  placeholder = 'Search customer...',

  disabled = false,

  required = false,

}) {

  const inputRef =
    useRef(null)

  const wrapperRef =
    useRef(null)

  const dropdownRef =
    useRef(null)


  const [
    search,
    setSearch,
  ] = useState('')


  const [
    open,
    setOpen,
  ] = useState(false)


  const [
    highlightedIndex,
    setHighlightedIndex,
  ] = useState(0)


  const [
    dropdownPosition,
    setDropdownPosition,
  ] = useState({
    top: 0,
    left: 0,
    width: 0,
  })


  /*
  |--------------------------------------------------------------------------
  | SELECTED CUSTOMER
  |--------------------------------------------------------------------------
  */


  const selectedCustomer =
    useMemo(() => {

      if (
        value === '' ||
        value === null ||
        value === undefined
      ) {
        return null
      }


      return customers.find(
        (customer) =>
          String(customer?.id) ===
          String(value)
      ) || null

    }, [
      customers,
      value,
    ])


  /*
  |--------------------------------------------------------------------------
  | KEEP INPUT IN SYNC WITH SELECTED CUSTOMER
  |--------------------------------------------------------------------------
  */


  useEffect(() => {

    if (!open) {

      setSearch(
        selectedCustomer
          ? getCustomerName(
              selectedCustomer
            )
          : ''
      )

    }

  }, [
    selectedCustomer,
    open,
  ])


  /*
  |--------------------------------------------------------------------------
  | SEARCH
  |--------------------------------------------------------------------------
  */


  const filteredCustomers =
    useMemo(() => {

      const query =
        normalizeText(search)


      if (!query) {

        return customers.slice(
          0,
          50
        )

      }


      const results =
        customers.filter(
          (customer) => {

            const name =
              normalizeText(
                getCustomerName(
                  customer
                )
              )

            const code =
              normalizeText(
                getCustomerCode(
                  customer
                )
              )

            const phone =
              normalizeText(
                getCustomerPhone(
                  customer
                )
              )

            const email =
              normalizeText(
                getCustomerEmail(
                  customer
                )
              )


            return (
              name.includes(query) ||
              code.includes(query) ||
              phone.includes(query) ||
              email.includes(query)
            )

          }
        )


      /*
       * Never render hundreds/thousands of DOM
       * elements at once.
       *
       * Search still checks the complete customer
       * array, but only the first 50 results are
       * rendered.
       */

      return results.slice(
        0,
        50
      )

    }, [
      customers,
      search,
    ])


  /*
  |--------------------------------------------------------------------------
  | POSITION DROPDOWN
  |--------------------------------------------------------------------------
  */


  const updateDropdownPosition =
    () => {

      if (!wrapperRef.current) {
        return
      }


      const rect =
        wrapperRef.current.getBoundingClientRect()


      setDropdownPosition({

        top:
          rect.bottom + 6,

        left:
          rect.left,

        width:
          rect.width,

      })

    }


  /*
  |--------------------------------------------------------------------------
  | OPEN DROPDOWN
  |--------------------------------------------------------------------------
  */


  const openDropdown = () => {

    if (disabled) {
      return
    }


    updateDropdownPosition()


    setOpen(true)


    setHighlightedIndex(0)

  }


  /*
  |--------------------------------------------------------------------------
  | SELECT CUSTOMER
  |--------------------------------------------------------------------------
  */


  const selectCustomer = (
    customer
  ) => {

    if (!customer) {
      return
    }


    onChange?.(
      String(customer.id)
    )


    setSearch(
      getCustomerName(
        customer
      )
    )


    setHighlightedIndex(0)


    setOpen(false)


    /*
     * Return focus to input after
     * selecting a customer.
     */

    requestAnimationFrame(() => {

      inputRef.current?.focus()

    })

  }


  /*
  |--------------------------------------------------------------------------
  | CLEAR CUSTOMER
  |--------------------------------------------------------------------------
  */


  const clearCustomer = () => {

    onChange?.('')


    setSearch('')


    setHighlightedIndex(0)


    setOpen(true)


    requestAnimationFrame(() => {

      updateDropdownPosition()

      inputRef.current?.focus()

    })

  }


  /*
  |--------------------------------------------------------------------------
  | INPUT CHANGE
  |--------------------------------------------------------------------------
  */


  const handleChange = (
    event
  ) => {

    const nextValue =
      event.target.value


    setSearch(
      nextValue
    )


    setOpen(true)


    setHighlightedIndex(0)


    /*
     * If the user starts typing after
     * selecting a customer, remove the
     * previous selection.
     */

    if (
      selectedCustomer &&
      nextValue !==
        getCustomerName(
          selectedCustomer
        )
    ) {

      onChange?.('')

    }


    requestAnimationFrame(() => {

      updateDropdownPosition()

    })

  }


  /*
  |--------------------------------------------------------------------------
  | KEYBOARD NAVIGATION
  |--------------------------------------------------------------------------
  */


  const handleKeyDown = (
    event
  ) => {

    if (disabled) {
      return
    }


    if (
      event.key ===
      'ArrowDown'
    ) {

      event.preventDefault()


      if (!open) {

        openDropdown()

        return

      }


      setHighlightedIndex(
        (current) =>
          Math.min(
            current + 1,
            Math.max(
              filteredCustomers.length - 1,
              0
            )
          )
      )

      return

    }


    if (
      event.key ===
      'ArrowUp'
    ) {

      event.preventDefault()


      if (!open) {

        openDropdown()

        return

      }


      setHighlightedIndex(
        (current) =>
          Math.max(
            current - 1,
            0
          )
      )

      return

    }


    if (
      event.key ===
      'Enter'
    ) {

      if (
        open &&
        filteredCustomers[
          highlightedIndex
        ]
      ) {

        event.preventDefault()


        selectCustomer(
          filteredCustomers[
            highlightedIndex
          ]
        )

      }

      return

    }


    if (
      event.key ===
      'Escape'
    ) {

      event.preventDefault()


      setOpen(false)


      /*
       * Restore selected customer name
       * when Escape is pressed.
       */

      setSearch(
        selectedCustomer
          ? getCustomerName(
              selectedCustomer
            )
          : ''
      )

      return

    }


    if (
      event.key ===
      'Tab'
    ) {

      setOpen(false)

    }

  }


  /*
  |--------------------------------------------------------------------------
  | CLICK OUTSIDE
  |--------------------------------------------------------------------------
  */


  useEffect(() => {

    const handleOutsideClick = (
      event
    ) => {

      const clickedInside =
        wrapperRef.current?.contains(
          event.target
        )


      const clickedDropdown =
        dropdownRef.current?.contains(
          event.target
        )


      if (
        !clickedInside &&
        !clickedDropdown
      ) {

        setOpen(false)


        setSearch(
          selectedCustomer
            ? getCustomerName(
                selectedCustomer
              )
            : ''
        )

      }

    }


    document.addEventListener(
      'mousedown',
      handleOutsideClick
    )


    return () => {

      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      )

    }

  }, [
    selectedCustomer,
  ])


  /*
  |--------------------------------------------------------------------------
  | UPDATE POSITION WHILE SCROLLING / RESIZING
  |--------------------------------------------------------------------------
  */


  useEffect(() => {

    if (!open) {
      return undefined
    }


    const update =
      () => {

        updateDropdownPosition()

      }


    window.addEventListener(
      'resize',
      update
    )


    window.addEventListener(
      'scroll',
      update,
      true
    )


    return () => {

      window.removeEventListener(
        'resize',
        update
      )


      window.removeEventListener(
        'scroll',
        update,
        true
      )

    }

  }, [
    open,
  ])


  /*
  |--------------------------------------------------------------------------
  | SCROLL HIGHLIGHTED ITEM INTO VIEW
  |--------------------------------------------------------------------------
  */


  useEffect(() => {

    if (!open) {
      return
    }


    const option =
      dropdownRef.current?.querySelector(
        `[data-customer-index="${highlightedIndex}"]`
      )


    option?.scrollIntoView({
      block: 'nearest',
    })

  }, [
    highlightedIndex,
    open,
  ])


  /*
  |--------------------------------------------------------------------------
  | DROPDOWN
  |--------------------------------------------------------------------------
  */


  const dropdown =
    open &&
    !disabled &&
    typeof document !==
      'undefined'
      ? createPortal(

          <div
            ref={dropdownRef}
            className="customer-search-dropdown"
            style={{
              top:
                dropdownPosition.top,

              left:
                dropdownPosition.left,

              width:
                dropdownPosition.width,
            }}
          >

            <div className="customer-search-header">

              <span>
                {search
                  ? 'Search results'
                  : 'Customers'}
              </span>


              <span className="customer-search-count">

                {filteredCustomers.length >= 50
                  ? '50+ shown'
                  : `${filteredCustomers.length} found`}

              </span>

            </div>


            <div className="customer-search-options">

              {filteredCustomers.length >
              0 ? (

                filteredCustomers.map(
                  (
                    customer,
                    index
                  ) => {

                    const name =
                      getCustomerName(
                        customer
                      )


                    const code =
                      getCustomerCode(
                        customer
                      )


                    const phone =
                      getCustomerPhone(
                        customer
                      )


                    const email =
                      getCustomerEmail(
                        customer
                      )


                    const isSelected =
                      String(
                        value
                      ) ===
                      String(
                        customer.id
                      )


                    const isHighlighted =
                      index ===
                      highlightedIndex


                    return (

                      <button
                        type="button"
                        key={
                          customer.id
                        }
                        data-customer-index={
                          index
                        }
                        className={
                          `customer-search-option ${
                            isHighlighted
                              ? 'is-highlighted'
                              : ''
                          } ${
                            isSelected
                              ? 'is-selected'
                              : ''
                          }`
                        }
                        onMouseDown={(
                          event
                        ) =>
                          event.preventDefault()
                        }
                        onMouseEnter={() =>
                          setHighlightedIndex(
                            index
                          )
                        }
                        onClick={() =>
                          selectCustomer(
                            customer
                          )
                        }
                      >

                        <span className="customer-avatar">

                          {getInitials(
                            name
                          )}

                        </span>


                        <span className="customer-option-content">

                          <span className="customer-option-name">

                            {name ||
                              'Unnamed customer'}

                          </span>


                          <span className="customer-option-meta">

                            {code && (
                              <span>
                                Code: {code}
                              </span>
                            )}


                            {phone && (
                              <span>
                                {phone}
                              </span>
                            )}


                            {!phone &&
                              email && (
                                <span>
                                  {email}
                                </span>
                              )}

                          </span>

                        </span>


                        {isSelected && (

                          <span className="customer-selected-check">

                            ✓

                          </span>

                        )}

                      </button>

                    )

                  }
                )

              ) : (

                <div className="customer-search-empty">

                  <div className="customer-empty-icon">
                    🔍
                  </div>

                  <strong>
                    No customers found
                  </strong>

                  <span>
                    Try a different name, code,
                    phone or email.
                  </span>

                </div>

              )}

            </div>


            <div className="customer-search-footer">

              <span>
                ↑ ↓ Navigate
              </span>

              <span>
                Enter Select
              </span>

              <span>
                Esc Close
              </span>

            </div>

          </div>,

          document.body

        )
      : null


  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */


  return (

    <>

      <div
        ref={wrapperRef}
        className={
          `customer-search-control ${
            open
              ? 'is-open'
              : ''
          }`
        }
      >

        <span className="customer-search-leading-icon">
          🔍
        </span>


        <input
          ref={inputRef}
          type="text"
          className="customer-search-input"
          value={search}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          required={
            required &&
            !value
          }
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          onFocus={() => {

            openDropdown()

          }}
          onClick={() => {

            openDropdown()

          }}
          onChange={
            handleChange
          }
          onKeyDown={
            handleKeyDown
          }
        />


        {search && (

          <button
            type="button"
            className="customer-search-clear"
            aria-label="Clear customer"
            disabled={disabled}
            onMouseDown={(
              event
            ) =>
              event.preventDefault()
            }
            onClick={
              clearCustomer
            }
          >
            ×
          </button>

        )}


        <span
          className={
            `customer-search-chevron ${
              open
                ? 'open'
                : ''
            }`
          }
        >
          ▼
        </span>

      </div>


      {dropdown}

    </>

  )

}