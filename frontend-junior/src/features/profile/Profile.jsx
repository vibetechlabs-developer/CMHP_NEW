import {
  useEffect,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import Alert
  from '../../components/Alert'

import Button
  from '../../components/Button'

import Input
  from '../../components/Input'

import useAuth
  from '../../hooks/useAuth'

import {
  profileService,
} from './profileService'

import {
  getErrorMessage,
} from '../../utils/errors'

import './Profile.css'


export default function Profile() {

  const {
    user,
    updateCurrentUser,
  } = useAuth()


  const navigate =
    useNavigate()


  const [
    form,
    setForm,
  ] = useState({

    first_name: '',
    last_name: '',
    email: '',
    phone: '',

  })


  const [
    passwordForm,
    setPasswordForm,
  ] = useState({

    currentPassword: '',
    newPassword: '',
    confirmPassword: '',

  })


  const [
    savingProfile,
    setSavingProfile,
  ] = useState(false)


  const [
    changingPassword,
    setChangingPassword,
  ] = useState(false)


  const [
    error,
    setError,
  ] = useState('')


  const [
    success,
    setSuccess,
  ] = useState('')


  useEffect(() => {

    setForm({

      first_name:
        user?.first_name ||
        '',

      last_name:
        user?.last_name ||
        '',

      email:
        user?.email ||
        '',

      phone:
        user?.profile?.phone ||
        '',

    })

  }, [user])


  const handleProfileChange =
    (event) => {

      const {
        name,
        value,
      } =
        event.target


      setForm(
        (current) => ({

          ...current,

          [name]:
            value,

        })
      )

    }


  const handlePasswordChange =
    (event) => {

      const {
        name,
        value,
      } =
        event.target


      setPasswordForm(
        (current) => ({

          ...current,

          [name]:
            value,

        })
      )

    }


  const saveProfile =
    async (event) => {

      event.preventDefault()

      setSavingProfile(true)

      setError('')

      setSuccess('')


      try {

        await profileService
          .updateOwnProfile(

            user.id,

            form

          )


        const updatedUser = {

          ...user,

          first_name:
            form.first_name.trim(),

          last_name:
            form.last_name.trim(),

          email:
            form.email.trim(),

          profile: {

            ...user.profile,

            full_name:
              `${form.first_name.trim()} ${form.last_name.trim()}`
                .trim() ||
              user.username,

            phone:
              form.phone.trim(),

          },

        }


        updateCurrentUser(
          updatedUser
        )


        setSuccess(
          'Profile updated successfully.'
        )


      } catch (err) {

        setError(
          getErrorMessage(err)
        )

      } finally {

        setSavingProfile(false)

      }

    }


  const changePassword =
    async (event) => {

      event.preventDefault()

      setChangingPassword(true)

      setError('')

      setSuccess('')


      try {

        if (
          passwordForm.newPassword !==
          passwordForm.confirmPassword
        ) {

          throw new Error(
            'New password and confirm password do not match.'
          )

        }


        if (
          passwordForm.newPassword.length <
          8
        ) {

          throw new Error(
            'New password must contain at least 8 characters.'
          )

        }


        await profileService
          .changeOwnPassword(

            user.id,

            passwordForm.currentPassword,

            passwordForm.newPassword

          )


        setPasswordForm({

          currentPassword: '',
          newPassword: '',
          confirmPassword: '',

        })


        setSuccess(
          'Password changed successfully.'
        )


      } catch (err) {

        setError(
          getErrorMessage(err)
        )

      } finally {

        setChangingPassword(false)

      }

    }


  const fullName =
    `${user?.first_name || ''} ${user?.last_name || ''}`
      .trim() ||
    user?.username ||
    'User'


  const initial =
    fullName
      .charAt(0)
      .toUpperCase()


  return (

    <div className="profile-page">

      <div className="profile-header">

        <div>

          <span className="profile-eyebrow">
            My Account
          </span>

          <h1>
            My Profile
          </h1>

          <p>
            View and update your personal account
            information.
          </p>

        </div>


        <div className="profile-avatar-large">
          {initial}
        </div>

      </div>


      {error && (

        <Alert type="error">
          {error}
        </Alert>

      )}


      {success && (

        <Alert type="success">
          {success}
        </Alert>

      )}


      <div className="profile-grid">

        {/* PERSONAL INFORMATION */}

        <section className="profile-card">

          <div className="profile-card-header">

            <div>

              <span className="profile-card-kicker">
                Personal Information
              </span>

              <h2>
                Account Details
              </h2>

            </div>

          </div>


          <form
            onSubmit={saveProfile}
            className="profile-form"
          >

            <div className="profile-form-grid">

              <Input
                label="First Name"
                name="first_name"
                value={
                  form.first_name
                }
                onChange={
                  handleProfileChange
                }
                required
              />


              <Input
                label="Last Name"
                name="last_name"
                value={
                  form.last_name
                }
                onChange={
                  handleProfileChange
                }
              />


              <Input
                label="Email"
                name="email"
                type="email"
                value={
                  form.email
                }
                onChange={
                  handleProfileChange
                }
              />


              <Input
                label="Phone"
                name="phone"
                value={
                  form.phone
                }
                onChange={
                  handleProfileChange
                }
              />


              <Input
                label="Username"
                value={
                  user?.username ||
                  ''
                }
                disabled
              />


              <Input
                label="Employee ID"
                value={
                  user?.profile?.employee_id ||
                  ''
                }
                disabled
              />


              <Input
                label="Designation"
                value={
                  user?.profile?.designation ||
                  ''
                }
                disabled
              />


              <Input
                label="Role"
                value={
                  user?.profile?.role_label ||
                  user?.profile?.role ||
                  ''
                }
                disabled
              />

            </div>


            <div className="profile-readonly-note">

              <strong>
                Designation is controlled by Admin/HR.
              </strong>

              <span>
                You cannot change your own designation
                from your profile.
              </span>

            </div>


            <div className="profile-actions">

              <Button
                type="submit"
                loading={
                  savingProfile
                }
                loadingText="Saving..."
              >
                Save Profile
              </Button>


              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(-1)
                }
              >
                Back
              </Button>

            </div>

          </form>

        </section>


        {/* PASSWORD */}

        <section className="profile-card">

          <div className="profile-card-header">

            <div>

              <span className="profile-card-kicker">
                Security
              </span>

              <h2>
                Change Password
              </h2>

            </div>

          </div>


          <form
            onSubmit={changePassword}
            className="profile-form"
          >

            <Input
              label="Current Password"
              name="currentPassword"
              type="password"
              value={
                passwordForm.currentPassword
              }
              onChange={
                handlePasswordChange
              }
              required
            />


            <Input
              label="New Password"
              name="newPassword"
              type="password"
              value={
                passwordForm.newPassword
              }
              onChange={
                handlePasswordChange
              }
              minLength="8"
              required
            />


            <Input
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={
                passwordForm.confirmPassword
              }
              onChange={
                handlePasswordChange
              }
              minLength="8"
              required
            />


            <div className="profile-password-help">

              Password must contain at least
              8 characters.

            </div>


            <div className="profile-actions">

              <Button
                type="submit"
                loading={
                  changingPassword
                }
                loadingText="Changing..."
              >
                Change Password
              </Button>

            </div>

          </form>

        </section>

      </div>

    </div>

  )

}