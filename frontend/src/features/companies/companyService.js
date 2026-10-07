import { store } from '../../store/store'
import { delay } from '../../store/mockApi'

import {
  editCompany,
  setCompanyStatus,

  addDepartment,
  editDepartment,
  setDepartmentStatus,

  addUser,
  editUserAccess,
  deleteUser,
  setUserStatus,
} from '../../store/erpSlice'

import {
  getScopedCompanyId,
  enforceCompanyPayload,
} from '../../utils/companyScope'


const ROLE_LABELS = {

  SUPER_ADMIN:
    'Super Admin',

  MANAGEMENT:
    'Management',

  HR_ADMINISTRATOR:
    'HR Administrator',

  HR_MANAGER:
    'HR Manager',

  DEPARTMENT_MANAGER:
    'Department Manager',

  STORES_MANAGER:
    'Stores Manager',

  STORES_USER:
    'Stores User',

  EMPLOYEE:
    'Employee',

  VIEWER:
    'Viewer',

}


function hydrateUser(
  user,
  state
) {

  return {

    ...user,

    role_label:
      ROLE_LABELS[user.role] ||
      user.role,

    department:
      state.departments.find(
        (department) =>
          Number(
            department.id
          ) ===
          Number(
            user.department
          )
      ) || null,

    companies:
      (user.companies || [])

        .map(
          (id) =>
            state.companies.find(
              (company) =>
                Number(company.id) ===
                Number(id)
            )
        )

        .filter(Boolean),

  }
}


function getActiveCompany() {

  const state =
    store.getState().erp

  const companyId =
    getScopedCompanyId()


  if (!companyId) {
    return null
  }


  return (
    state.companies.find(
      (company) =>
        Number(company.id) ===
        Number(companyId)
    ) || null
  )
}


