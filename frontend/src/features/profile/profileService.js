import {
  store,
} from '../../store/store'

import {
  editUserAccess,
} from '../../store/erpSlice'

import {
  delay,
} from '../../store/mockApi'


export const profileService = {

  /*
   * Update logged-in user's own details.
   *
   * IMPORTANT:
   * designation is deliberately NOT accepted here.
   */

  updateOwnProfile(
    userId,
    payload
  ) {

    const state =
      store.getState().erp


    const existingUser =
      state.users.find(
        (user) =>
          Number(user.id) ===
          Number(userId)
      )


    if (!existingUser) {

      throw new Error(
        'User account was not found.'
      )

    }


    const safePayload = {

      first_name:
        payload.first_name
          ?.trim() ||
        '',

      last_name:
        payload.last_name
          ?.trim() ||
        '',

      email:
        payload.email
          ?.trim() ||
        '',

      phone:
        payload.phone
          ?.trim() ||
        '',

    }


    /*
     * DESIGNATION IS NEVER UPDATED HERE.
     */

    store.dispatch(
      editUserAccess({

        id:
          userId,

        payload:
          safePayload,

      })
    )


    return delay(true)

  },


  /*
   * Change own password.
   */

  changeOwnPassword(
    userId,
    currentPassword,
    newPassword
  ) {

    const state =
      store.getState().erp


    const existingUser =
      state.users.find(
        (user) =>
          Number(user.id) ===
          Number(userId)
      )


    if (!existingUser) {

      throw new Error(
        'User account was not found.'
      )

    }


    if (
      existingUser.password !==
      currentPassword
    ) {

      throw new Error(
        'Current password is incorrect.'
      )

    }


    if (
      !newPassword ||
      newPassword.length < 8
    ) {

      throw new Error(
        'New password must contain at least 8 characters.'
      )

    }


    store.dispatch(
      editUserAccess({

        id:
          userId,

        payload: {

          password:
            newPassword,

        },

      })
    )


    return delay(true)

  },

}