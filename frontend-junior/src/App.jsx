import {
  BrowserRouter,
} from 'react-router-dom'

import {
  AuthProvider,
} from './context/AuthProvider'

import {
  WorkspaceProvider,
} from './context/WorkspaceContext'

import AppRoutes
  from './routes/AppRoutes'

import ConfirmProvider from './components/ConfirmProvider'
import ErrorBoundary
  from './components/ErrorBoundary'

import ToastContainer
  from './components/ToastContainer'

import NotificationCenter
  from './components/NotificationCenter'

import './cmhp-reference.css'


export default function App() {

  return (

    <BrowserRouter>

      <ErrorBoundary>

        <ConfirmProvider>

          <AuthProvider>

            <WorkspaceProvider>

              <AppRoutes />

              <ToastContainer />

              <NotificationCenter />

            </WorkspaceProvider>

          </AuthProvider>

        </ConfirmProvider>

      </ErrorBoundary>

    </BrowserRouter>

  )

}