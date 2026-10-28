import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'

import OverviewTab from './tabs/OverviewTab'
import ProductsPage from './tabs/ProductsPage'
import FormulaWorkspacePage from './tabs/FormulaWorkspacePage'
import CommonMaterialsTab from './tabs/CommonMaterialsTab'
import MaterialRegisterPage from './tabs/MaterialRegisterPage'
import CommonOrdersTab from './tabs/CommonOrdersTab'
import StockTab from './tabs/StockTab'
import IssueReturnTab from './tabs/IssueReturnTab'
import BatchPlanningPage from './tabs/BatchPlanningPage'
import SuppliersPage from './tabs/SuppliersPage'
import { getErrorMessage } from '../../utils/errors'
import { getMyStores } from '../store/storeService'

import './Inventory.css'

// /inventory/materials/<numeric id> - the material register detail route.
// Matched by hand, same manual-pathname-matching style the rest of this
// component already uses (it has no nested <Route>/<Outlet> of its own -
// see AppRoutes.jsx's single /inventory/* catch-all).
const MATERIAL_DETAIL_PATTERN = /^\/inventory\/materials\/(\d+)\/?$/
// /inventory/products/<companyId>/<productId>/formulas - companyId is
// embedded in the URL itself (not just route state) so a reload or a
// direct link still knows which company's product to load.
const PRODUCT_FORMULAS_PATTERN = /^\/inventory\/products\/(\d+)\/(\d+)\/formulas\/?$/


const INVENTORY_HERO_CONFIG = {
  overview: {
    eyebrow: 'COMMON STORE & WAREHOUSE',
    title: 'Common Inventory Dashboard',
    subtitle: 'Common Store & Inventory — shared across CMHP Pharma and Tej Biocare.',
  },
  products: {
    eyebrow: 'FINISHED MEDICINES & DOSAGE FORMS',
    title: 'Products',
    subtitle: 'Each company\'s own finished-product catalog and formulas - never shared across companies.',
  },
  'batch-planning': {
    eyebrow: 'MANUFACTURING & BATCH MATERIAL REQUESTS',
    title: 'Batch Planning',
    subtitle: 'Plan a batch against an approved formula, request its materials, and track the batch manufacturing record.',
  },
  materials: {
    eyebrow: 'RAW CHEMICAL INGREDIENTS & APIS',
    title: 'Material Master',
    subtitle: 'Central store of chemical raw materials, active ingredients, excipients, and supplier sourcing.',
  },
  orders: {
    eyebrow: 'CENTRAL PURCHASING & WAREHOUSE INWARD',
    title: 'Common Material Purchasing',
    subtitle: 'Purchase raw and packaging materials and track deliveries into the shared store.',
  },
  stock: {
    eyebrow: 'MATERIAL STOCK & LOT TRACEABILITY',
    title: 'Stock & Lots',
    subtitle: 'View material stock, receipt sources, and lot traceability.',
  },
  'issue-return': {
    eyebrow: 'MATERIAL ISSUANCE & VERIFIED RETURNS',
    title: 'Issue / Return',
    subtitle: 'Issue lots to production units and process returns with automatic manufacturer attribution.',
  },
  suppliers: {
    eyebrow: 'SHARED SUPPLIER DIRECTORY',
    title: 'Suppliers',
    subtitle: 'Register and manage suppliers — a shared directory across all companies.',
  },
}

/* =========================================================
   INVENTORY COMPONENT
   ========================================================= */

