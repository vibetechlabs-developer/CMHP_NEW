// import {
//   useEffect,
//   useMemo,
//   useState,
// } from 'react'

// import useAuth
//   from '../../hooks/useAuth'

// import {
//   getActiveCompanyId,
// } from '../../utils/workspace'

// import {
//   clearAuditRows,
//   companyLabel,
//   getAuditRows,
// } from '../../utils/audit'

// import '../companies/Companies.css'
// import './ActivityHistory.css'


// function canViewAudit(user) {

//   const role =
//     user?.profile?.role

//   return Boolean(
//     user?.is_superuser ||
//     [
//       'SUPER_ADMIN',
//       'MANAGEMENT',
//       'HR_ADMINISTRATOR',
//       'HR_MANAGER',
//     ].includes(role)
//   )
// }


// function formatDateTime(
//   value
// ) {

//   if (!value) {
//     return '—'
//   }

//   return new Date(
//     value
//   ).toLocaleString(
//     'en-IN',
//     {
//       day: '2-digit',
//       month: 'short',
//       year: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit',
//     }
//   )
// }


// function detailText(row) {

//   const summary =
//     row?.summary || {}

//   const entries =
//     Object.entries(
//       summary
//     ).filter(
//       ([key]) => {

//         const lower =
//           key.toLowerCase()

//         return ![
//           'password',
//           'token',
//           'secret',
//         ].some(
//           (word) =>
//             lower.includes(word)
//         )
//       }
//     )

//   if (
//     !entries.length
//   ) {
//     return ''
//   }

//   return entries
//     .slice(
//       0,
//       4
//     )
//     .map(
//       ([key, value]) => {

//         if (
//           value === null ||
//           value === undefined ||
//           value === ''
//         ) {
//           return null
//         }

//         if (
//           typeof value === 'object'
//         ) {
//           return null
//         }

//         return (
//           `${key.replace(
//             /_/g,
//             ' '
//           )}: ${value}`
//         )
//       }
//     )
//     .filter(Boolean)
//     .join(' • ')
// }


// export default function ActivityHistory() {

//   const {
//     user,
//   } = useAuth()

//   const [
//     search,
//     setSearch,
//   ] = useState('')

//   const [
//     refreshKey,
//     setRefreshKey,
//   ] = useState(0)

//   const activeCompanyId =
//     getActiveCompanyId(
//       user
//     )

//   const rows =
//     useMemo(
//       () =>
//         getAuditRows({
//           companyId:
//             activeCompanyId,

//           search,
//         }),
//       [
//         activeCompanyId,
//         search,
//         refreshKey,
//       ]
//     )


//   useEffect(() => {

//     const timer =
//       window.setInterval(
//         () =>
//           setRefreshKey(
//             (value) =>
//               value + 1
//           ),
//         5000
//       )

//     return () =>
//       window.clearInterval(
//         timer
//       )

//   }, [])


//   if (
//     !canViewAudit(user)
//   ) {

//     return (
//       <div className="hr-page">

//         <section className="company-panel company-no-access">

//           <h1>
//             Activity History
//           </h1>

//           <p>
//             Your current role does not
//             have access to audit history.
//           </p>

//         </section>

//       </div>
//     )
//   }


//   const clearAll = () => {

//     if (
//       !window.confirm(
//         'Clear the complete local activity history?'
//       )
//     ) {
//       return
//     }

//     clearAuditRows()

//     setRefreshKey(
//       (value) =>
//         value + 1
//     )
//   }


//   return (
//     <div className="hr-page audit-page">

//       <div className="hr-header">

//         <div>

//           <span
//             className="dash-pill"
//             style={{
//               marginBottom: 6,
//               display: 'inline-block',
//             }}
//           >
//             CONTROL & AUDIT
//           </span>

//           <h1>
//             Activity History
//           </h1>

//           <p>
//             Important ERP changes are
//             recorded with user, company,
//             action and time.
//           </p>

//         </div>

//       </div>


//       <section className="company-panel">

//         <div className="company-toolbar audit-toolbar">

//           <div>

//             <h2>
//               Audit Trail
//             </h2>

//             <p>
//               {rows.length} record
//               {rows.length === 1
//                 ? ''
//                 : 's'}
//               {' • '}
//               {companyLabel(
//                 activeCompanyId
//               )}
//             </p>

//           </div>


//           <button
//             type="button"
//             className="company-link danger"
//             onClick={clearAll}
//           >
//             Clear History
//           </button>

//         </div>


//         <div className="audit-search-row">

//           <input
//             className="field-input"
//             value={search}
//             onChange={(event) =>
//               setSearch(
//                 event.target.value
//               )
//             }
//             placeholder="Search user, action, module or company..."
//           />

//         </div>


//         <div className="company-table-wrap">

//           <table className="company-table audit-table">

//             <thead>

//               <tr>

//                 <th>
//                   Time
//                 </th>

//                 <th>
//                   Activity
//                 </th>

//                 <th>
//                   Performed By
//                 </th>

//                 <th>
//                   Company
//                 </th>

//                 <th>
//                   Details
//                 </th>

//               </tr>

//             </thead>


//             <tbody>

//               {rows.map(
//                 (row) => (

//                   <tr
//                     key={
//                       row.id
//                     }
//                   >

//                     <td className="audit-time">
//                       {formatDateTime(
//                         row.created_at
//                       )}
//                     </td>


//                     <td>

//                       <strong>
//                         {row.label}
//                       </strong>

//                       <span className="company-address">
//                         {row.action}
//                       </span>

//                     </td>


//                     <td>

//                       <strong>
//                         {row.actor_name}
//                       </strong>

//                       <span className="company-address">
//                         {row.actor_role ||
//                           'User'}
//                       </span>

//                     </td>


//                     <td>

//                       <span className="company-code">
//                         {row.company_name ||
//                           'System'}
//                       </span>

//                     </td>


//                     <td className="audit-details">
//                       {detailText(row) ||
//                         'No extra details'}
//                     </td>

//                   </tr>

//                 )
//               )}


//               {rows.length === 0 && (

//                 <tr>

//                   <td
//                     colSpan="5"
//                     className="company-empty"
//                   >
//                     No activity records found.
//                   </td>

//                 </tr>

//               )}

//             </tbody>

//           </table>

//         </div>

//       </section>

//     </div>
//   )
// }