import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  BuildingIcon,
  InventoryIcon,
} from './icons'

import useWorkspace from '../hooks/useWorkspace'

import {
  WORKSPACES,
} from '../utils/workspace'

import './WorkspaceSwitcher.css'


function getCompanyLogo(workspaceId) {

  if (workspaceId === WORKSPACES.COMPANY_A) {
    return '/logo.jpg'
  }

  if (workspaceId === WORKSPACES.COMPANY_B) {
    return '/logo2.jpeg'
  }

  return null
}


function WorkspaceIcon({
  type,
  workspaceId,
  size = 17,
}) {

  if (
    type === 'inventory'
  ) {
    return (
      <InventoryIcon
        size={size}
      />
    )
  }


  const logo =
    getCompanyLogo(
      workspaceId
    )


  if (logo) {

    return (
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          padding: '3px',
          boxSizing: 'border-box',
          borderRadius: '8px',
          display: 'block',
        }}
      />
    )
  }


  return (
    <BuildingIcon
      size={size}
    />
  )
}


export default function WorkspaceSwitcher() {

  const {
    activeWorkspace,
    activeOption,
    availableWorkspaces,
    setActiveWorkspace,
    hasWorkspaceSwitcher,
  } = useWorkspace()


  const [
    open,
    setOpen,
  ] = useState(false)


  const rootRef =
    useRef(null)

  const navigate =
    useNavigate()


  useEffect(() => {

    const handleOutside =
      (event) => {

        if (
          rootRef.current &&
          !rootRef.current.contains(
            event.target
          )
        ) {

          setOpen(false)

        }

      }


    document.addEventListener(
      'mousedown',
      handleOutside
    )


    return () =>
      document.removeEventListener(
        'mousedown',
        handleOutside
      )

  }, [])


  if (
    !hasWorkspaceSwitcher
  ) {
    return null
  }


  return (
    <div
      className="workspace-switcher"
      ref={rootRef}
    >

      {/* ==================================================
          TRIGGER
          ================================================== */}

      <button
        type="button"
        className={`workspace-trigger ${
          open
            ? 'is-open'
            : ''
        }`}
        onClick={() =>
          setOpen(
            (value) =>
              !value
          )
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >

        <span className="workspace-trigger-icon">

          <WorkspaceIcon
            type={
              activeOption?.icon
            }
            workspaceId={
              activeOption?.id
            }
            size={17}
          />

        </span>


        <span className="workspace-trigger-copy">

          <span className="workspace-trigger-label">
            Current workspace
          </span>

          <span className="workspace-trigger-value">
            {
              activeOption?.name ||
              'Select workspace'
            }
          </span>

        </span>


        <svg
          className="workspace-chevron"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >

          <path d="m6 9 6 6 6-6" />

        </svg>

      </button>


      {/* ==================================================
          DROPDOWN
          ================================================== */}

      {open && (

        <div
          className="workspace-menu"
          role="menu"
        >

          <div className="workspace-menu-head">

            <span className="workspace-menu-kicker">
              Switch Workspace
            </span>

            <span className="workspace-menu-subtitle">
              Choose the company or shared inventory context
            </span>

          </div>


          <div className="workspace-options">

            {availableWorkspaces.map(
              (option) => {

                const selected =
                  option.id ===
                  activeWorkspace


                return (

                  <button
                    key={option.id}
                    type="button"
                    className={`workspace-option ${
                      selected
                        ? 'selected'
                        : ''
                    }`}
                    role="menuitem"
                    onClick={() => {

                      setActiveWorkspace(
                        option.id
                      )

                      setOpen(false)


                      if (
                        option.id ===
                        activeWorkspace
                      ) {
                        return
                      }


                      navigate(
                        option.id ===
                        WORKSPACES.COMMON
                          ? '/inventory'
                          : '/dashboard'
                      )

                    }}
                  >

                    <span
                      className={`workspace-option-icon ${
                        option.id ===
                        WORKSPACES.COMMON
                          ? 'common'
                          : ''
                      }`}
                    >

                      <WorkspaceIcon
                        type={
                          option.icon
                        }
                        workspaceId={
                          option.id
                        }
                        size={18}
                      />

                    </span>


                    <span className="workspace-option-copy">

                      <span className="workspace-option-title">
                        {option.name}
                      </span>

                      <span className="workspace-option-description">
                        {
                          option.description
                        }
                      </span>

                    </span>


                    <span
                      className={`workspace-check ${
                        selected
                          ? 'visible'
                          : ''
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>

                  </button>

                )

              }
            )}

          </div>


          <div className="workspace-menu-footer">

            <span className="workspace-secure-dot" />

            Context access is controlled by your account

          </div>

        </div>

      )}

    </div>
  )
}