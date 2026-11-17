# PHASE 1 IMPLEMENTATION REPORT: CRITICAL SECURITY & MULTI-TENANT REMEDIATION

**Project:** Pharma ERP – CMHP  
**Path:** `D:\CMHP_NEW`  
**Git Branch:** `fix/phase-1-security-multitenancy`  
**Database Backup:** `D:\CMHP_NEW\backup_cmhp_new_dev_phase1.dump` (PostgreSQL binary dump, 928 KB, verified)  
**Implementation Date:** 16-November-2026  
**Status:** COMPLETED & VERIFIED (All 15 security & multi-tenant automated tests passing; Vite build passing with 0 errors)

---

## 1. EXECUTIVE SUMMARY

Phase 1 implementation directly addresses the most critical backend security vulnerabilities, permission bypasses, multi-tenant company isolation defects, and company document branding discrepancies identified during the comprehensive Pharma ERP audit (`PROJECT_AUDIT_REPORT.md`).

All work was strictly constrained to **Phase 1 requirements**:
1. Pre-implementation backup and verification.
2. Remediation of public BMR & production API endpoints (SEC-01).
3. Remediation and enforcement of secure QA batch release (SEC-02).
4. Multi-tenant company isolation & removal of hardcoded slots / inverted mappings (TEN-01 & TEN-02).
5. Frontend document branding & logo harmonization across all documents (Attachment-1, Attachment-3, Attachment-4, TRS, COA, BMR, Invoices, and Exports) for both **CMHP Pharmaceuticals** and **Tej Biocare**.

---

## 2. STEP 1: PRE-IMPLEMENTATION VERIFICATION & BACKUP

Before modifying source files, a pre-implementation inspection and database backup were conducted:
- **Dedicated Git Branch:** Created and checked out `fix/phase-1-security-multitenancy`.
- **Database Backup:** Executed `pg_dump -U postgres -d cmhp_new_dev -F c -b -v -f backup_cmhp_new_dev_phase1.dump`.
- **Verification:** Verified dump integrity (928 KB, valid PostgreSQL custom-format archive).
- **Audit Verification:** Re-inspected backend endpoints and frontend data structures to confirm exact failure modes prior to applying fixes.

---

## 3. STEP 2: REMEDIATION OF PUBLIC BMR ENDPOINTS (SEC-01)

### Vulnerability Identified
In `backend/apps/bmr/views.py`, `BMRDocumentDetailView`, `ProductionOrderStatusListCreateView`, and `ProductionOrderStatusDetailView` permitted unrestricted public access using `permission_classes = [AllowAny]`. Unauthenticated users could view confidential batch manufacturing records and tamper with production statuses.

### Remediation Applied
1. **Unsafe Permissions Removed:** Replaced `AllowAny` with `IsAuthenticated` across all BMR and Production status views.
2. **Action- & Object-Level Company Permissions Enforced:**
   - Viewing BMR documents and production statuses now strictly requires `bmr.view` or `batch_plans.view` scoped to the authenticated user's assigned company.
   - Creating/updating BMR documents and production statuses requires `bmr.create` / `bmr.edit` or `batch_plans.edit`.
   - Explicit company isolation via `_get_company_for_action_any` checks company membership and permissions. Access to another company's records via arbitrary URL ID parameter manipulation returns HTTP 404 (or 403 when authenticated but lacking company membership).
3. **Dispatch Pre-condition Validation:** Disallowing status updates to `dispatch_status = "YES"` unless the batch has achieved verified `qa_status = "RELEASED"`.

---

## 4. STEP 3: SECURED QA BATCH RELEASE (SEC-02)

### Vulnerability Identified
A user could issue a generic `PATCH` request containing `{"qa_status": "RELEASED"}` to `/production-statuses/<order_id>/` and release a pharmaceutical batch without authorization, audit logging, or QC approval checks.

