import { store } from '../../store/store'
import { delay } from '../../store/mockApi'

import {
    addUser,
    editUserAccess,
    setUserStatus,

    addDesignation,
    editDesignation,
    deleteDesignation,
    setDesignationStatus,

    addShift,
    editShift,
    deleteShift,
    setShiftStatus,

    addHoliday,
    editHoliday,
    deleteHoliday,

    addLeaveType,
    editLeaveType,
    deleteLeaveType,
    setLeaveTypeStatus,

    checkIn,
    checkOut,
    markAttendance,
    editAttendance,
    deleteAttendance,

    applyLeave,
    decideLeave,
    cancelLeave,
    deleteLeaveRequest,

    addSalaryStructure,
    editSalaryStructure,
    deleteSalaryStructure,
} from '../../store/erpSlice'

import {
    getScopedCompanyId,
    enforceCompanyPayload,
} from '../../utils/companyScope'


const ROLE_LABELS = {
    SUPER_ADMIN: 'Super Admin',
    MANAGEMENT: 'Management',
    HR_ADMINISTRATOR: 'HR Administrator',
    HR_MANAGER: 'HR Manager',
    DEPARTMENT_MANAGER: 'Department Manager',
    STORES_MANAGER: 'Stores Manager',
    STORES_USER: 'Stores User',
    EMPLOYEE: 'Employee',
    VIEWER: 'Viewer',
}


// ===========================================================================
// SCOPE HELPERS
// ===========================================================================

function getCompanyId() {

    const companyId =
        getScopedCompanyId()

    if (!companyId) {
        throw new Error(
            'No active company is selected.'
        )
    }

    return Number(companyId)
}


function inScope(
    companyId
) {

    const activeCompanyId =
        getCompanyId()

    return (
        Number(companyId) ===
        Number(activeCompanyId)
    )
}


function today() {
    return new Date()
        .toISOString()
        .slice(0, 10)
}


// ===========================================================================
// HYDRATION
// ===========================================================================

function hydrateEmployee(
    user,
    state
) {

    const company =
        state.companies.find(
            (c) =>
                Number(c.id) ===
                Number(
                    user.primary_company
                )
        ) || null


    const department =
        state.departments.find(
            (d) =>
                Number(d.id) ===
                Number(
                    user.department
                )
        ) || null


    const shift =
        state.shifts.find(
            (s) =>
                Number(s.id) ===
                Number(
                    user.shift
                )
        ) || null


    const manager =
        state.users.find(
            (u) =>
                Number(u.id) ===
                Number(
                    user.reporting_manager
                )
        ) || null


    return {

        ...user,

        role_label:
            ROLE_LABELS[
                user.role
            ] ||
            user.role,

        company,

        department,

        shift,

        reporting_manager_name:
            manager
                ? (
                    `${manager.first_name || ''} ${manager.last_name || ''}`
                ).trim() ||
                  manager.username
                : null,

        display_name:
            (
                `${user.first_name || ''} ${user.last_name || ''}`
            ).trim() ||
            user.username,

    }
}


function hydrateAttendance(
    record,
    state
) {

    const employee =
        state.users.find(
            (u) =>
                Number(u.id) ===
                Number(record.user)
        )


    return {

        ...record,

        employee_name:
            employee
                ? (
                    `${employee.first_name || ''} ${employee.last_name || ''}`
                ).trim() ||
                  employee.username
                : `Employee #${record.user}`,

        employee_code:
            employee?.employee_id ||
            '',

    }
}


function hydrateLeave(
    record,
    state
) {

    const employee =
        state.users.find(
            (u) =>
                Number(u.id) ===
                Number(record.user)
        )


    const leaveType =
        state.leaveTypes.find(
            (t) =>
                Number(t.id) ===
                Number(
                    record.leave_type
                )
        )


    return {

        ...record,

        employee_name:
            employee
                ? (
                    `${employee.first_name || ''} ${employee.last_name || ''}`
                ).trim() ||
                  employee.username
                : `Employee #${record.user}`,

        employee_code:
            employee?.employee_id ||
            '',

        leave_type_name:
            leaveType?.name ||
            '—',

    }
}


// ===========================================================================
// EMPLOYEE COMPANY VALIDATION
// ===========================================================================

function assertEmployeeCompany(
    id
) {

    const state =
        store.getState().erp

    const companyId =
        getCompanyId()


    const employee =
        state.users.find(
            (user) =>
                Number(user.id) ===
                Number(id)
        )


    if (
        !employee ||
        Number(
            employee.primary_company
        ) !==
        Number(companyId)
    ) {

        throw new Error(
            'This employee does not belong to the active company.'
        )

    }


    return employee
}


