import { useState } from 'react'

import useAuth from '../../hooks/useAuth'

import Input from '../../components/Input'
import PasswordInput from '../../components/PasswordInput'
import Button from '../../components/Button'
import Alert from '../../components/Alert'

import {
  UserIcon,
  LockIcon,
  ArrowRightIcon,
} from '../../components/icons'

import LoginBackground from './LoginBackground'
import PharmacyScene from './PharmacyScene'

import {
  getErrorMessage,
} from '../../utils/errors'

import './Login.css'


export default function Login() {

  const {
    login,
  } = useAuth()


  const [
    username,
    setUsername,
  ] = useState('')


  const [
    password,
    setPassword,
  ] = useState('')


  const [
    error,
    setError,
  ] = useState('')


  const [
    loading,
    setLoading,
  ] = useState(false)


  const handleSubmit =
    async (e) => {

      e.preventDefault()

      setError('')

      setLoading(true)


      try {

        await login(
          username.trim(),
          password
        )

      } catch (err) {

        setError(
          getErrorMessage(err)
        )

      } finally {

        setLoading(false)

      }

    }


  return (

    <div className="login-page">

      <LoginBackground />


      <div className="login-stage">

        <div className="login-shell">


          {/* =================================================
              LOGIN FORM
              NO COMPANY LOGO
              ================================================= */}

          <section className="login-form-side">

            <div className="login-form-body">

              <h1>
                Welcome back
              </h1>


              <p className="login-subtitle">
                Sign in to access your workspace.
              </p>


              <Alert type="error">
                {error}
              </Alert>


              <form
                onSubmit={handleSubmit}
              >

                <Input
                  id="username"
                  label="Username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  icon={<UserIcon />}
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      e.target.value
                    )
                  }
                  autoFocus
                  required
                />


                <PasswordInput
                  id="password"
                  label="Password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  icon={<LockIcon />}
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  required
                />


                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  loadingText="Signing in..."
                >

                  Sign In

                  <ArrowRightIcon />

                </Button>

              </form>


              <p className="login-help">

                Forgot your password?
                Please contact your system administrator.

              </p>

            </div>


            <p className="login-copy">

              © {new Date().getFullYear()}
              {' '}
              CMHP Pharma.
              Authorized personnel only.

            </p>

          </section>


          {/* =================================================
              LOGIN ART
              ================================================= */}

          <section className="login-art">

            <PharmacyScene />


            <div className="art-chip art-chip-top">

              <span className="art-chip-dot" />

              Real-time inventory

            </div>


            <div className="art-chip art-chip-bottom">

              <span className="art-chip-dot art-chip-dot-blue" />

              Role-based secure access

            </div>

          </section>

        </div>

      </div>

    </div>

  )
}