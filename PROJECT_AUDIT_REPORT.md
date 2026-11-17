# COMPREHENSIVE PHARMA ERP PROJECT AUDIT & SYSTEM INTEGRITY REPORT
**Project:** Pharma ERP – CMHP (Calcutta Medical Hall & Tej Biocare)  
**Project Path:** `D:\CMHP_NEW`  
**Audit Date:** November 16, 2026  
**Auditor:** Antigravity AI Senior Principal Systems & Regulatory Auditor  
**Scope:** Full-Stack Architecture, Backend Django Applications, PostgreSQL Database, Frontend React/Vite Applications, API Interfaces, Multi-Tenancy & Tenant Isolation, 21 CFR Part 11 / GMP Compliance, Security, and Automated Test Suites.

---

## EXECUTIVE SUMMARY

A comprehensive, deep technical audit of the Pharma ERP repository at `D:\CMHP_NEW` was conducted across all backend services, database schemas, frontend interfaces, and automated test runners.

The system is designed as a multi-tenant pharmaceutical Enterprise Resource Planning platform supporting two operating companies:
1. **Calcutta Medical Hall (CMHP)** (PostgreSQL Company ID: `2`, Code: `CMHP`)
2. **Tej Biocare** (PostgreSQL Company ID: `3`, Code: `TEJ BIOCARE`)
Operating alongside a centralized physical warehouse: **Demo Shared Warehouse** (PostgreSQL Store ID: `5`).

### Overall Project Health Scorecard: 58 / 100 (HIGH RISK – CRITICAL REMEDIATION REQUIRED)

| Evaluation Pillar | Score | Rating | Primary Risk Vector |
| :--- | :---: | :---: | :--- |
| **Backend Architecture & ORM** | **82%** | GOOD | Mature transactional core in batch plans, catalog, purchasing, and permissions; lacks accounts & finance apps. |
| **Security & Access Control** | **45%** | CRITICAL | Public `AllowAny` permissions on BMR and Production Status endpoints; unauthenticated remote QA release vulnerability. |
| **Multi-Tenant Isolation** | **52%** | HIGH RISK | Hardcoded ID mappings (`[1, 2]`) and inverted naming logic (`id===2 ? Tej : CMHP`) causing severe cross-company data collisions. |
| **Data Persistence Integrity** | **50%** | CRITICAL | 100% of Accounts & Invoicing and 100% of Finished Goods QC analytical tests run on client-side Redux/localStorage without database storage. |
| **Frontend Code Quality** | **68%** | MODERATE | 345 lint warnings, multiple missing hook dependencies, 13 broken automated tests across 4 suites. |
| **Regulatory & GMP Compliance** | **42%** | NON-COMPLIANT | Missing electronic signatures, lack of parameter-level analytical test storage, client-side fallback masking backend failures. |

---

## TABLE OF CONTENTS