### Remediation Applied
1. **Generic PATCH Status Modification Blocked:** In `ProductionOrderStatusDetailView.patch`, any request containing `qa_status` is explicitly rejected with `400 Bad Request` and descriptive error guidance.
2. **Dedicated QA Release Action Endpoint:** Created dedicated endpoint `POST /api/v1/companies/<company_id>/production-statuses/<order_id>/qa-release/` handled by `ProductionOrderQaReleaseView`.
3. **Strict QA Role Verification:** Enforced requirement for `batch_quality.qa_release` or `qa.approve` permission. Production personnel or unauthenticated users attempting release receive `403 Forbidden`.
4. **Mandatory Quality Prerequisite Validation:** When an outcome of `RELEASED` is requested, the system verifies against `BatchQualityCase` that batch QC is not rejected or incomplete before allowing QA release.
5. **Immutable Audit Trail:** Automated audit logging using `record(action="production_order.qa_release", actor=request.user, company=company, ...)` capturing timestamp, actor, batch, previous status, new status, and release remarks.
6. **Atomic Transactions & Optimistic Locking:** All release transitions run inside atomic database transactions with row-level locks (`select_for_update()`).

---

## 5. STEP 4: MULTI-TENANT ISOLATION & COMPANY ID CORRECTION (TEN-01 & TEN-02)

### Defect Identified
The database contains **Company ID 2 = CMHP** and **Company ID 3 = Tej Biocare** (Company ID 1 does not exist in the active schema). However, various frontend services and components had:
- Inverted ternary conditions: `activeCompanyId === 2 ? 'Tej Biocare' : 'CMHP'` (inverted mapping).
- Hardcoded fallback company `1` instead of `2`.
- Redux slice and persistence layer assigning orders of `company: 2` to `byCompany.tej`.

### Remediation Applied
1. **Redux Partitioning & Company Key Resolution (`store.js`, `erpSlice.js`, `persistence.js`):**
   - Corrected `resolveCompanyKey`: Company 3 maps to `'tej'`, Company 2 and 1 map to `'cmhp'`.
   - Corrected Redux store initialization and active company fallbacks to `activeCompanyId: 2, activeCompanyKey: 'cmhp'`.
   - Seed and persisted records correctly partition Company 2 records into `byCompany.cmhp` and Company 3 records into `byCompany.tej`.
2. **Invoice Service & Model (`invoiceService.js`, `Invoice.jsx`):**
   - Fixed `hydrateInvoice`, `assertInvoiceCompany`, `getInvoices`, `getInvoice`, `createInvoice`: `Number(companyId) === 3 ? 'tej' : 'cmhp'`.
   - Corrected `company_name` derivation in `Invoice.jsx`: `Number(inv.company) === 3 ? 'Tej Biocare' : 'CMHP Pharma'`.
3. **Quality & Operations Services (`qualityService.js`, `Operations.jsx`):**
   - Fixed `produceBatchFromOrder` in `Operations.jsx`: `Number(compId) === 3 ? 'tej' : 'cmhp'`.
   - Fixed `addQcRecord` and auto-created QA record in `qualityService.js`: `qaCompanyKey = Number(qaCompanyId) === 3 ? 'tej' : 'cmhp'`.
4. **HRMS Dashboard & Reports (`HrDashboard.jsx`, `HrReports.jsx`):**
   - Corrected company KPI filtering: Company 2 = Unit 1 (CMHP), Company 3 = Unit 2 (Tej Biocare).

---

## 6. FRONTEND DOCUMENT BRANDING & LOGO HARMONIZATION

### Defect Addressed (User's Attached Attachment-4 Screenshot)
In the Attachment-4 modal on `localhost:5175/products/3/27/formulas?tab=bom`, the title displayed "TEJ BIOCARE", but the header logo rendered the CMHP logo (`/cmhp_logo.png`) due to hardcoded image sources and incomplete company resolution.

