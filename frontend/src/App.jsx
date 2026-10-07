import ConfirmProvider from './components/ConfirmProvider'
import {
  BrowserRouter,
} from 'react-router-dom'

import {
  AuthProvider,
} from './context/AuthProvider'

import {
  WorkspaceProvider,
} from './context/WorkspaceContext'

import AppRoutes from './routes/AppRoutes'

import './cmhp-reference.css'


export default function App() {

  return (
    <BrowserRouter>
      <ConfirmProvider>

      <AuthProvider>

        <WorkspaceProvider>

          <AppRoutes />

        </WorkspaceProvider>

      </AuthProvider>

      </ConfirmProvider>
    </BrowserRouter>
  )
}