export const companyService = {


  // ==========================================================
  // COMPANIES
  // ==========================================================

  getCompanies() {

    const company =
      getActiveCompany()

    if (!company) {
      return delay([])
    }

    /*
     * Even Super Admin sees only the
     * currently selected company inside
     * company-specific screens.
     *
     * Super Admin switches A/B from the
     * global workspace switcher.
     */
    return delay([
      company,
    ])

  },


  updateCompany(
    id,
    payload
  ) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    if (
      !companyId ||
      Number(id) !==
      Number(companyId)
    ) {

      throw new Error(
        'You cannot edit another company from the active workspace.'
      )

    }


    store.dispatch(
      editCompany({
        id,
        payload,
      })
    )


    return delay(null)

  },


  deactivateCompany(id) {

    const companyId =
      getScopedCompanyId()


    if (
      !companyId ||
      Number(id) !==
      Number(companyId)
    ) {

      throw new Error(
        'You cannot change another company from the active workspace.'
      )

    }


    store.dispatch(
      setCompanyStatus({
        id,
        is_active: false,
      })
    )


    return delay(null)

  },


  reactivateCompany(id) {

    const companyId =
      getScopedCompanyId()


    if (
      !companyId ||
      Number(id) !==
      Number(companyId)
    ) {

      throw new Error(
        'You cannot change another company from the active workspace.'
      )

    }


    store.dispatch(
      setCompanyStatus({
        id,
        is_active: true,
      })
    )


    return delay(null)

  },


  // ==========================================================
  // USERS
  // ==========================================================

  getUsers() {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    if (!companyId) {
      return delay([])
    }


    const users =
      state.users.filter(
        (user) =>
          (
            user.companies || []
          ).some(
            (id) =>
              Number(id) ===
              Number(companyId)
          )
      )


    return delay(
      users.map(
        (user) =>
          hydrateUser(
            user,
            state
          )
      )
    )

  },


  createUser(payload) {

    const scoped =
      enforceCompanyPayload(
        payload
      )

    const companyId =
      Number(scoped.company)


    const isSuperAdmin =
      scoped.role ===
      'SUPER_ADMIN'


    const allCompanyIds =
      store
        .getState()
        .erp
        .companies
        .filter(
          (company) =>
            company.is_active
        )
        .map(
          (company) =>
            Number(company.id)
        )


    store.dispatch(
      addUser({

        ...scoped,

        /*
         * Only Super Admin gets
         * multi-company access.
         */
        companies:
          isSuperAdmin
            ? allCompanyIds
            : [companyId],

        primary_company:
          companyId,

        is_active:
          true,

      })
    )


    return delay(null)

  },


  updateUserAccess(
    id,
    payload
  ) {

    const state =
      store.getState().erp


    const companyId =
      getScopedCompanyId()


    const currentUser =
      state.users.find(
        (user) =>
          Number(user.id) ===
          Number(id)
      )


    if (
      !companyId ||
      !currentUser
    ) {

      throw new Error(
        'User does not belong to the active company.'
      )

    }


    const belongsToCompany =
      (
        currentUser.companies ||
        []
      ).some(
        (company) =>
          Number(company) ===
          Number(companyId)
      )


    if (!belongsToCompany) {

      throw new Error(
        'You cannot edit a user from another company.'
      )

    }


    const isSuperAdmin =
      payload.role ===
      'SUPER_ADMIN'


    const allCompanyIds =
      state.companies
        .filter(
          (company) =>
            company.is_active
        )
        .map(
          (company) =>
            Number(company.id)
        )


    /*
     * Never accidentally store an empty
     * password when admin is editing a user.
     */

    const cleanedPayload = {
      ...payload,
    }


    if (
      !cleanedPayload.password
    ) {

      delete cleanedPayload.password

    }


    store.dispatch(
      editUserAccess({

        id,

        payload: {

          ...cleanedPayload,

          companies:
            isSuperAdmin
              ? allCompanyIds
              : [
                Number(
                  companyId
                ),
              ],

          primary_company:
            Number(
              companyId
            ),

        },

      })
    )


    return delay(null)

  },


  // ==========================================================
  // DELETE USER
  // ==========================================================

  deleteUser(id) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const user =
      state.users.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    const belongs =
      user &&
      companyId &&
      (
        user.companies || []
      ).some(
        (company) =>
          Number(company) ===
          Number(companyId)
      )


    if (!belongs) {

      throw new Error(
        'You cannot delete a user from another company.'
      )

    }


    store.dispatch(
      deleteUser({
        id,
      })
    )


    return delay(null)

  },


  // ==========================================================
  // USER STATUS
  // ==========================================================

  deactivateUser(id) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const user =
      state.users.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    const belongs =
      user &&
      companyId &&
      (
        user.companies || []
      ).some(
        (company) =>
          Number(company) ===
          Number(companyId)
      )


    if (!belongs) {

      throw new Error(
        'You cannot change a user from another company.'
      )

    }


    store.dispatch(
      setUserStatus({
        id,
        is_active: false,
      })
    )


    return delay(null)

  },


  reactivateUser(id) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const user =
      state.users.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    const belongs =
      user &&
      companyId &&
      (
        user.companies || []
      ).some(
        (company) =>
          Number(company) ===
          Number(companyId)
      )


    if (!belongs) {

      throw new Error(
        'You cannot change a user from another company.'
      )

    }


    store.dispatch(
      setUserStatus({
        id,
        is_active: true,
      })
    )


    return delay(null)

  },


  // ==========================================================
  // DEPARTMENTS
  // ==========================================================

  getDepartments() {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    if (!companyId) {
      return delay([])
    }


    return delay(
      state.departments.filter(
        (department) =>
          Number(
            department.company
          ) ===
          Number(
            companyId
          )
      )
    )

  },


  createDepartment(
    payload
  ) {

    store.dispatch(
      addDepartment(
        enforceCompanyPayload(
          payload
        )
      )
    )


    return delay(null)

  },


  updateDepartment(
    id,
    payload
  ) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const department =
      state.departments.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    if (
      !department ||
      !companyId ||
      Number(
        department.company
      ) !==
      Number(companyId)
    ) {

      throw new Error(
        'Department does not belong to the active company.'
      )

    }


    store.dispatch(
      editDepartment({
        id,
        payload,
      })
    )


    return delay(null)

  },


  deactivateDepartment(id) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const department =
      state.departments.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    if (
      !department ||
      !companyId ||
      Number(
        department.company
      ) !==
      Number(companyId)
    ) {

      throw new Error(
        'Department does not belong to the active company.'
      )

    }


    store.dispatch(
      setDepartmentStatus({
        id,
        is_active: false,
      })
    )


    return delay(null)

  },


  reactivateDepartment(id) {

    const state =
      store.getState().erp

    const companyId =
      getScopedCompanyId()


    const department =
      state.departments.find(
        (row) =>
          Number(row.id) ===
          Number(id)
      )


    if (
      !department ||
      !companyId ||
      Number(
        department.company
      ) !==
      Number(companyId)
    ) {

      throw new Error(
        'Department does not belong to the active company.'
      )

    }


    store.dispatch(
      setDepartmentStatus({
        id,
        is_active: true,
      })
    )


    return delay(null)

  },

}