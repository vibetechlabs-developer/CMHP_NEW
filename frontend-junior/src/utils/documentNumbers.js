/**
 * CMHP Pharmaceutical ERP - Central Document & Entity ID Generator
 *
 * Rules:
 * - Master entities (EMP, CUST, VEND, PROD, ITEM, LOC) are continuous sequences.
 * - Invoices use Indian Financial Year notation: INV/YYYY-YY/0001 (e.g. INV/2026-27/0001).
 * - Orders, Batches, QC, QA use Year-based notation: PREFIX-YYYY-0001.
 * - Sequence counters never decrement, guaranteeing zero duplicates.
 */

export function getIndianFinancialYear(dateInput = new Date()) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  if (month >= 4) {
    const nextYear = String(year + 1).slice(-2);
    return `${year}-${nextYear}`;
  } else {
    const currentYearShort = String(year).slice(-2);
    return `${year - 1}-${currentYearShort}`;
  }
}

export const DOCUMENT_CONFIGS = {
  // Master Entities (Global)
  EMPLOYEE: { prefix: 'EMP', padding: 4, isFY: false, includeYear: false, scopedByCompany: false },
  CUSTOMER: { prefix: 'CUST', padding: 4, isFY: false, includeYear: false, scopedByCompany: false },
  VENDOR: { prefix: 'VEND', padding: 4, isFY: false, includeYear: false, scopedByCompany: false },
  ITEM: { prefix: 'ITM', padding: 4, isFY: false, includeYear: false, scopedByCompany: false },
  PRODUCT: { prefix: 'PRD', padding: 4, isFY: false, includeYear: false, scopedByCompany: false },

  // Commercial & Sales
  INVOICE: { prefix: 'INV', padding: 4, isFY: true, includeYear: true, scopedByCompany: true },
  ORDER: { prefix: 'ORD', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  SALES_ORDER: { prefix: 'SO', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  QUOTATION: { prefix: 'QT', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  CREDIT_NOTE: { prefix: 'CN', padding: 4, isFY: true, includeYear: true, scopedByCompany: true },
  PAYMENT: { prefix: 'PAY', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },

  // Quality Control & Assurance
  QC: { prefix: 'QC', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  QA: { prefix: 'QA', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },

  // Operations & Manufacturing
  BATCH: { prefix: 'BAT', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },

  // Procurement & Supply Chain
  PURCHASE_ORDER: { prefix: 'PO', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  GRN: { prefix: 'GRN', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  BILL: { prefix: 'BILL', padding: 4, isFY: true, includeYear: true, scopedByCompany: true },
  DELIVERY: { prefix: 'DSP', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },

  // HRMS
  LEAVE_REQUEST: { prefix: 'LR', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
  PAYROLL_RUN: { prefix: 'PAYROLL', padding: 4, isFY: false, includeYear: true, scopedByCompany: true },
};

const SEQUENCE_STORAGE_KEY = 'cmhp_document_sequences_v2';

export function getSequenceRegistry() {
  try {
    const raw = localStorage.getItem(SEQUENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Could not read sequence storage:', error);
    return {};
  }
}

export function saveSequenceRegistry(registry) {
  try {
    localStorage.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.warn('Could not save sequence storage:', error);
  }
}

export function buildSequenceKey(docType, companyId = null, period = null) {
  const cfg = DOCUMENT_CONFIGS[docType];
  if (!cfg) throw new Error(`Unknown document type: ${docType}`);

  const parts = [docType];
  if (cfg.scopedByCompany && companyId) {
    parts.push(String(companyId).toUpperCase());
  } else if (cfg.scopedByCompany) {
    parts.push('GLOBAL');
  }

  if (cfg.isFY) {
    parts.push(period || getIndianFinancialYear());
  } else if (cfg.includeYear) {
    parts.push(String(period || new Date().getFullYear()));
  }

  return parts.join(':');
}

export function formatDocumentNumber(docType, sequenceNumber, period = null) {
  const cfg = DOCUMENT_CONFIGS[docType];
  if (!cfg) throw new Error(`Unknown document type: ${docType}`);

  const paddedSeq = String(sequenceNumber).padStart(cfg.padding, '0');

  if (cfg.isFY) {
    const fy = period || getIndianFinancialYear();
    return `${cfg.prefix}/${fy}/${paddedSeq}`;
  }

  if (cfg.includeYear) {
    const year = period || new Date().getFullYear();
    return `${cfg.prefix}-${year}-${paddedSeq}`;
  }

  return `${cfg.prefix}-${paddedSeq}`;
}

export function peekNextDocumentNumber(docType, companyId = null, period = null) {
  const registry = getSequenceRegistry();
  const key = buildSequenceKey(docType, companyId, period);
  const currentSeq = registry[key] || 0;
  const nextSeq = currentSeq + 1;
  return formatDocumentNumber(docType, nextSeq, period);
}

export function previewDocumentNumber(docType, companyId = null, period = null) {
  return peekNextDocumentNumber(docType, companyId, period);
}

export function commitDocumentNumber(docType, companyId = null, period = null) {
  const registry = getSequenceRegistry();
  const key = buildSequenceKey(docType, companyId, period);
  const currentSeq = registry[key] || 0;
  const nextSeq = currentSeq + 1;

  registry[key] = nextSeq;
  saveSequenceRegistry(registry);

  return formatDocumentNumber(docType, nextSeq, period);
}

export function migrateDocumentNumbers(entities = {}) {
  const registry = getSequenceRegistry();
  let changed = false;

  const checkMax = (list = [], docType, extractor) => {
    if (!Array.isArray(list) || !DOCUMENT_CONFIGS[docType]) return;
    const cfg = DOCUMENT_CONFIGS[docType];

    list.forEach((item) => {
      const val = extractor(item);
      if (!val || typeof val !== 'string') return;

      let seq = 0;
      let period = null;

      if (cfg.isFY) {
        // e.g. INV/2026-27/0001
        const m = val.match(new RegExp(`^${cfg.prefix}/(\\d{4}-\\d{2})/(\\d+)$`, 'i'));
        if (m) {
          period = m[1];
          seq = parseInt(m[2], 10);
        }
      } else if (cfg.includeYear) {
        // e.g. ORD-2026-0001
        const m = val.match(new RegExp(`^${cfg.prefix}-(\\d{4})-(\\d+)$`, 'i'));
        if (m) {
          period = m[1];
          seq = parseInt(m[2], 10);
        }
      } else {
        // e.g. EMP-0001
        const m = val.match(new RegExp(`^${cfg.prefix}-(\\d+)$`, 'i'));
        if (m) {
          seq = parseInt(m[1], 10);
        }
      }

      if (seq > 0) {
        const compId = item.company || item.company_id || item.companyId || null;
        const key = buildSequenceKey(docType, compId, period);
        const existing = registry[key] || 0;
        if (seq > existing) {
          registry[key] = seq;
          changed = true;
        }
      }
    });
  };

  if (entities.users) {
    checkMax(entities.users, 'EMPLOYEE', (u) => u.employee_id || u.employeeId);
  }
  if (entities.invoices) {
    checkMax(entities.invoices, 'INVOICE', (i) => i.number || i.invoice_number);
  }
  if (entities.orders) {
    checkMax(entities.orders, 'ORDER', (o) => o.number || o.order_number);
  }
  if (entities.customers) {
    checkMax(entities.customers, 'CUSTOMER', (c) => c.code || c.customer_id);
  }

  if (changed) {
    saveSequenceRegistry(registry);
  }
  return registry;
}