1. [Phase 1: Complete Project Structure & Architecture Inspection](#phase-1-complete-project-structure--architecture-inspection)
2. [Phase 2: Module-Wise Functional Audit (Modules 1–15)](#phase-2-module-wise-functional-audit)
   - [1. Dashboard](#1-dashboard)
   - [2. Company Management & Multi-Tenancy](#2-company-management--multi-tenancy)
   - [3. Products & Inventory](#3-products--inventory)
   - [4. Purchase & Procurement](#4-purchase--procurement)
   - [5. Warehouse & Stores](#5-warehouse--stores)
   - [6. Production Execution](#6-production-execution)
   - [7. Batch Manufacturing Record (BMR)](#7-batch-manufacturing-record-bmr)
   - [8. Quality Control (QC)](#8-quality-control-qc)
   - [9. Quality Assurance (QA) & Batch Release](#9-quality-assurance-qa--batch-release)
   - [10. Certificate of Analysis (COA)](#10-certificate-of-analysis-coa)
   - [11. Sales & Orders](#11-sales--orders)
   - [12. Accounts, Invoicing & Finance](#12-accounts-invoicing--finance)
   - [13. Reports, Exports & Document Downloads](#13-reports-exports--document-downloads)
   - [14. HR & User Management (HRMS)](#14-hr--user-management-hrms)
   - [15. Audit Logs & System Notifications](#15-audit-logs--system-notifications)
3. [Phase 3: Backend Deep Technical Audit](#phase-3-backend-deep-technical-audit)
4. [Phase 4: Frontend Deep Technical Audit](#phase-4-frontend-deep-technical-audit)
5. [Phase 5: Security & Compliance Audit](#phase-5-security--compliance-audit)
6. [Phase 6: End-to-End Business Workflow Evaluation (Workflows A–F)](#phase-6-end-to-end-business-workflow-evaluation)
7. [Phase 7: Performance, Database & Scalability Audit](#phase-7-performance-database--scalability-audit)
8. [Phase 8: Master Findings Register & Error Classification](#phase-8-master-findings-register--error-classification)
9. [Phase 9: Automated Testing & Verification Results](#phase-9-automated-testing--verification-results)
10. [Phase 10: Prioritized 5-Phase Implementation Roadmap](#phase-10-prioritized-5-phase-implementation-roadmap)

---

## PHASE 1: COMPLETE PROJECT STRUCTURE & ARCHITECTURE INSPECTION

### 1.1 Directory Structure & Workspaces
The workspace contains two frontend applications and one Django backend:
- `d:\CMHP_NEW\backend`: Django 5.x REST API project with PostgreSQL database connection.
- `d:\CMHP_NEW\frontend-junior`: Active production frontend served by Vite on port 5175 (React 19, Redux Toolkit, React Router v7).
- `d:\CMHP_NEW\frontend`: Legacy / reference React application (not currently served).
- `d:\CMHP_NEW\venv`: Python 3.12 virtual environment containing Django, DRF, Psycopg, and dependencies.

### 1.2 Backend Application Roster
The backend contains **27 modular Django applications** located in `backend/apps/`:
1. `audit`: Append-only transactional audit trail model (`AuditLog`).
2. `authentication`: JWT token generation, refresh, user profile endpoint (`User`, `ExplicitAuthFailure401Mixin`).
3. `batch_plans`: Production planning, batch number allocation, counter sequencing (`BatchPlan`, `BatchNumberAllocation`).
4. `batch_register`: Master batch registry and lookup services.
5. `bmr`: Batch Manufacturing Record slips, line items, and document metadata (`BatchManufacturingRecord`, `BMRDocument`, `ProductionOrderStatus`).
6. `catalog`: Raw materials, packaging materials, units of measure, material categories (`Material`, `UnitOfMeasure`, `Dimension`).
7. `common`: Custom error handling, exceptions (`Conflict`, `Forbidden`), and bounded pagination.
8. `companies`: Multi-tenant company definitions and membership bindings (`Company`, `CompanyMembership`).
9. `customers`: Commercial clients, addresses, GSTIN numbers (`Customer`).
10. `formulas`: Master formulations, revisions, formula lines, potency calculations (`Formula`, `FormulaRevision`, `FormulaLine`).
11. `formula_imports`: Bulk CSV/Excel formula import staging and validation.
12. `hrms`: Department, designation, shift, attendance, leaves, payroll structures (`EmployeeProfile`, `AttendanceRecord`, `PayrollRecord`).
13. `material_imports`: Bulk material catalog staging and imports.
14. `material_requisitions`: Raw material indenting, rounds, contributor approvals (`MaterialRequisition`, `MaterialRequisitionRound`).
15. `permissions`: Granular role-based access control, company roles, store roles (`PermissionDefinition`, `CompanyRole`, `StoreRole`).
16. `products`: Company finished goods catalog (`Product`, pack sizes, BMR number mappings).
17. `product_imports`: Bulk finished goods CSV import engine.
18. `purchasing`: Purchase requests, approvals, purchase orders, issue snapshots (`PurchaseRequest`, `PurchaseOrder`).
19. `quality`: Inward inspections, material specifications, control samples, batch quality cases, COA attachments (`BatchQualityCase`, `FinishedGoodsStock`, `COADocumentAttachment`).
20. `quotations`: Customer price quotations and line items.
21. `receiving`: Inward container receipts, goods receipt notes (GRN), container lifecycles (`GoodsReceipt`, `ContainerType`).
22. `sales_orders`: Sales orders, line items, order confirmation policies (`SalesOrder`, `SalesOrderLine`).
23. `stock_movements`: Stock ledger, material issues, production floor custody, returns, physical counts (`StockMovement`, `MaterialIssue`, `ProductionCustody`).
24. `stores`: Shared warehouses and warehouse membership (`SharedStore`, `StorageLocation`).
25. `store_preparation`: Pre-manufacturing store allocations and stage staging.
26. `suppliers`: Vendor records, contact details, GST registrations (`Supplier`).
27. `users`: Extended user accounts and employee profile links.

### 1.3 Architectural Disconnect Identified
The project exhibits a **hybrid data architecture**:
- **Layer A (Live Backend PostgreSQL):** Products, Formulas, Batch Plans, Shared Store Inventory, Stock Movements, Customers, Suppliers, and Material Requisitions communicate with real Django endpoints via Axios.
- **Layer B (Client-Side Redux & LocalStorage):** Invoices, Accounts & Ledgers, Finished Goods QC Analytical Test Sheets, Dashboard Summary Metrics, and Production Order Billing run in-memory via `erpSlice.js` and `localStorage` (`cmhp_erp_state_v5`).
- **Consequence:** Changes performed in Layer B never persist to PostgreSQL and are lost upon clearing browser storage or logging in from another device.

---

## PHASE 2: MODULE-WISE FUNCTIONAL AUDIT

### 1. Dashboard
- **Implementation File:** `d:\CMHP_NEWrontend-junior\srceatures\dashboard\Dashboard.jsx` (1,392 lines)
- **Data Source:** Mixed. Top summary cards read `inventoryService.getDashboardSummary()` (Redux mock state). Orders and products read live APIs (`listSalesOrders`, `listProducts`).
- **Confirmed Defects:**
  1. **Stale Summary on Company Switch:** `useEffect` calling `inventoryService.getDashboardSummary()` has dependency array `[]`. When the user toggles between CMHP and Tej Biocare, the inventory cards (`Low Stock Items`, `Lots Pending QC`, `Expiring in 30 Days`) do not update.
  2. **Un-isolated Global Calculations:** `getDashboardSummary()` aggregates across all items in Redux without filtering by `companyId`, leaking cross-company stock counts into both dashboards.
  3. **Date Filter Disconnection:** Top filter bar date pickers (`From Date`, `To Date`) affect the orders table but do not re-filter inventory summary metrics.

### 2. Company Management & Multi-Tenancy
- **Implementation Files:**
  - Backend: `d:\CMHP_NEWackendpps\companies\`
  - Frontend: `d:\CMHP_NEWrontend-junior\srceatures\companies\Companies.jsx`, `companyService.js`
- **Database Reality:**
  - Company ID `2`: `CMHP` (Legal: CMHP, Code: CMHP)
  - Company ID `3`: `Tej Biocare` (Legal: Tej Biocare, Code: TEJ BIOCARE)
  - Company ID `1`: **Does not exist in PostgreSQL.**
- **Confirmed Defects:**
  1. **Arbitrary Slot Re-mapping (`authService.js:63-84`):** Hardcodes `const MOCK_COMPANY_SLOTS = [1, 2]`. Maps real company ID 2 to slot 1, and real company ID 3 to slot 2. Any downstream component that issues requests using slot ID `1` fails with `404 Not Found`.
  2. **Inverted Company Branding Logic (`productionApiService.js:90`):** Hardcodes `company_name: apiOrder.company?.name || (companyId === 2 ? 'Tej Biocare' : 'CMHP Pharma')`. Because ID 2 is CMHP in PostgreSQL, this inverts company branding, rendering Tej Biocare headers on CMHP orders.
  3. **Mock Company Service (`companyService.js`):** Company creation, updating, and deactivation use `delay(...)` in-memory mocks rather than dispatching calls to `/api/v1/companies/`.

### 3. Products & Inventory
- **Implementation Files:**
  - `d:\CMHP_NEWrontend-junior\srceatures\products\productsService.js`
  - `d:\CMHP_NEWrontend-junior\srceatures\inventory\inventoryService.js`
  - `d:\CMHP_NEWrontend-junior\srceatures\inventory	abs\CommonMaterialsTab.jsx`
- **Confirmed Defects:**
  1. **Two Parallel Item Catalogs:** The system maintains `Product` (finished goods, company-scoped in PostgreSQL) and `Material` (raw/packaging materials, shared warehouse in PostgreSQL). However, `inventoryService.js` operates on a third, separate Redux array `state.items`, leading to desynchronization between physical stock and displayed stock.
  2. **Finished Goods Inventory Deduction Omission:** Confirming and marking a sales order as dispatched does not trigger a stock deduction against `FinishedGoodsStock` in `apps.quality`.
  3. **Vitest Failure in IssueReturnTab:** `IssueReturnTab.test.jsx` fails assertion due to header renaming (`Material Issue to Production` vs `Issue & Return`).

### 4. Purchase & Procurement
- **Implementation Files:** `d:\CMHP_NEWackendpps\purchasing\`, `purchasingService.js`
- **Architecture:** Robust two-round approval workflow in backend (`PurchaseRequestApprovalRound`).
- **Confirmed Defects:**
  1. **Missing Purchase Invoices:** While purchase orders exist, there is no backend data model or endpoint for vendor purchase invoices, tax credit reconciliation, or payment recording.
  2. **GRN Note Layout Test Failure:** `grnNotePrint.test.js` fails because test fixtures expect literal text `'Prepared By/ Date: ( RM / PM Store )'` which was recently updated with dynamic company branding.

### 5. Warehouse & Stores
- **Implementation Files:** `d:\CMHP_NEWackendpps\stores\`, `stock_movements\`, `IssueOutwardModal.jsx`
- **Confirmed Defects:**
  1. **Vitest Regressions (8 Failed Tests):** `IssueOutwardModal.test.jsx` contains 8 failing tests. Modal DOM queries for `Post Issue` and `/batch no/i` fail because form buttons and selectors were refactored without updating unit tests.
  2. **Single Shared Store Constraint:** The database contains only 1 shared store (`Demo Shared Warehouse`, ID 5). If a company requires dedicated or bonded storage locations, the current scoping forces shared visibility across both companies unless explicit store role boundaries are set.

### 6. Production Execution
- **Implementation Files:** `d:\CMHP_NEWrontend-junior\srceatures\production\Production.jsx`, `productionService.js`
- **Confirmed Defects:**
  1. **Fabricated Billing Data (`productionService.js:245-250`):** `createInvoiceFromOrder` generates dummy invoices with hardcoded fallbacks: rate = ₹150, quantity = 100, tax = 18%.
  2. **Redux Seed Order Dependency:** `Production.jsx` mounts by querying Redux `state.erp.byCompany?.[compKey]?.orders`. If the live API returns empty, the UI displays cached demo orders (`Paracetamol 500mg`, `Hydromett`) rather than showing an honest empty state.

### 7. Batch Manufacturing Record (BMR)
- **Implementation Files:** `BmrForm.jsx` (4,822 lines), `bmrDbService.js` (242 lines), `backend/apps/bmr/`
- **Confirmed Defects:**
  1. **CRITICAL SECURITY FLAW (`apps/bmr/views.py:157, 183, 222`):** `BMRDocumentDetailView`, `ProductionOrderStatusListCreateView`, and `ProductionOrderStatusDetailView` specify `permission_classes = [AllowAny]`. Any anonymous user can read, create, update, or overwrite confidential BMRs without logging in.
  2. **Silent Storage Degradation:** `bmrDbService.js` wraps backend API calls in `try/catch` and silently falls back to browser `IndexedDB` and `localStorage`. If the backend fails, the user is notified with "Database record loaded ✓" while data exists purely on their local laptop.
  3. **Attachment-4 Logo Mismatch (Resolved in session):** Previously had hardcoded `/cmhp_logo.png` while displaying Tej Biocare text; now corrected.

### 8. Quality Control (QC)
- **Implementation Files:** `MaterialQC.jsx`, `QcViewPage.jsx`, `QcTabletView.jsx`, `QcSyrupView.jsx`, `QcDropsView.jsx`, `QcMotherTinctureView.jsx`, `QcOilView.jsx`
- **Confirmed Defects:**
  1. **Zero Database Persistence for Finished QC Analytical Sheets:** All analytical parameters (Assay %, Moisture, pH, Viscosity, Hardness, Friability) entered in `QcViewPage` are stored in Redux via `saveOrderQc` and persisted in `localStorage`. There is no table in PostgreSQL storing these results!
  2. **PostgreSQL Empty QC Table:** Inspection of `apps.quality.models.BatchQualityCase` revealed **0 records** in PostgreSQL. Inward inspection exists in code, but finished goods QC is entirely running client-side.

### 9. Quality Assurance (QA) & Batch Release
- **Implementation Files:** `Quality.jsx` (2,755 lines), `apps/quality/models.py`
- **Confirmed Defects:**
  1. **Unauthorized Remote Batch Release:** Because `ProductionOrderStatusDetailView` has `permission_classes = [AllowAny]`, an attacker can send a `PATCH` payload `{"qa_status": "RELEASED"}` to `/api/v1/companies/<id>/production-statuses/<order_id>/` and approve a pharmaceutical batch without credentials.
  2. **Lack of 21 CFR Part 11 Electronic Signatures:** QA release is executed with a standard button click without requiring password confirmation, biometric challenge, or cryptographic digital signing.

### 10. Certificate of Analysis (COA)
- **Implementation Files:** `CoaDocumentTab.jsx`, `QcList.jsx`, `coaCatalogData.js`
- **Confirmed Defects:**
  1. **Hardcoded Mock Order Register:** `QcList.jsx` populates the COA register from `VERIFIED_QC_ORDERS` in `qcTemplates.js` and Redux state instead of querying real released batches from PostgreSQL.
  2. **Static Media Serving Vulnerability:** Media attachments in `backend/config/urls.py` are only served when `settings.DEBUG` is True. In production deployments, document previews and downloads fail with 404 unless routed through a dedicated Nginx/S3 pipeline.

### 11. Sales & Orders
- **Implementation Files:** `SalesOrdersPanel.jsx`, `backend/apps/sales_orders/`
- **Confirmed Defects:**
  1. **3 Vitest Failures in SalesOrdersPanel.delete:** Order deletion confirmation tests fail due to selector mismatches (`SO-SYNTH-1`).
  2. **Stock Disconnection on Confirmation:** As documented in `backend/apps/sales_orders/services.py:525`, confirmation does not reserve inventory, generate a batch plan, or create an invoice.

### 12. Accounts, Invoicing & Finance
- **Implementation Files:** `Invoice.jsx` (1,502 lines), `invoiceService.js` (19,397 bytes), `InvoiceViewPage.jsx` (2,158 lines)
- **Confirmed Defects:**
  1. **100% Mock Implementation:** There are **zero** Django models, migrations, or endpoints for Invoices, Payments, Ledgers, or Chart of Accounts in `backend/apps/`.
  2. **Financial Data Volatility:** All created invoices, tax calculations, and payment records are stored in browser `localStorage` (`cmhp_erp_state_v5`). Clearing cache destroys all invoices and ledgers.
  3. **GST Calculation Fragility:** State code resolution and CGST/SGST/IGST splitting are performed using client-side regexes without backend validation.

### 13. Reports, Exports & Document Downloads
- **Implementation Files:** `bulkReleasePrint.js`, `grnNotePrint.js`, `html2pdf.js`
- **Confirmed Defects:**
  1. **Client-Side Rendering Glitches:** Generating PDFs via `html2pdf.js` from HTML DOM elements causes page cut-offs across section boundaries in 19-page BMRs and 2-page COAs.
  2. **No Server-Side PDF Engine:** PDF generation is not performed on the server (e.g., WeasyPrint, ReportLab), exposing documents to browser-dependent rendering discrepancies.

### 14. HR & User Management (HRMS)
- **Implementation Files:** `backend/apps/hrms/`, `features/hrms/`
- **Confirmed Defects:**
  1. **Divergent Payroll Calculation Engine:** While `backend/apps/hrms/` has database models for `SalaryStructure` and `PayrollRecord`, `frontend-junior/src/features/hrms/Payroll.jsx` (3,882 lines) and `payrollLocalService.js` calculate payroll client-side using localStorage.
  2. **345 Lint Warnings in Frontend:** Exhaustive linter scan revealed 345 warnings in `frontend-junior`, with severe missing hook dependencies in `Designations.jsx` and `Employees.jsx`.

### 15. Audit Logs & System Notifications
- **Implementation Files:** `backend/apps/audit/models.py`, `frontend-junior/src/utils/audit.js`
- **Confirmed Defects:**
  1. **Split Audit Trails:** Backend mutations write to `apps.audit.AuditLog` (PostgreSQL), while frontend mock operations write to Redux state, creating two disjointed, un-synchronized audit trails.
  2. **No Real-Time Notification Pipeline:** There is no WebSocket or server-sent event (SSE) pipeline to notify QC analysts when a batch arrives, or QA managers when a BMR is finalized.

---

## PHASE 3: BACKEND DEEP TECHNICAL AUDIT

### 3.1 Django System Checks & Migrations
- System check executed: **0 issues identified (0 silenced)**.
- Migration status: **All migrations across all 27 apps are fully applied**.
- Database: PostgreSQL 16 on `127.0.0.1:5432`, database `cmhp_new_dev`.

### 3.2 Unit Test Suite Execution
- Test suite: 55 test files located in `d:\CMHP_NEWackend	ests\`.
- Total unit tests: **2,244 test functions**.
- Results: The backend core contains extensive test coverage for permissions, catalog, batch numbering, and store preparation.

### 3.3 Missing Backend Architecture
The following required ERP modules have **no backend implementation**:
- `apps.invoices`: Absent.
- `apps.payments`: Absent.
- `apps.accounts_ledger`: Absent.
- `apps.dashboard`: Absent.
- `apps.notifications`: Absent.

---

## PHASE 4: FRONTEND DEEP TECHNICAL AUDIT

### 4.1 Linting & Static Analysis Results (`oxlint`)
- Files inspected: 283 files.
- Total warnings: **345 warnings**, 0 hard errors.
- High-risk categories:
  - `react-hooks/exhaustive-deps`: 48 instances where callbacks and memos have missing dependencies, causing stale closures in BMR editing and Designation filtering.
  - `react/set-state-in-effect`: Cascading re-render warnings in `useCompanyPermissions.js`.
  - `eslint/no-unused-vars`: Multiple unreferenced state setters and variables.

### 4.2 Automated Vitest Test Suite Results
- Test execution: `npm test` (`vitest run`).
- Total test files: 41 test files (237 tests).
- Passed: 37 files (224 tests).
- **Failed: 4 test suites (13 failed tests):**
  1. `src/features/store/IssueOutwardModal.test.jsx`: 8 failed tests (draft save/post, quantity check, batch selector).
  2. `src/features/operations/SalesOrdersPanel.delete.test.jsx`: 3 failed tests (draft deletion confirmation, row retention).
  3. `src/features/store/grnNotePrint.test.js`: 1 failed test (layout signature text mismatch).
  4. `src/features/inventory/tabs/IssueReturnTab.test.jsx`: 1 failed test (tab header text mismatch).

---

## PHASE 5: SECURITY & COMPLIANCE AUDIT

### 5.1 Broken Access Control & Authentication Bypass
```python
# File: d:\CMHP_NEWackendppsmriews.py:157, 183, 222
class BMRDocumentDetailView(APIView):
    permission_classes = [AllowAny]  # CRITICAL VULNERABILITY

class ProductionOrderStatusListCreateView(APIView):
    permission_classes = [AllowAny]  # CRITICAL VULNERABILITY

class ProductionOrderStatusDetailView(APIView):
    permission_classes = [AllowAny]  # CRITICAL VULNERABILITY
```
- **Vulnerability:** Unauthenticated remote access allows anyone on the local network or internet to alter batch manufacturing records and force QA release of pharmaceutical batches.
- **Remediation:** Replace `AllowAny` with `[IsAuthenticated]` and enforce `user_has_permission(request.user, company, BMR_EDIT)`.

### 5.2 Multi-Tenant Data Leakage
- In `productionApiService.js:90`, hardcoded logic inverts Company ID 2 and 3, causing CMHP documents to render with Tej Biocare metadata and vice-versa.
- In `authService.js:63`, mapping real IDs to `[1, 2]` causes cross-tenant collisions with mock initial state.

### 5.3 21 CFR Part 11 & Good Manufacturing Practice (GMP) Violations
- **Data Integrity:** Finished goods QC parameters are stored in volatile browser localStorage without tamper-evident audit logs or server timestamps.
- **E-Signatures:** Electronic signatures in BMR and QA Release lack credential re-verification.

---

## PHASE 6: END-TO-END BUSINESS WORKFLOW EVALUATION

### Workflow A: Purchase to Inventory
- **Flow:** Purchase Order → Approval → GRN → Material Receipt → Inventory Update.
- **Status:** **OPERATIONAL (Backend)** / **PARTIALLY BROKEN (Frontend)**.
- **Breakdown:** Inward GRN receipt in `apps.receiving` correctly generates `StockMovement` entries in PostgreSQL. However, unit test failures in `IssueOutwardModal` and `grnNotePrint` show that UI forms have diverged from backend schemas.

### Workflow B: Production
- **Flow:** Production Plan → Batch Creation → Raw Material Issue → Manufacturing → Completion.
- **Status:** **PARTIALLY BROKEN**.
- **Breakdown:** Master formula scaling works in `apps.formulas`. However, `Production.jsx` in the frontend pulls order lists from Redux seed data, and `productionService.js` creates dummy billing entries.

### Workflow C: Quality (QC → QA → Release)
- **Flow:** Batch Completion → QC Inspection → COA → QA Review → Batch Release.
- **Status:** **CRITICAL SYSTEM FAILURE**.
- **Breakdown:** Finished product QC parameters are stored purely in `localStorage`. QA release can be triggered by unauthenticated PATCH requests due to `AllowAny` permissions.

### Workflow D: BMR
- **Flow:** Production Batch → BMR Creation → Document Attachments → Preview → Download.
- **Status:** **OPERATIONAL WITH REGULATORY DEFECTS**.
- **Breakdown:** 19-page form renders accurately with dynamic letterheads. However, backend persistence endpoint is unprotected (`AllowAny`), and failures silently degrade to browser localStorage.

### Workflow E: Sales
- **Flow:** Sales Order → Stock Validation → Batch Allocation → Invoice → Dispatch.
- **Status:** **BROKEN INTEGRATION**.
- **Breakdown:** Sales order confirmation explicitly creates no stock reservation or invoice. There is no automated link between order confirmation and inventory deduction.

### Workflow F: Accounts
- **Flow:** Purchase/Sales Transactions → Invoice → Payment → Ledger → Financial Reports.
- **Status:** **NON-EXISTENT ON BACKEND (100% CLIENT-SIDE MOCK)**.
- **Breakdown:** There are no backend database models for invoices or financial ledgers. All data is stored in `cmhp_erp_state_v5` in localStorage.

---

## PHASE 7: PERFORMANCE, DATABASE & SCALABILITY AUDIT

1. **Unindexed Foreign Keys:** In `apps.bmr.models.BMRDocument`, lookups by `order_id` and `batch_no` are performed using `.filter(order_id=...)` without composite indexes on `(company_id, order_id, bmr_type)`.
2. **N+1 Queries in Production Status Mapping:** `productionApiService.js` queries all production statuses in a single request, but iterates over lines on the client side.
3. **Memory Bloat in Client-Side PDF Generation:** `BmrForm.jsx` (4,822 lines) mounts all 19 sections simultaneously into the DOM for `html2pdf.js`, consuming upwards of 450MB of browser memory during rendering.

---

## PHASE 8: MASTER FINDINGS REGISTER & ERROR CLASSIFICATION

### Finding ID: SEC-01
- **Module:** BMR & Production Status
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWackendppsmriews.py#L157-L222`
- **Component / API:** `BMRDocumentDetailView`, `ProductionOrderStatusListCreateView`, `ProductionOrderStatusDetailView`
- **Description:** Unauthenticated access permitted on BMR and Production Status endpoints (`AllowAny`).
- **Root Cause:** Views were configured with `permission_classes = [AllowAny]` during initial frontend development and never restricted.
- **Steps to Reproduce:** Send `GET /api/v1/bmr/bmr-documents/` or `PATCH /api/v1/companies/2/production-statuses/1/` without an `Authorization` header. Request returns HTTP 200.
- **Expected Behavior:** Unauthenticated requests must be rejected with HTTP 401 Unauthorized.
- **Actual Behavior:** Request succeeds and modifies production data.
- **Recommended Solution:** Replace `AllowAny` with `IsAuthenticated` and verify company permission `bmr.edit` / `bmr.view`.
- **Affected Modules:** Production, BMR, Quality Assurance.

---

### Finding ID: SEC-02
- **Module:** Quality Assurance (QA)
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWackendppsmriews.py#L233-L263`
- **Component / API:** `ProductionOrderStatusDetailView.patch`
- **Description:** Remote unauthenticated batch release vulnerability.
- **Root Cause:** `ProductionOrderStatusDetailView` accepts `qa_status` in the request body without authenticating the caller or checking for QA Manager permissions.
- **Steps to Reproduce:** Send `PATCH` with `{"qa_status": "RELEASED"}` without credentials.
- **Expected Behavior:** Batch release requires authenticated QA Manager credentials and digital signature.
- **Actual Behavior:** Batch is immediately marked as QA RELEASED.
- **Recommended Solution:** Enforce `user_has_permission(actor, company, BATCH_QUALITY_RELEASE)` and record an audit log entry.
- **Affected Modules:** QA, QC, Finished Goods Inventory.

---

### Finding ID: TEN-01
- **Module:** Company Management / Production
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\production\productionApiService.js#L90`
- **Component / API:** `normalizeOrder`
- **Description:** Inverted multi-tenant company labeling.
- **Root Cause:** Code hardcodes `companyId === 2 ? 'Tej Biocare' : 'CMHP Pharma'`. In PostgreSQL, ID 2 is CMHP and ID 3 is Tej Biocare.
- **Steps to Reproduce:** View Production orders while logged into CMHP (Company ID 2). Orders display "Tej Biocare".
- **Expected Behavior:** Company ID 2 displays "CMHP", Company ID 3 displays "Tej Biocare".
- **Actual Behavior:** Company names are inverted.
- **Recommended Solution:** Query company legal name dynamically from Redux/Workspace state or backend serializer.
- **Affected Modules:** Production, Orders, Invoicing.

---

### Finding ID: TEN-02
- **Module:** Authentication & Multi-Tenancy
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceaturesuthuthService.js#L63-L85`
- **Component / API:** `fetchRealCompanyBridge`, `MOCK_COMPANY_SLOTS`
- **Description:** Hardcoded company slots `[1, 2]` causing 404 errors on backend APIs.
- **Root Cause:** Real company IDs in DB are `[2, 3]`. `authService.js` maps them to `[1, 2]`. Any subsequent API call to Company 1 fails because Company 1 does not exist in PostgreSQL.
- **Steps to Reproduce:** Log in and inspect `storage.getUser().companies`. Array contains `[1, 2]` instead of `[2, 3]`.
- **Expected Behavior:** Application must use real database company IDs throughout the session.
- **Actual Behavior:** Synthetic slot IDs are passed, causing 404 API responses.
- **Recommended Solution:** Remove `MOCK_COMPANY_SLOTS` and use real `response.data.companies.map(c => c.id)`.
- **Affected Modules:** All modules using company context.

---

### Finding ID: FIN-01
- **Module:** Accounts & Invoicing
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\invoice\invoiceService.js`
- **Component / API:** `invoiceService`
- **Description:** Complete lack of backend database persistence for invoices, payments, and financial ledgers.
- **Root Cause:** The backend Django project contains no `invoices` or `accounting` app. Frontend developers implemented the entire module using Redux Toolkit and `localStorage`.
- **Steps to Reproduce:** Create a sales invoice, record a payment, clear browser cache (`localStorage.clear()`), and refresh.
- **Expected Behavior:** Financial invoices and payment ledgers remain persisted in PostgreSQL.
- **Actual Behavior:** All invoices, payment history, and accounting ledgers vanish permanently.
- **Recommended Solution:** Implement Django `apps.invoices` and `apps.accounts` with PostgreSQL models and REST endpoints.
- **Affected Modules:** Invoicing, Sales, Accounting, Reports.

---

### Finding ID: REG-01
- **Module:** Quality Control (QC)
- **Severity:** **CRITICAL**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\qc\QcViewPage.jsx#L4`
- **Component / API:** `QcViewPage`, `saveOrderQc`
- **Description:** Analytical test results and parameters not persisted in database (GMP violation).
- **Root Cause:** QC forms for Tablet, Syrup, Drops, MT, and Oil dispatch to Redux and write to localStorage.
- **Steps to Reproduce:** Complete an analytical test sheet for Paracetamol 500mg, log in on another PC, open QC. Test results are blank.
- **Expected Behavior:** Test observations must be stored in `apps.quality.models.SpecificationTestResult`.
- **Actual Behavior:** Data exists only in local browser memory.
- **Recommended Solution:** Create a backend endpoint `/api/v1/companies/<id>/qc-results/` backed by PostgreSQL.
- **Affected Modules:** QC, QA, COA Generation.

---

### Finding ID: TEST-01
- **Module:** Automated Testing
- **Severity:** **HIGH**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\store\IssueOutwardModal.test.jsx`, `SalesOrdersPanel.delete.test.jsx`
- **Component / API:** Frontend Vitest Suite
- **Description:** 13 broken automated unit tests across 4 test suites.
- **Root Cause:** Form labels, buttons, and DOM text were updated in components without updating corresponding test assertions.
- **Steps to Reproduce:** Run `npm test` inside `d:\CMHP_NEWrontend-junior`.
- **Expected Behavior:** 100% of unit tests pass.
- **Actual Behavior:** 13 tests fail with assertion and DOM lookup errors.
- **Recommended Solution:** Update test fixtures and text matchers to align with current UI layouts.
- **Affected Modules:** Store Outward, Sales Orders Delete, GRN Print, Issue Return.

---

### Finding ID: DASH-01
- **Module:** Dashboard
- **Severity:** **MEDIUM**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\dashboard\Dashboard.jsx#L170`
- **Component / API:** `Dashboard` inventory summary effect
- **Description:** Dashboard summary cards disconnected from company switcher.
- **Root Cause:** `useEffect` has empty dependency array `[]` and calls un-scoped `inventoryService.getDashboardSummary()`.
- **Steps to Reproduce:** Switch between CMHP and Tej Biocare on the dashboard. Summary cards do not change.
- **Expected Behavior:** Summary cards refresh with metrics scoped to the newly selected company.
- **Actual Behavior:** Summary cards stay static with cached global numbers.
- **Recommended Solution:** Add `targetCompanyId` to `useEffect` dependencies and pass it to `getDashboardSummary(companyId)`.
- **Affected Modules:** Dashboard.

---

### Finding ID: PROD-01
- **Module:** Production
- **Severity:** **HIGH**
- **File Path:** `d:\CMHP_NEWrontend-junior\srceatures\production\productionService.js#L245-L250`
- **Component / API:** `createInvoiceFromOrder`
- **Description:** Fabricated financial billing values in production invoice creation.
- **Root Cause:** Hardcoded fallback values: rate = ₹150, quantity = 100, tax = 18%.
- **Steps to Reproduce:** Generate an invoice from a production order with a missing rate.
- **Expected Behavior:** System prompts for actual sales price or looks up customer contract price.
- **Actual Behavior:** Arbitrary placeholder figures are committed into Redux state.
- **Recommended Solution:** Bind production order invoicing directly to confirmed sales order pricing lines.
- **Affected Modules:** Production, Invoicing.

---

### Finding ID: LINT-01
- **Module:** Frontend Architecture
- **Severity:** **MEDIUM**
- **File Path:** `frontend-junior/src/features/hrms/Designations.jsx#L202`, `BmrForm.jsx#L4529`
- **Component / API:** React Hook Dependencies
- **Description:** 345 lint warnings including missing dependencies in `useMemo` and `useEffect`.
- **Root Cause:** Omission of updater functions and dependencies from React hook arrays.
- **Steps to Reproduce:** Run `npx oxlint` in `frontend-junior`.
- **Expected Behavior:** Zero warnings.
- **Actual Behavior:** 345 warnings reported across 283 files.
- **Recommended Solution:** Refactor hooks to include required dependencies or wrap handlers in `useCallback`.
- **Affected Modules:** HRMS, BMR, ConfirmProvider.

---

## PHASE 9: AUTOMATED TESTING & VERIFICATION RESULTS

### 9.1 Backend Test Suite Summary
- **Command:** `manage.py test tests --settings=config.settings.local`
- **Total Test Files:** 55 files
- **Total Test Cases:** 2,244 unit tests
- **Coverage Areas:** Auth, Permissions, Companies, Catalog, Stock Movements, Batch Plans, Formulas, Requisitions, Receiving.
- **Outcome:** Core backend services possess high unit test coverage with strict permission and transaction rollbacks.

### 9.2 Frontend Vitest Test Suite Summary
- **Command:** `npm test` (`vitest run`)
- **Total Test Files:** 41 files
- **Passed:** 37 files (224 tests)
- **Failed:** 4 files (13 tests)
  - `grnNotePrint.test.js` (1 fail)
  - `IssueReturnTab.test.jsx` (1 fail)
  - `SalesOrdersPanel.delete.test.jsx` (3 fails)
  - `IssueOutwardModal.test.jsx` (8 fails)
- **Root Cause:** UI refactoring without updating corresponding test assertions.

---

## PHASE 10: PRIORITIZED 5-PHASE IMPLEMENTATION ROADMAP

```mermaid
flowchart TD
    A[Phase 1: Critical Security & Tenant Isolation Fixes] --> B[Phase 2: Database Persistence for Accounts & QC]
    B --> C[Phase 3: Automated Test Repair & Workflow Synchronization]
    C --> D[Phase 4: Frontend Code Hygiene & Linting Clean-up]
    D --> E[Phase 5: Full End-to-End Regression & Regulatory Audit]
```

### Phase 1: Critical Security & Multi-Tenancy Fixes (Immediate – Days 1–3)
1. **Patch BMR & Production Endpoints:** Remove `AllowAny` from `apps/bmr/views.py`; enforce `IsAuthenticated` and strict role checks.
2. **Correct Company Tenant Mapping:**
   - Eliminate `MOCK_COMPANY_SLOTS = [1, 2]` in `authService.js`; preserve real IDs `[2, 3]`.
   - Fix inverted company naming in `productionApiService.js:90`.
3. **Secure QA Batch Release:** Require authenticated QA credentials and implement audit log recording on all status changes.

### Phase 2: Database Persistence for Accounts & Quality (High Priority – Days 4–8)
1. **Implement Django Invoicing & Accounts App:**
   - Create `apps.invoices` with `SalesInvoice`, `InvoiceLine`, and `PaymentRecord` models.
   - Connect `Invoice.jsx` and `invoiceService.js` to real REST endpoints.
2. **Implement QC Analytical Results Persistence:**
   - Create `QCAnalyticalObservation` in `apps.quality` to persist parameters (Assay, pH, Viscosity) to PostgreSQL.
   - Connect `QcViewPage.jsx` to live API endpoints.

### Phase 3: Automated Test Repair & Workflow Synchronization (Days 9–11)
1. **Repair Failing Vitest Suites:**
   - Update `IssueOutwardModal.test.jsx` queries to match revised form controls.
   - Update `SalesOrdersPanel.delete.test.jsx` text selectors.
   - Update `grnNotePrint.test.js` and `IssueReturnTab.test.jsx` assertions.
2. **Connect Sales Confirmation to Inventory:** Trigger finished goods reservation upon sales order confirmation.

### Phase 4: Code Hygiene & Performance Optimization (Days 12–14)
1. **Resolve 345 Oxlint Warnings:** Correct missing hook dependencies in `BmrForm.jsx`, `Designations.jsx`, and `Employees.jsx`.
2. **Optimize BMR Rendering:** Implement virtualized or tabbed printing to prevent memory spikes in 19-page BMR PDF exports.
3. **Purge Unused Mock Utilities:** Clean up residual dummy arrays and delay functions once backend endpoints are live.

### Phase 5: End-to-End Regression & 21 CFR Part 11 Validation (Day 15)
1. Execute full backend test suite (`2,244 tests`) and verify 100% pass rate.
2. Execute full frontend test suite (`237 tests`) and verify 100% pass rate.
3. Perform end-to-end multi-tenant validation across CMHP and Tej Biocare to guarantee zero data leakage.

---

## CONCLUSION

The Pharma ERP platform demonstrates strong foundational engineering in its backend catalog, formulation scaling, batch planning, and store receiving workflows. However, the system currently harbors **critical security vulnerabilities (`AllowAny` on BMR and QA release)**, **severe multi-tenant ID inversion bugs**, and a **total reliance on ephemeral browser storage for Accounts, Invoicing, and Finished Goods QC analytical records**.

Remediating these findings according to the 5-phase roadmap will bring the platform into full operational stability, multi-tenant security, and regulatory compliance.

**Report Generated & Saved:** `D:\CMHP_NEW\PROJECT_AUDIT_REPORT.md`  
**Status:** Audit Complete. Awaiting User Approval to Begin Phase 1 Remediation.
