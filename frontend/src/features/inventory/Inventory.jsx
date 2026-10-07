import { useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'

import OverviewTab from './tabs/OverviewTab'
import MaterialsTab from './tabs/MaterialsTab'
import LocationsTab from './tabs/LocationsTab'
import StockTab from './tabs/StockTab'
import IssueReturnTab from './tabs/IssueReturnTab'
import LedgerTab from './tabs/LedgerTab'

import './Inventory.css'


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


    const activeSection =
        activePath === '/inventory'
            ? 'overview'
            : activePath === '/inventory/stock'
                ? 'stock'
                : activePath === '/inventory/materials'
                    ? 'materials'
                    : activePath === '/inventory/locations'
                        ? 'locations'
                        : activePath === '/inventory/issue-return'
                            ? 'issue-return'
                            : activePath === '/inventory/ledger'
                                ? 'ledger'
                                : 'overview'


    /* =====================================================
       COMMON INVENTORY ACCESS
       ===================================================== */

    const canAccess =
        user?.is_superuser === true ||
        role === 'SUPER_ADMIN' ||
        user?.profile?.can_access_common_inventory === true


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

            <div className="inv-header">

                <div>

                    <h1>
                        Inventory
                    </h1>

                    <p>
                        Common Store &amp; Inventory — shared
                        across Company A and Company B.
                    </p>

                </div>

            </div>


            {/* =================================================
                ACTIVE SECTION CONTENT
                ================================================= */}

            {activeSection === 'overview' && (

                <OverviewTab />

            )}


            {activeSection === 'stock' && (

                <StockTab
                    role={role}
                />

            )}


            {activeSection === 'materials' && (

                <MaterialsTab
                    role={role}
                />

            )}


            {activeSection === 'locations' && (

                <LocationsTab
                    role={role}
                />

            )}


            {activeSection === 'issue-return' && (

                <IssueReturnTab />

            )}


            {activeSection === 'ledger' && (

                <LedgerTab />

            )}

        </div>

    )

}