// ===========================================================================
// GENERIC COMPANY RECORD VALIDATION
// ===========================================================================

function assertCompanyRecord(
    collection,
    id
) {

    const state =
        store.getState().erp

    const companyId =
        getCompanyId()


    const record =
        (
            Array.isArray(
                state[collection]
            )
                ? state[collection]
                : []
        ).find(
            (row) =>
                Number(row.id) ===
                Number(id)
        )


    if (
        !record ||
        Number(record.company) !==
        Number(companyId)
    ) {

        throw new Error(
            'This record does not belong to the active company.'
        )

    }


    return record
}


// ===========================================================================
// SERVICE
// ===========================================================================

export const hrService = {

    // =========================================================================
    // EMPLOYEES
    // =========================================================================

    getEmployees() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.users

                .filter(
                    (user) =>
                        Number(
                            user.primary_company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .map(
                    (user) =>
                        hydrateEmployee(
                            user,
                            state
                        )
                )


        return delay(rows)
    },


    getEmployee(
        id
    ) {

        const state =
            store.getState().erp

        const employee =
            assertEmployeeCompany(
                id
            )


        return delay(
            hydrateEmployee(
                employee,
                state
            )
        )
    },


    createEmployee(
        payload
    ) {

        /*
         * IMPORTANT:
         *
         * The company submitted by the form
         * is ignored.
         *
         * Current workspace decides company.
         */
        const scoped =
            enforceCompanyPayload(
                payload
            )


        const companyId =
            Number(
                scoped.company
            )


        store.dispatch(
            addUser({

                ...payload,

                /*
                 * Employee is locked to
                 * current company.
                 */
                primary_company:
                    companyId,

                companies:
                    [
                        companyId,
                    ],

                is_active:
                    true,

            })
        )


        return delay(null)
    },


    updateEmployee(
        id,
        payload
    ) {

        assertEmployeeCompany(
            id
        )


        const companyId =
            getCompanyId()


        const patch = {
            ...payload,

            primary_company:
                Number(
                    companyId
                ),

            companies:
                [
                    Number(
                        companyId
                    ),
                ],
        }


        /*
         * Company cannot be changed
         * through employee edit.
         */
        delete patch.company


        store.dispatch(
            editUserAccess({

                id,

                payload:
                    patch,

            })
        )


        return delay(null)
    },


    deactivateEmployee(
        id
    ) {

        assertEmployeeCompany(
            id
        )

        store.dispatch(
            setUserStatus({

                id,

                is_active:
                    false,

            })
        )

        return delay(null)
    },


    reactivateEmployee(
        id
    ) {

        assertEmployeeCompany(
            id
        )

        store.dispatch(
            setUserStatus({

                id,

                is_active:
                    true,

            })
        )

        return delay(null)
    },


    // =========================================================================
    // DESIGNATIONS
    // =========================================================================

    getDesignations() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.designations
                .filter(
                    (designation) =>
                        Number(
                            designation.company
                        ) ===
                        Number(
                            companyId
                        )
                )


        return delay(rows)
    },


    createDesignation(
        payload
    ) {

        store.dispatch(
            addDesignation(
                enforceCompanyPayload(
                    payload
                )
            )
        )

        return delay(null)
    },


    updateDesignation(
        id,
        payload
    ) {

        assertCompanyRecord(
            'designations',
            id
        )


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editDesignation({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    deactivateDesignation(
        id
    ) {

        assertCompanyRecord(
            'designations',
            id
        )

        store.dispatch(
            setDesignationStatus({

                id,

                is_active:
                    false,

            })
        )

        return delay(null)
    },


    reactivateDesignation(
        id
    ) {

        assertCompanyRecord(
            'designations',
            id
        )

        store.dispatch(
            setDesignationStatus({

                id,

                is_active:
                    true,

            })
        )

        return delay(null)
    },


    deleteDesignation(
        id
    ) {

        assertCompanyRecord(
            'designations',
            id
        )

        store.dispatch(
            deleteDesignation({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // SHIFTS
    // =========================================================================

    getShifts() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.shifts.filter(
                (shift) =>
                    Number(
                        shift.company
                    ) ===
                    Number(
                        companyId
                    )
            )


        return delay(rows)
    },


    createShift(
        payload
    ) {

        store.dispatch(
            addShift(
                enforceCompanyPayload(
                    payload
                )
            )
        )

        return delay(null)
    },


    updateShift(
        id,
        payload
    ) {

        assertCompanyRecord(
            'shifts',
            id
        )


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editShift({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    deactivateShift(
        id
    ) {

        assertCompanyRecord(
            'shifts',
            id
        )

        store.dispatch(
            setShiftStatus({

                id,

                is_active:
                    false,

            })
        )

        return delay(null)
    },


    reactivateShift(
        id
    ) {

        assertCompanyRecord(
            'shifts',
            id
        )

        store.dispatch(
            setShiftStatus({

                id,

                is_active:
                    true,

            })
        )

        return delay(null)
    },


    deleteShift(
        id
    ) {

        assertCompanyRecord(
            'shifts',
            id
        )

        store.dispatch(
            deleteShift({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // HOLIDAYS
    // =========================================================================

    getHolidays() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.holidays

                .filter(
                    (holiday) =>
                        Number(
                            holiday.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .slice()

                .sort(
                    (a, b) =>
                        new Date(a.date) -
                        new Date(b.date)
                )


        return delay(rows)
    },


    createHoliday(
        payload
    ) {

        store.dispatch(
            addHoliday(
                enforceCompanyPayload(
                    payload
                )
            )
        )

        return delay(null)
    },


    updateHoliday(
        id,
        payload
    ) {

        assertCompanyRecord(
            'holidays',
            id
        )


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editHoliday({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    deleteHoliday(
        id
    ) {

        assertCompanyRecord(
            'holidays',
            id
        )

        store.dispatch(
            deleteHoliday({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // LEAVE TYPES
    // =========================================================================

    getLeaveTypes() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.leaveTypes.filter(
                (leaveType) =>
                    Number(
                        leaveType.company
                    ) ===
                    Number(
                        companyId
                    )
            )


        return delay(rows)
    },


    createLeaveType(
        payload
    ) {

        store.dispatch(
            addLeaveType(
                enforceCompanyPayload(
                    payload
                )
            )
        )

        return delay(null)
    },


    updateLeaveType(
        id,
        payload
    ) {

        assertCompanyRecord(
            'leaveTypes',
            id
        )


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editLeaveType({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    deactivateLeaveType(
        id
    ) {

        assertCompanyRecord(
            'leaveTypes',
            id
        )

        store.dispatch(
            setLeaveTypeStatus({

                id,

                is_active:
                    false,

            })
        )

        return delay(null)
    },


    reactivateLeaveType(
        id
    ) {

        assertCompanyRecord(
            'leaveTypes',
            id
        )

        store.dispatch(
            setLeaveTypeStatus({

                id,

                is_active:
                    true,

            })
        )

        return delay(null)
    },


    deleteLeaveType(
        id
    ) {

        assertCompanyRecord(
            'leaveTypes',
            id
        )

        store.dispatch(
            deleteLeaveType({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // ATTENDANCE
    // =========================================================================

    getMyTodayAttendance(
        userId
    ) {

        const state =
            store.getState().erp

        const employee =
            assertEmployeeCompany(
                userId
            )


        const record =
            state.attendance.find(
                (record) =>
                    Number(
                        record.user
                    ) ===
                    Number(
                        employee.id
                    ) &&
                    record.date ===
                    today() &&
                    inScope(
                        record.company
                    )
            )


        return delay(
            record ||
            null
        )
    },


    getMyAttendanceHistory(
        userId,
        limit = 14
    ) {

        const state =
            store.getState().erp

        const employee =
            assertEmployeeCompany(
                userId
            )


        const rows =
            state.attendance

                .filter(
                    (record) =>
                        Number(
                            record.user
                        ) ===
                        Number(
                            employee.id
                        )
                )

                .filter(
                    (record) =>
                        inScope(
                            record.company
                        )
                )

                .slice()

                .sort(
                    (a, b) =>
                        new Date(b.date) -
                        new Date(a.date)
                )

                .slice(
                    0,
                    limit
                )


        return delay(rows)
    },


    doCheckIn({
        user,
        company,
        shift,
    }) {

        const employee =
            assertEmployeeCompany(
                user
            )


        const companyId =
            getCompanyId()


        store.dispatch(
            checkIn({

                user:
                    employee.id,

                company:
                    companyId,

                shift,

            })
        )


        return delay(null)
    },


    doCheckOut({
        user,
    }) {

        const employee =
            assertEmployeeCompany(
                user
            )


        store.dispatch(
            checkOut({
                user:
                    employee.id,
            })
        )


        return delay(null)
    },


    getAttendanceForDate(
        date
    ) {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const employees =
            state.users

                .filter(
                    (user) =>
                        user.is_active
                )

                .filter(
                    (user) =>
                        Number(
                            user.primary_company
                        ) ===
                        Number(
                            companyId
                        )
                )


        const rows =
            employees.map(
                (employee) => {

                    const record =
                        state.attendance.find(
                            (attendance) =>
                                Number(
                                    attendance.user
                                ) ===
                                Number(
                                    employee.id
                                ) &&
                                attendance.date ===
                                date &&
                                Number(
                                    attendance.company
                                ) ===
                                Number(
                                    companyId
                                )
                        )


                    return {

                        employee:
                            hydrateEmployee(
                                employee,
                                state
                            ),

                        attendance:
                            record
                                ? hydrateAttendance(
                                    record,
                                    state
                                )
                                : null,

                    }
                }
            )


        return delay(rows)
    },


    getAttendanceRange(
        from,
        to
    ) {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const visibleUsers =
            new Set(
                state.users

                    .filter(
                        (user) =>
                            Number(
                                user.primary_company
                            ) ===
                            Number(
                                companyId
                            )
                    )

                    .map(
                        (user) =>
                            Number(
                                user.id
                            )
                    )
            )


        const rows =
            state.attendance

                .filter(
                    (record) =>
                        record.date >=
                        from &&
                        record.date <=
                        to
                )

                .filter(
                    (record) =>
                        Number(
                            record.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .filter(
                    (record) =>
                        visibleUsers.has(
                            Number(
                                record.user
                            )
                        )
                )

                .map(
                    (record) =>
                        hydrateAttendance(
                            record,
                            state
                        )
                )


        return delay(rows)
    },


    markAttendance(
        payload
    ) {

        const scoped =
            enforceCompanyPayload(
                payload
            )


        store.dispatch(
            markAttendance(
                scoped
            )
        )

        return delay(null)
    },


    updateAttendance(
        id,
        payload
    ) {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const record =
            state.attendance.find(
                (attendance) =>
                    Number(
                        attendance.id
                    ) ===
                    Number(id)
            )


        if (
            !record ||
            Number(
                record.company
            ) !==
            Number(
                companyId
            )
        ) {

            throw new Error(
                'This attendance record does not belong to the active company.'
            )

        }


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editAttendance({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    removeAttendance(
        id
    ) {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const record =
            state.attendance.find(
                (attendance) =>
                    Number(
                        attendance.id
                    ) ===
                    Number(id)
            )


        if (
            !record ||
            Number(
                record.company
            ) !==
            Number(
                companyId
            )
        ) {

            throw new Error(
                'This attendance record does not belong to the active company.'
            )

        }


        store.dispatch(
            deleteAttendance({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // LEAVE REQUESTS
    // =========================================================================

    getMyLeaveRequests(
        userId
    ) {

        const state =
            store.getState().erp

        const employee =
            assertEmployeeCompany(
                userId
            )


        const companyId =
            getCompanyId()


        const rows =
            state.leaveRequests

                .filter(
                    (record) =>
                        Number(
                            record.user
                        ) ===
                        Number(
                            employee.id
                        )
                )

                .filter(
                    (record) =>
                        Number(
                            record.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .map(
                    (record) =>
                        hydrateLeave(
                            record,
                            state
                        )
                )

                .sort(
                    (a, b) =>
                        new Date(
                            b.applied_at
                        ) -
                        new Date(
                            a.applied_at
                        )
                )


        return delay(rows)
    },


    getLeaveRequests(
        statusFilter = null
    ) {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.leaveRequests

                .filter(
                    (record) =>
                        Number(
                            record.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .filter(
                    (record) =>
                        !statusFilter ||
                        record.status ===
                        statusFilter
                )

                .map(
                    (record) =>
                        hydrateLeave(
                            record,
                            state
                        )
                )

                .sort(
                    (a, b) =>
                        new Date(
                            b.applied_at
                        ) -
                        new Date(
                            a.applied_at
                        )
                )


        return delay(rows)
    },


    submitLeaveRequest(
        payload
    ) {

        const scoped =
            enforceCompanyPayload(
                payload
            )


        store.dispatch(
            applyLeave(
                scoped
            )
        )

        return delay(null)
    },


    decideLeaveRequest(
        id,
        status,
        decidedBy,
        decisionNote
    ) {

        const state =
            store.getState().erp

        assertCompanyRecord(
            'leaveRequests',
            id
        )


        store.dispatch(
            decideLeave({

                id,

                status,

                decided_by:
                    decidedBy,

                decision_note:
                    decisionNote,

            })
        )

        return delay(null)
    },


    cancelLeaveRequest(
        id
    ) {

        assertCompanyRecord(
            'leaveRequests',
            id
        )


        store.dispatch(
            cancelLeave({
                id,
            })
        )

        return delay(null)
    },


    removeLeaveRequest(
        id
    ) {

        assertCompanyRecord(
            'leaveRequests',
            id
        )


        store.dispatch(
            deleteLeaveRequest({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // SALARY STRUCTURE
    // =========================================================================

    getSalaryStructures() {

        const state =
            store.getState().erp

        const companyId =
            getCompanyId()


        const rows =
            state.salaryStructures

                .filter(
                    (salary) =>
                        Number(
                            salary.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .map(
                    (salary) => {

                        const employee =
                            state.users.find(
                                (user) =>
                                    Number(
                                        user.id
                                    ) ===
                                    Number(
                                        salary.user
                                    )
                            )


                        return {

                            ...salary,

                            employee_name:
                                employee
                                    ? (
                                        `${employee.first_name || ''} ${employee.last_name || ''}`
                                    ).trim() ||
                                      employee.username
                                    : `Employee #${salary.user}`,

                        }
                    }
                )


        return delay(rows)
    },


    createSalaryStructure(
        payload
    ) {

        store.dispatch(
            addSalaryStructure(
                enforceCompanyPayload(
                    payload
                )
            )
        )

        return delay(null)
    },


    updateSalaryStructure(
        id,
        payload
    ) {

        assertCompanyRecord(
            'salaryStructures',
            id
        )


        const safePayload = {
            ...payload,
        }

        delete safePayload.company


        store.dispatch(
            editSalaryStructure({

                id,

                payload:
                    safePayload,

            })
        )

        return delay(null)
    },


    removeSalaryStructure(
        id
    ) {

        assertCompanyRecord(
            'salaryStructures',
            id
        )


        store.dispatch(
            deleteSalaryStructure({
                id,
            })
        )

        return delay(null)
    },


    // =========================================================================
    // HR DASHBOARD
    // =========================================================================

    getDashboardSummary() {

        const state =
            store.getState().erp

        const todayStr =
            today()

        const companyId =
            getCompanyId()


        const employees =
            state.users
                .filter(
                    (user) =>
                        user.is_active
                )
                .filter(
                    (user) =>
                        Number(
                            user.primary_company
                        ) ===
                        Number(
                            companyId
                        )
                )


        const todaysAttendance =
            state.attendance

                .filter(
                    (record) =>
                        record.date ===
                        todayStr
                )

                .filter(
                    (record) =>
                        Number(
                            record.company
                        ) ===
                        Number(
                            companyId
                        )
                )


        const presentToday =
            todaysAttendance.filter(
                (record) =>
                    record.status ===
                        'PRESENT' ||
                    record.status ===
                        'LATE' ||
                    record.status ===
                        'WFH'
            ).length


        const onLeaveToday =
            state.leaveRequests.filter(
                (record) =>
                    record.status ===
                        'APPROVED' &&
                    Number(
                        record.company
                    ) ===
                        Number(
                            companyId
                        ) &&
                    record.from_date <=
                        todayStr &&
                    record.to_date >=
                        todayStr
            ).length


        const pendingLeaveApprovals =
            state.leaveRequests.filter(
                (record) =>
                    record.status ===
                        'PENDING' &&
                    Number(
                        record.company
                    ) ===
                        Number(
                            companyId
                        )
            ).length


        const upcomingHolidays =
            state.holidays

                .filter(
                    (holiday) =>
                        Number(
                            holiday.company
                        ) ===
                        Number(
                            companyId
                        )
                )

                .filter(
                    (holiday) =>
                        holiday.date >=
                        todayStr
                )

                .sort(
                    (a, b) =>
                        new Date(a.date) -
                        new Date(b.date)
                )

                .slice(
                    0,
                    5
                )


        return delay({

            total_employees:
                employees.length,

            /*
             * These two values are intentionally
             * scoped to the active company.
             *
             * Therefore Company A dashboard
             * never reports Company B employees.
             */
            company_a_employees:
                Number(companyId) === 1
                    ? employees.length
                    : 0,

            company_b_employees:
                Number(companyId) === 2
                    ? employees.length
                    : 0,

            present_today:
                presentToday,

            not_marked_today:
                Math.max(
                    employees.length -
                    todaysAttendance.length,
                    0
                ),

            on_leave_today:
                onLeaveToday,

            pending_leave_approvals:
                pendingLeaveApprovals,

            upcoming_holidays:

                upcomingHolidays,

        })
    },
}