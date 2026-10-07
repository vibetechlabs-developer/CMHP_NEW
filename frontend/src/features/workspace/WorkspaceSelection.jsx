import {
  useEffect,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import useAuth from '../../hooks/useAuth'

import {
  BuildingIcon,
  InventoryIcon,
  LogoutIcon,
} from '../../components/icons'

import {
  getAvailableWorkspaces,
  getCurrentWorkspace,
  requiresWorkspaceSelection,
  setSelectedWorkspace,
  WORKSPACES,
} from '../../utils/workspace'

import './WorkspaceSelection.css'


function WorkspaceIcon({
  type,
}) {

  if (
    type === 'inventory'
  ) {
    return (
      <InventoryIcon
        size={30}
      />
    )
  }

  return (
    <BuildingIcon
      size={30}
    />
  )
}


export default function WorkspaceSelection() {

  const {
    user,
    logout,
  } = useAuth()


  const navigate =
    useNavigate()


  const availableWorkspaces =
    getAvailableWorkspaces(user)


  useEffect(() => {

    if (!user) {
      return
    }


    if (
      !requiresWorkspaceSelection(
        user
      )
    ) {

      const workspace =
        getCurrentWorkspace(
          user
        )


      if (
        workspace ===
        WORKSPACES.COMMON
      ) {

        navigate(
          '/inventory',
          { replace: true }
        )

      } else {

        navigate(
          '/dashboard',
          { replace: true }
        )

      }

    }

  }, [
    user,
    navigate,
  ])


  function handleWorkspaceSelect(
    workspace
  ) {

    setSelectedWorkspace(
      workspace.id
    )


    if (
      workspace.id ===
      WORKSPACES.COMMON
    ) {

      navigate(
        '/inventory',
        { replace: true }
      )

      return
    }


    navigate(
      '/dashboard',
      { replace: true }
    )
  }


  function handleLogout() {
    logout()
  }


  return (
    <div className="workspace-page">

      <div className="workspace-orb workspace-orb-one" />

      <div className="workspace-orb workspace-orb-two" />


      {/* =================================================
          TOP BAR
          NO COMPANY LOGO HERE
          ================================================= */}

      <header className="workspace-topbar">

        <div className="workspace-brand">


        </div>


        <button
          type="button"
          className="workspace-logout"
          onClick={handleLogout}
        >

          <LogoutIcon
            size={15}
          />

          Logout

        </button>

      </header>


      {/* =================================================
          MAIN
          ================================================= */}

      <main className="workspace-main">

        <section className="workspace-heading">

          <span className="workspace-eyebrow">
            SECURE WORKSPACE ACCESS
          </span>


          <h1>

            Welcome back,

            <span>
              {' '}
              {
                user?.first_name ||
                user?.username ||
                'User'
              }
            </span>

          </h1>


          <p>

            You have access to multiple
            company environments.
            Select the workspace you want
            to access.

          </p>

        </section>


        {/* =================================================
            WORKSPACE CARDS
            ================================================= */}

        <section
          className={`workspace-grid workspace-grid-${availableWorkspaces.length}`}
        >

          {availableWorkspaces.map(
            (workspace) => (

              <button
                key={workspace.id}
                type="button"
                className={`workspace-card workspace-card-${workspace.id}`}
                onClick={() =>
                  handleWorkspaceSelect(
                    workspace
                  )
                }
              >

                <span className="workspace-card-icon">

                  <WorkspaceIcon
                    type={
                      workspace.icon
                    }
                  />

                </span>


                <span className="workspace-card-content">

                  <span className="workspace-card-label">

                    {
                      workspace.id ===
                      WORKSPACES.COMMON
                        ? 'SHARED ENVIRONMENT'
                        : 'COMPANY ENVIRONMENT'
                    }

                  </span>


                  <span className="workspace-card-title">

                    {workspace.name}

                  </span>


                  <span className="workspace-card-description">

                    {
                      workspace.description
                    }

                  </span>

                </span>


                <span className="workspace-card-arrow">

                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >

                    <path d="M5 12h14" />

                    <path d="m13 6 6 6-6 6" />

                  </svg>

                </span>

              </button>

            )
          )}

        </section>


        {/* =================================================
            SECURITY INFORMATION
            ================================================= */}

        <div className="workspace-security">

          <span className="workspace-security-icon">

            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >

              <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />

              <path d="m9 12 2 2 4-4" />

            </svg>

          </span>


          <span>

            Your access is limited to the
            companies and modules assigned
            to your account.

          </span>

        </div>

      </main>


      {/* =================================================
          FOOTER
          ================================================= */}

      <footer className="workspace-footer">

        · Secure
        Authorized Access

      </footer>

    </div>
  )
}