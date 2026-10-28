import { useEffect, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'

import { getErrorMessage } from '../../../utils/errors'

import Modal from '../../inventory/components/Modal'

import { companyService } from '../companyService'


const emptyForm = {
  name: '',
  code: '',
}


export default function DepartmentsTab() {

  const [departments, setDepartments] =
    useState([])

  const [form, setForm] =
    useState(emptyForm)

  const [editing, setEditing] =
    useState(null)

  const [modalOpen, setModalOpen] =
    useState(false)

  const [error, setError] =
    useState('')

  const [saving, setSaving] =
    useState(false)


  const load = async () => {

    try {

      const response =
        await companyService.getDepartments()

      setDepartments(
        response.data
      )

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    }

  }


  useEffect(() => {

    load()

  }, [])


  const openCreate = () => {

    setEditing(null)

    setForm(emptyForm)

    setError('')

    setModalOpen(true)

  }


  const openEdit = (department) => {

    setEditing(department)

    setForm({
      name: department.name,
      code: department.code,
    })

    setError('')

    setModalOpen(true)

  }


  const save = async (event) => {

    event.preventDefault()

    setSaving(true)
    setError('')

    try {

      if (editing) {

        await companyService.updateDepartment(
          editing.id,
          form
        )

      } else {

        await companyService.createDepartment(
          form
        )

      }

      setModalOpen(false)

      await load()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    } finally {

      setSaving(false)

    }

  }


  const changeStatus = async (
    department
  ) => {

    const action =
      department.is_active
        ? 'deactivate'
        : 'reactivate'


    if (
      !window.confirm(
        `Are you sure you want to ${action} ${department.name}?`
      )
    ) {
      return
    }


    setError('')


    try {

      if (department.is_active) {

        await companyService
          .deactivateDepartment(
            department.id
          )

      } else {

        await companyService
          .reactivateDepartment(
            department.id
          )

      }

      await load()

    } catch (err) {

      setError(
        getErrorMessage(err)
      )

    }

  }


  return (

    <section className="company-panel">

      <div className="company-toolbar">

        <div>

          <h2>
            Departments
          </h2>

          <p>
            Maintain department names
            and codes. Departments are
            never hard deleted.
          </p>

        </div>


        <Button
          onClick={openCreate}
        >
          + Add department
        </Button>

      </div>


      <Alert type="error">
        {!modalOpen ? error : ''}
      </Alert>


      <div className="company-table-wrap">

        <table className="company-table">

          <thead>

            <tr>
              <th>Department</th>
              <th>Code</th>
              <th>Status</th>
              <th className="company-actions">
                Actions
              </th>
            </tr>

          </thead>


          <tbody>

            {departments.map(
              (department) => (

                <tr key={department.id}>

                  <td>
                    <strong>
                      {department.name}
                    </strong>
                  </td>


                  <td>

                    <span className="company-code">
                      {department.code}
                    </span>

                  </td>


                  <td>

                    <span
                      className={
                        `company-status ${
                          department.is_active
                            ? 'active'
                            : 'inactive'
                        }`
                      }
                    >
                      {
                        department.is_active
                          ? 'Active'
                          : 'Inactive'
                      }
                    </span>

                  </td>


                  <td className="company-actions">

                    <button
                      type="button"
                      className="table-edit"
                      onClick={() =>
                        openEdit(
                          department
                        )
                      }
                    >
                      Edit
                    </button>


                    <button
                      type="button"
                      className={
                        department.is_active
                          ? 'company-link danger'
                          : 'company-link'
                      }
                      onClick={() =>
                        changeStatus(
                          department
                        )
                      }
                    >
                      {
                        department.is_active
                          ? 'Deactivate'
                          : 'Reactivate'
                      }
                    </button>

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>


        {departments.length === 0 && (

          <p className="company-empty">
            No departments are available yet.
          </p>

        )}

      </div>


      {modalOpen && (

        <Modal
          title={
            editing
              ? 'Edit department'
              : 'Add department'
          }

          onClose={() =>
            setModalOpen(false)
          }

          footer={

            <>

              <Button
                variant="secondary"
                onClick={() =>
                  setModalOpen(false)
                }
              >
                Cancel
              </Button>


              <Button
                loading={saving}
                onClick={save}
              >
                {
                  editing
                    ? 'Save changes'
                    : 'Create department'
                }
              </Button>

            </>

          }
        >

          <Alert type="error">
            {error}
          </Alert>


          <form onSubmit={save}>

            <div className="company-form-grid">

              <Input
                label="Department name"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                required
              />


              <Input
                label="Department code"
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code:
                      e.target.value.toUpperCase(),
                  })
                }
                required
              />

            </div>

          </form>

        </Modal>

      )}

    </section>

  )
}