export default function Inventory() {

    const { user } = useAuth()
    const location = useLocation()

    const role = user?.profile?.role


    /* =====================================================
       CURRENT INVENTORY SECTION
       ===================================================== */

    const activePath =
        location.pathname.replace(/\/+$/, '') ||
        '/inventory'

    if (activePath === '/inventory/ledger' || activePath === '/inventory/stock-ledger') {
        return <Navigate to="/inventory/materials" replace />
    }

    const materialDetailMatch = activePath.match(MATERIAL_DETAIL_PATTERN)
    const productFormulasMatch = activePath.match(PRODUCT_FORMULAS_PATTERN)

    const activeSection =
        (activePath === '/inventory' || activePath === '/inventory/overview' || activePath === '/inventory/dashboard')
            ? 'overview'
            : (activePath === '/inventory/products' || productFormulasMatch || activePath.startsWith('/inventory/products/'))
                ? 'products'
                : (activePath === '/inventory/materials' || materialDetailMatch || activePath.startsWith('/inventory/materials/'))
                    ? 'materials'
                    : (activePath === '/inventory/orders' || activePath.startsWith('/inventory/orders/'))
                        ? 'orders'
                        : (activePath === '/inventory/stock' || activePath.startsWith('/inventory/stock/'))
                            ? 'stock'
                            : (activePath === '/inventory/issue-return' || activePath.startsWith('/inventory/issue-return/'))
                                ? 'issue-return'
                                : (activePath === '/inventory/batch-planning' || activePath.startsWith('/inventory/batch-planning/'))
                                    ? 'batch-planning'
                                    : (activePath === '/inventory/suppliers' || activePath.startsWith('/inventory/suppliers/'))
                                        ? 'suppliers'
                                        : 'overview'

    const heroConfig = INVENTORY_HERO_CONFIG[activeSection] || INVENTORY_HERO_CONFIG.overview


    /* =====================================================
       COMMON INVENTORY ACCESS
       ===================================================== */

    const canAccess =
        user?.is_superuser === true ||
        role === 'SUPER_ADMIN' ||
        user?.profile?.can_access_common_inventory === true


    /* =====================================================
       REAL STORE CONTEXT (material register only)

       Fetched from GET /v1/stores/mine/ - real, unbounded store ids,
       never the fixed Company A/B workspace slots. Only needed by the
       material register placeholder below; the plain materials list is
       a shared, store-independent catalog and never reads this.
       ===================================================== */

    const [stores, setStores] = useState({ state: 'loading', list: [] })
    // Remembered per signed-in username, not just "the last store anyone
    // picked on this browser" - a different account on the same machine
    // must never inherit someone else's store selection. Still only a
    // convenience: restored value is validated against this account's own
    // real GET /v1/stores/mine/ list below before ever being trusted, same
    // as the workspace-selection stale-value guard elsewhere in this app.
    const storeStorageKey = user?.username ? `cmhp.selectedStoreId.${user.username}` : null
    const [storeId, setStoreIdState] = useState(() => {
        if (!storeStorageKey) return null
        const saved = Number(window.localStorage.getItem(storeStorageKey))
        return Number.isInteger(saved) && saved > 0 ? saved : null
    })
    const setStoreId = (id) => {
        setStoreIdState(id)
        if (!storeStorageKey) return
        if (id) window.localStorage.setItem(storeStorageKey, String(id))
        else window.localStorage.removeItem(storeStorageKey)
    }
    const storeRequestRef = useRef(0)

    useEffect(() => {
        if (!canAccess) return
        const requestId = ++storeRequestRef.current
        setStores({ state: 'loading', list: [] })
        getMyStores()
            .then((list) => {
                if (storeRequestRef.current !== requestId) return
                setStores({ state: 'ready', list })
                // A reload-restored id that is no longer in this account's
                // real store list (access revoked, or it belonged to a
                // different account's leftover localStorage key) is
                // rejected here exactly like a stale workspace selection -
                // never trusted just because it was remembered. Routed
                // through setStoreId (not setStoreIdState) so a rejection
                // also clears the stale localStorage entry, not just the
                // in-memory value.
                setStoreIdState((current) => {
                    const next = list.some((s) => s.id === current) ? current : list.length === 1 ? list[0].id : null
                    if (next !== current && storeStorageKey) {
                        if (next) window.localStorage.setItem(storeStorageKey, String(next))
                        else window.localStorage.removeItem(storeStorageKey)
                    }
                    return next
                })
            })
            .catch((err) => {
                if (storeRequestRef.current !== requestId) return
                setStores({ state: 'error', list: [], error: getErrorMessage(err) })
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAccess, user?.id, user?.username])


    /* =====================================================
       ACCESS DENIED
       ===================================================== */

    if (!canAccess) {

        return (
            <div className="inv">

                <div className="inv-panel inv-empty">

                    You don't currently have access to the
                    Common Store &amp; Inventory module.
                    Ask an admin to enable it for your
                    account.

                </div>

            </div>
        )

    }


    /* =====================================================
       MAIN INVENTORY UI
       ===================================================== */

    return (

        <div className="inv">


            {/* =================================================
                HEADER
                ================================================= */}

            <div className="inv-header top-banner">

                <div>

                    <span className="page-hero-pill">
                        {heroConfig.eyebrow}
                    </span>

                    <h1>
                        {heroConfig.title}
                    </h1>

                    <p>
                        {heroConfig.subtitle}
                    </p>

                </div>

            </div>


            {/* =================================================
                ACTIVE SECTION CONTENT
                ================================================= */}

            {activeSection === 'overview' && (
                <OverviewTab
                    storeId={storeId}
                    onSelectStore={setStoreId}
                    stores={stores.list}
                    storesReady={stores.state === 'ready'}
                    storesLoading={stores.state === 'loading'}
                    storesError={stores.error}
                />
            )}

            {activeSection === 'products' && productFormulasMatch && (
                <FormulaWorkspacePage
                    companyId={Number(productFormulasMatch[1])}
                    productId={Number(productFormulasMatch[2])}
                />
            )}

            {activeSection === 'products' && !productFormulasMatch && (
                <ProductsPage />
            )}

            {activeSection === 'materials' && materialDetailMatch && (
                <MaterialRegisterPage
                    materialId={Number(materialDetailMatch[1])}
                    stores={stores.list}
                    storesReady={stores.state === 'ready'}
                    storeId={storeId}
                    onSelectStore={setStoreId}
                />
            )}

            {activeSection === 'materials' && !materialDetailMatch && (
                <CommonMaterialsTab
                    role={role}
                />
            )}

            {activeSection === 'orders' && (
                <CommonOrdersTab
                    role={role}
                    storeId={storeId}
                />
            )}

            {activeSection === 'stock' && (
                <StockTab
                    role={role}
                    storeId={storeId}
                    stores={stores.list}
                    onSelectStore={setStoreId}
                />
            )}


            {activeSection === 'issue-return' && (

                <IssueReturnTab
                    role={role}
                    storeId={storeId}
                />

            )}



            {activeSection === 'batch-planning' && (

                <BatchPlanningPage />

            )}

            {activeSection === 'suppliers' && (

                <SuppliersPage />

            )}

        </div>

    )

}