### Complete Document Branding Implementation
A centralized branding resolver was created and integrated into all document generators and modals:
- **`companyBranding.js`:**
  - Multi-tiered resolution: Checks URL path `/products/3/...` or `companyId=3`, active workspace, user company selection, record company IDs (`company: 3`), and name strings (`'Tej Biocare'`).
  - Returns appropriate branding tokens:
    - **Tej Biocare (Company ID 3):** `logoSrc: '/logo2.jpeg'`, `headerName: 'TEJ BIOCARE'`, `code: 'TEJ'`, `invoiceLogoSrc: '/logo2.jpeg'`, `forCompany: 'For Tej Biocare'`.
    - **CMHP (Company ID 2):** `logoSrc: '/logo.jpg'`, `headerName: 'CMHP PRIVATE LIMITED'`, `code: 'CMHP'`, `invoiceLogoSrc: '/cmhp_invoice_logo.png'`, `forCompany: 'For CMHP Private Limited'`.

### Document-by-Document Verification
| Document | Component / File | Logo Source | Header Title | Company Code | Status |
|:---|:---|:---|:---|:---|:---|
| **Attachment - 4 (PM Requirement Slip)** | `BmrRequisitionSlipModal.jsx` | `/logo2.jpeg` (Tej) / `/logo.jpg` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Attachment - 1 (RM Requisition Slip)** | `BmrRequisitionSlipModal.jsx` & `BmrRequisitionDocument.jsx` | `/logo2.jpeg` (Tej) / `/logo.jpg` (CMHP) | `TEJ BIOCARE` / `CMHP PHARMACEUTICALS` | `TEJ` / `CMHP` | Verified |
| **Attachment - 3 (Bulk Release Slip)** | `BulkReleaseSlipEditor.jsx` & `bulkReleasePrint.js` | `/logo2.jpeg` (Tej) / `/cmhp_invoice_logo.png` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Test Request Slip (TRS)** | `TestRequestSlipEditor.jsx` | `/logo2.jpeg` (Tej) / `cmhpLogo` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Certificate of Analysis (COA)** | `DocumentPreviewModal.jsx` | `/logo2.jpeg` (Tej) / `/logo.jpg` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Goods Received Note (GRN)** | `grnNotePrint.js` | `/logo2.jpeg` (Tej) / `cmhpLogoUrl` (CMHP) | `TEJ BIOCARE` / `CENTRAL MANUFACTURING...` | `TEJ` / `CMHP` | Verified |
| **Production Raw Material Calculator** | `ProductionRawMaterialCalculator.jsx` | Dynamic branding pill | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **BMR Management Panel** | `BmrPanel.jsx` | `/logo2.jpeg` (Tej) / `/logo.jpg` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Tax Invoice & Preview** | `InvoiceViewPage.jsx` & `ProductionInvoice.jsx` | `/logo2.jpeg` (Tej) / `/cmhp_invoice_logo.png` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |
| **Excel & Formula Exports** | `formulaExport.js` | Dynamic document title | `TEJ BIOCARE` / `CMHP` | `TEJ` / `CMHP` | Verified |
| **QC Dosage Form Master Views** | `QcViewPage.jsx`, `QcTabletView.jsx`, `QcSyrupView.jsx`, etc. | `/logo2.jpeg` (Tej) / `/logo.jpg` (CMHP) | `TEJ BIOCARE` / `CMHP PRIVATE LIMITED` | `TEJ` / `CMHP` | Verified |

---

## 7. AUTOMATED VERIFICATION RESULTS

### Backend Test Suite (`test_phase1_security.py`)
Executed with PostgreSQL local test database:
```
Ran 15 tests in 116.639s
OK
```
All 15 security and tenant isolation tests passed:
- `test_unauthenticated_bmr_document_list_returns_401`: PASS
- `test_unauthenticated_bmr_document_detail_returns_401`: PASS
- `test_unauthenticated_production_status_list_returns_401`: PASS
- `test_unauthenticated_production_status_patch_returns_401`: PASS
- `test_user_without_bmr_view_permission_is_denied_403`: PASS
- `test_direct_generic_patch_of_qa_status_is_strictly_blocked`: PASS
- `test_dispatch_blocked_before_qa_release`: PASS
- `test_unauthorized_user_cannot_call_dedicated_qa_release`: PASS
- `test_authorized_qa_release_succeeds_and_creates_audit_log`: PASS
- `test_cmhp_user_can_access_cmhp_bmr_document`: PASS
- `test_tej_user_cannot_access_cmhp_bmr_document_returns_404`: PASS
- `test_cmhp_user_cannot_access_tej_bmr_document_returns_404`: PASS
- `test_production_status_multi_tenant_isolation`: PASS
- `test_missing_company_context_handled_gracefully`: PASS
- `test_invalid_company_id_returns_404`: PASS

