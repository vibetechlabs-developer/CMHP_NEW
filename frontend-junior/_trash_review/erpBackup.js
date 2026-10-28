// import {
//   store,
// } from '../store/store'

// import {
//   exportERPState,
//   importERPState,
// } from '../store/persistence'

// export function downloadERPBackup() {
//   const state =
//     store.getState().erp

//   const content =
//     exportERPState(state)

//   const blob =
//     new Blob(
//       [content],
//       {
//         type:
//           'application/json',
//       }
//     )

//   const url =
//     URL.createObjectURL(blob)

//   const link =
//     document.createElement('a')

//   link.href = url

//   link.download =
//     `cmhp-erp-backup-${new Date()
//       .toISOString()
//       .slice(0, 10)}.json`

//   document.body.appendChild(link)

//   link.click()

//   link.remove()

//   URL.revokeObjectURL(url)
// }

// export function readERPBackupFile(file) {
//   return new Promise(
//     (resolve, reject) => {
//       const reader =
//         new FileReader()

//       reader.onload = () => {
//         try {
//           resolve(
//             importERPState(
//               reader.result
//             )
//           )
//         } catch (error) {
//           reject(error)
//         }
//       }

//       reader.onerror = () => {
//         reject(
//           new Error(
//             'Unable to read backup file.'
//           )
//         )
//       }

//       reader.readAsText(file)
//     }
//   )
// }