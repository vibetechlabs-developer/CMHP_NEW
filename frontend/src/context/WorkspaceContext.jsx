import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useDispatch } from 'react-redux'

import useAuth from '../hooks/useAuth'

import {
  clearSelectedWorkspace,
  getAvailableWorkspaces,
  getCurrentWorkspace,
  setSelectedWorkspace,
} from '../utils/workspace'
import { syncRealOperationsData } from '../features/operations/realDataSync'


export const WorkspaceContext =
  createContext(null)


export function WorkspaceProvider({
  children,
}) {

  const {
    user,
  } = useAuth()

  const dispatch =
    useDispatch()


  const [
    activeWorkspace,
    setActiveWorkspaceState,
  ] = useState(() =>
    getCurrentWorkspace(user)
  )


  const availableWorkspaces =
    useMemo(
      () =>
        getAvailableWorkspaces(user),
      [user]
    )


  useEffect(() => {

    if (!user) {

      clearSelectedWorkspace()

      setActiveWorkspaceState(
        null
      )

      return

    }


    const current =
      getCurrentWorkspace(user)


    setActiveWorkspaceState(
      current
    )


    if (current) {

      setSelectedWorkspace(
        current
      )

    }

  }, [user])


  // Real-backend read sync (see realDataSync.js's own docstring for
  // exactly what this does and does not cover) - re-runs whenever the
  // logged-in user or the active workspace/company changes, so switching
  // from Company A to Company B refetches that company's own products/
  // customers rather than leaving the previous company's rows showing.
  useEffect(() => {

    if (!user || !activeWorkspace) {
      return
    }

    syncRealOperationsData(
      dispatch,
      user
    )

  }, [user, activeWorkspace, dispatch])


  const setActiveWorkspace =
    useCallback(
      (workspace) => {

        const allowed =
          availableWorkspaces.some(
            (item) =>
              item.id === workspace
          )


        if (!allowed) {
          return
        }


        setSelectedWorkspace(
          workspace
        )


        setActiveWorkspaceState(
          workspace
        )

      },
      [
        availableWorkspaces,
      ]
    )


  const activeOption =
    useMemo(
      () =>
        availableWorkspaces.find(
          (item) =>
            item.id ===
            activeWorkspace
        ) || null,
      [
        availableWorkspaces,
        activeWorkspace,
      ]
    )


  const hasWorkspaceSwitcher =
    availableWorkspaces.length > 1


  const value =
    useMemo(
      () => ({

        activeWorkspace,

        activeOption,

        availableWorkspaces,

        setActiveWorkspace,

        hasWorkspaceSwitcher,

      }),
      [
        activeWorkspace,
        activeOption,
        availableWorkspaces,
        setActiveWorkspace,
        hasWorkspaceSwitcher,
      ]
    )


  return (
    <WorkspaceContext.Provider
      value={value}
    >
      {children}
    </WorkspaceContext.Provider>
  )

}