### Frontend Production Build
```
vite v8.3.0 building client environment for production...
✓ 548 modules transformed.
✓ built in 6.28s
dist/index.html (0.91 kB)
dist/assets/index.js (2,688.91 kB)
0 errors.
```

---

## 8. SUMMARY OF CHANGED FILES

### Backend
1. `backend/apps/bmr/views.py` - Secured BMR and status endpoints, generic PATCH QA status guard, QA release endpoint logic.
2. `backend/apps/bmr/urls.py` - Added route for dedicated QA release action.
3. `backend/tests/test_phase1_security.py` - 15 comprehensive security and multi-tenant test cases.

### Frontend
1. `frontend-junior/src/utils/companyBranding.js` - Centralized multi-tenant company and branding resolver.
2. `frontend-junior/src/features/formulas/BmrRequisitionSlipModal.jsx` - Attachment-1 and Attachment-4 logo and company name alignment.
3. `frontend-junior/src/features/formulas/BmrRequisitionSlipModal.css` - Responsive logo styling for Tej Biocare and CMHP logos.
4. `frontend-junior/src/features/formulas/FormulasPage.jsx` - Multi-tenant company context and BMR modal integration.
5. `frontend-junior/src/features/formulas/ProductionRawMaterialCalculator.jsx` - Integrated branding resolution and slip trigger integration.
6. `frontend-junior/src/components/BmrRequisitionDocument.jsx` - Attachment-1 physical format branding and logo display.
7. `frontend-junior/src/features/bmr/BmrPanel.jsx` - BMR plan header branding and logo display.
8. `frontend-junior/src/features/quality/BulkReleaseSlipEditor.jsx` - Attachment-3 bulk release slip branding.
9. `frontend-junior/src/features/quality/bulkReleasePrint.js` - Attachment-3 print template branding.
10. `frontend-junior/src/features/quality/TestRequestSlipEditor.jsx` - TRS editor dual-copy branding.
11. `frontend-junior/src/features/quality/DocumentPreviewModal.jsx` - COA document preview header branding.
12. `frontend-junior/src/features/store/grnNotePrint.js` - GRN warehouse note branding.
13. `frontend-junior/src/features/invoice/InvoiceViewPage.jsx` - Tax invoice header and company details branding.
14. `frontend-junior/src/features/invoice/Invoice.jsx` - Corrected company name mapping.
15. `frontend-junior/src/features/invoice/invoiceService.js` - Corrected company partition mapping.
16. `frontend-junior/src/features/operations/Operations.jsx` - Corrected company key in batch production.
17. `frontend-junior/src/features/quality/qualityService.js` - Corrected company key in QC and QA record generation.
18. `frontend-junior/src/features/hrms/HrDashboard.jsx` & `HrReports.jsx` - Corrected company KPI isolation.
19. `frontend-junior/src/features/products/Products.jsx` - Corrected company prop passing to BMR preview.
20. `frontend-junior/src/features/quality/Quality.jsx` - Corrected company prop passing to BMR review.
21. `frontend-junior/src/utils/formulaExport.js` - Corrected print and Excel export branding.
22. `frontend-junior/src/store/erpSlice.js` - Fixed `resolveCompanyKey` mapping.
23. `frontend-junior/src/store/persistence.js` - Fixed seed order company filtering.
24. `frontend-junior/src/store/store.js` - Fixed company partitioning and default active company.

---

## 9. CONCLUSION

Phase 1 critical security and multi-tenant remediation is complete and verified. The application now enforces strict multi-tenant data isolation, eliminates unauthorized BMR access and arbitrary QA batch release vulnerabilities, and displays the correct branding and logo across all documents for both CMHP Pharmaceuticals and Tej Biocare without regressions.

