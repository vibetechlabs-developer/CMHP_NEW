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
  getSelectedWorkspace,
  setSelectedWorkspace,
  WORKSPACE_OPTIONS,
} from '../utils/workspace'
import { setActiveCompanyId } from '../store/erpSlice'


export const WorkspaceContext =
  createContext(null)


export function WorkspaceProvider({
  children,
}) {

  const {
    user,
  } = useAuth()

  const dispatch = useDispatch()


  const [
    activeWorkspace,
    setActiveWorkspaceState,
  ] = useState(() =>
    getCurrentWorkspace(user) || getSelectedWorkspace()
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
      getCurrentWorkspace(user) || getSelectedWorkspace()


    if (current) {

      setActiveWorkspaceState(
        current
      )

      setSelectedWorkspace(
        current
      )

      const matchedOption = Object.values(WORKSPACE_OPTIONS).find((opt) => opt.id === current)
      if (matchedOption && matchedOption.companyId !== undefined) {
        dispatch(setActiveCompanyId(matchedOption.companyId))
      }

    }

  }, [user, dispatch])


  const setActiveWorkspace =
    useCallback(
      (workspace) => {

        if (!workspace) return

        const target =
          availableWorkspaces.find(
            (item) =>
              item.id === workspace
          ) || Object.values(WORKSPACE_OPTIONS).find((item) => item.id === workspace)


        setSelectedWorkspace(
          workspace
        )


        setActiveWorkspaceState(
          workspace
        )

        if (target && target.companyId !== undefined) {
          dispatch(setActiveCompanyId(target.companyId))
        }

      },
      [
        availableWorkspaces,
        dispatch,
      ]
    )


  const activeOption =
    useMemo(
      () => {
        if (!activeWorkspace) return null
        return (
          availableWorkspaces.find(
            (item) =>
              item.id ===
              activeWorkspace
          ) ||
          Object.values(WORKSPACE_OPTIONS).find(
            (item) =>
              item.id ===
              activeWorkspace
          ) ||
          null
        )
      },
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