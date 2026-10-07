import {
  configureStore,
} from '@reduxjs/toolkit'

import erpReducer, {
  initialState,
} from './erpSlice'

import {
  loadPersistedERPState,
  savePersistedERPState,
} from './persistence'


/* =========================================================
   BUILD INITIAL ERP STATE
   ========================================================= */

function buildInitialERPState() {

  const savedState =
    loadPersistedERPState()


  if (
    !savedState ||
    typeof savedState !== 'object'
  ) {
    return initialState
  }


  const result = {
    ...initialState,
  }


  Object.keys(initialState).forEach(
    (key) => {

      if (
        Object.prototype.hasOwnProperty.call(
          savedState,
          key
        )
      ) {

        result[key] =
          savedState[key]

      }

    }
  )


  return result
}


/* =========================================================
   REDUX STORE
   ========================================================= */

export const store =
  configureStore({

    reducer: {

      erp:
        erpReducer,

    },

    preloadedState: {

      erp:
        buildInitialERPState(),

    },

    middleware:
      (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: true,
        }),

  })


/* =========================================================
   PERSIST COMPLETE ERP STATE
   ========================================================= */

let lastSavedState = null


store.subscribe(() => {

  const currentState =
    store.getState().erp


  if (
    currentState ===
    lastSavedState
  ) {
    return
  }


  lastSavedState =
    currentState


  savePersistedERPState(
    currentState
  )

})


export default store