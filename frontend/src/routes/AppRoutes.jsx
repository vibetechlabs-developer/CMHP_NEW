import {
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import ProtectedRoute
  from './ProtectedRoute'

import PublicRoute
  from './PublicRoute'

import MainLayout
  from '../Layouts/MainLayout'

import Login
  from '../features/auth/Login'

import ModuleNotConnected from '../components/ModuleNotConnected'
import FormulasPage from '../features/formulas/FormulasPage'
import Dashboard
  from '../features/dashboard/Dashboard'

import StoreMaterialsWorkspace from '../features/store/StoreMaterialsWorkspace'

import Companies
  from '../features/companies/Companies'

import OrganizationSetupPage
  from '../features/organizationSetup/OrganizationSetupPage'

import Operations
  from '../features/operations/Operations'

import Orders
  from '../features/operations/Orders'

import Quality
  from '../features/quality/Quality'

import Invoice
  from '../features/invoice/Invoice'

import SupplyChain
  from '../features/supplyChain/SupplyChain'

import WorkspaceSelection
  from '../features/workspace/WorkspaceSelection'

import HrDashboard
  from '../features/hrms/HrDashboard'

import Employees
  from '../features/hrms/Employees'

import Attendance
  from '../features/hrms/Attendance'

import Leave
  from '../features/hrms/Leave'

import Holidays
  from '../features/hrms/Holidays'

import Shifts
  from '../features/hrms/Shifts'

import Designations
  from '../features/hrms/Designations'

import Payroll
  from '../features/hrms/Payroll'

import HrReports
  from '../features/hrms/HrReports'

import Profile
  from '../features/profile/Profile'


// Designed pages with sample data for the sidebar modules marked "Coming soon".
const SHOW_DEMO_MODULES = true

export default function AppRoutes() {

  return (

    <Routes>

      {/* ROOT */}

      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />


      {/* PUBLIC */}

      <Route
        element={
          <PublicRoute />
        }
      >

        <Route
          path="/login"
          element={
            <Login />
          }
        />

      </Route>


      {/* PROTECTED */}

      <Route
        element={
          <ProtectedRoute />
        }
      >

        <Route
          path="/workspace-select"
          element={
            <WorkspaceSelection />
          }
        />


        <Route
          element={
            <MainLayout />
          }
        >

          {/* PROFILE */}

          <Route
            path="/profile"
            element={
              <Profile />
            }
          />


          {/* DASHBOARD */}

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />


          {/* USER MANAGEMENT */}

          <Route
            path="/companies"
            element={
              <Companies />
            }
          />


          {/* ORGANIZATION SETUP - reachable with zero company/store
              membership; the page itself gates on the real
              can_manage_organization_setup capability, not on workspace
              state (see ProtectedRoute.jsx, which already lets a
              zero-membership user reach any route). */}

          <Route
            path="/organization-setup"
            element={
              <OrganizationSetupPage />
            }
          />


          {/* FORMULAS */}

          <Route
            path="/formulas"
            element={
              <FormulasPage />
            }
          />


          {/* INVENTORY */}

          <Route
            path="/inventory/*"
            element={
              <StoreMaterialsWorkspace />
            }
          />


          {/* OPERATIONS */}

          <Route
            path="/operations"
            element={
              <Operations />
            }
          />


          <Route
            path="/orders"
            element={
              <Orders />
            }
          />


          <Route
            path="/quality"
            element={
              SHOW_DEMO_MODULES ? <Quality /> : <ModuleNotConnected name="Quality control" />
            }
          />


          <Route
            path="/invoices"
            element={
              SHOW_DEMO_MODULES ? <Invoice /> : <ModuleNotConnected name="Invoicing" />
            }
          />


          <Route
            path="/supply-chain"
            element={
              SHOW_DEMO_MODULES ? <SupplyChain /> : <ModuleNotConnected name="Supply chain" />
            }
          />

          <Route
            path="/customer-management"
            element={
              <Operations
                key="customers"
                standaloneCustomers
              />
            }
          />

          <Route
            path="/products"
            element={
              <Operations
                key="products"
                standaloneProducts
              />
            }
          />


          {/* HRMS */}

          <Route
            path="/hrms"
            element={
              SHOW_DEMO_MODULES ? <HrDashboard /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/employees"
            element={
              SHOW_DEMO_MODULES ? <Employees /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/attendance"
            element={
              SHOW_DEMO_MODULES ? <Attendance /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/leave"
            element={
              SHOW_DEMO_MODULES ? <Leave /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/holidays"
            element={
              SHOW_DEMO_MODULES ? <Holidays /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/shifts"
            element={
              SHOW_DEMO_MODULES ? <Shifts /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/designations"
            element={
              SHOW_DEMO_MODULES ? <Designations /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/payroll"
            element={
              SHOW_DEMO_MODULES ? <Payroll /> : <ModuleNotConnected name="HR" />
            }
          />


          <Route
            path="/hrms/reports"
            element={
              SHOW_DEMO_MODULES ? <HrReports /> : <ModuleNotConnected name="HR" />
            }
          />

        </Route>

      </Route>


      {/* FALLBACK */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />

    </Routes>

  )

}