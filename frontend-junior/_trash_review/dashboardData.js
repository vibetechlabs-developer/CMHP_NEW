// // Sample data used to preview the dashboard.
// // Replace this with real API calls (for example a dashboardService.js)
// // once the backend endpoints are available.

// export const KPI_CARDS = [
//   {
//     key: 'products',
//     label: 'Active Products',
//     value: '248',
//     change: '+12',
//     trend: 'up',
//     sentiment: 'good',
//     tone: 'blue',
//     color: '#2b5fe6',
//     spark: [18, 20, 19, 23, 22, 26, 29],
//   },
//   {
//     key: 'batches',
//     label: 'Batches in Production',
//     value: '18',
//     change: '+3',
//     trend: 'up',
//     sentiment: 'neutral',
//     tone: 'purple',
//     color: '#6366f1',
//     spark: [10, 12, 11, 14, 13, 16, 18],
//   },
//   {
//     key: 'orders',
//     label: 'Pending Orders',
//     value: '42',
//     change: '-8%',
//     trend: 'down',
//     sentiment: 'good',
//     tone: 'mint',
//     color: '#10b981',
//     spark: [58, 55, 57, 52, 49, 46, 42],
//   },
//   {
//     key: 'lowStock',
//     label: 'Low Stock Alerts',
//     value: '7',
//     change: '+2',
//     trend: 'up',
//     sentiment: 'bad',
//     tone: 'amber',
//     color: '#f59e0b',
//     spark: [3, 4, 3, 5, 4, 6, 7],
//   },
// ]

// // Units produced per day, in thousands (oldest day first)
// export const PRODUCTION_OUTPUT = [46, 52, 49, 61, 58, 34, 55]

// // Number of products in each category
// export const STOCK_BY_CATEGORY = [
//   { label: 'Tablets', value: 94, color: '#2b5fe6' },
//   { label: 'Capsules', value: 60, color: '#6366f1' },
//   { label: 'Syrups', value: 45, color: '#10b981' },
//   { label: 'Injectables', value: 30, color: '#f59e0b' },
//   { label: 'Others', value: 19, color: '#94a3b8' },
// ]

// export const EXPIRING_BATCHES = [
//   { batch: 'BT-24117', product: 'Paracetamol 500 mg Tablets', quantity: '12,000 strips', expiry: '02 Oct 2026', daysLeft: 11 },
//   { batch: 'BT-24089', product: 'Amoxicillin 250 mg Capsules', quantity: '8,400 strips', expiry: '15 Oct 2026', daysLeft: 24 },
//   { batch: 'BT-24052', product: 'Cetirizine 10 mg Tablets', quantity: '15,200 strips', expiry: '28 Oct 2026', daysLeft: 37 },
//   { batch: 'BT-24031', product: 'Ibuprofen 100 mg/5 ml Syrup', quantity: '3,600 bottles', expiry: '12 Nov 2026', daysLeft: 52 },
//   { batch: 'BT-23994', product: 'Vitamin B12 Injection', quantity: '2,800 vials', expiry: '30 Nov 2026', daysLeft: 70 },
// ]

// export const RECENT_ACTIVITY = [
//   { id: 1, tone: 'green', title: 'Batch BT-24122 released by Quality Control', time: '10 minutes ago' },
//   { id: 2, tone: 'blue', title: 'Purchase order PO-1093 approved', time: '42 minutes ago' },
//   { id: 3, tone: 'amber', title: 'Low stock alert: Amoxicillin 250 mg Capsules', time: '1 hour ago' },
//   { id: 4, tone: 'purple', title: 'Production batch BT-24125 started on Line 2', time: '2 hours ago' },
//   { id: 5, tone: 'blue', title: 'Dispatch DSP-2210 shipped to Central Depot', time: '3 hours ago' },
// ]