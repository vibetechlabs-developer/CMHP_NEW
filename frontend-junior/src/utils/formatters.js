/**
 * Indian Rupee & Date / Number Formatting Utilities
 * Handles Lakh/Crore grouping, Amount in Words (INR), and DD/MM/YYYY dates.
 */

export function formatINR(value, includeSymbol = true) {
  const num = Number(value) || 0;
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const [integerPart, decimalPart = '00'] = absNum.toFixed(2).split('.');

  // Indian numbering system: rightmost 3 digits, then groups of 2
  let lastThree = integerPart.slice(-3);
  const otherNumbers = integerPart.slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger =
    otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  const result = `${formattedInteger}.${decimalPart}`;
  const prefix = isNegative ? '-' : '';
  return includeSymbol ? `${prefix}₹${result}` : `${prefix}${result}`;
}

export function formatDateIN(dateInput) {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

export function formatDateTimeIN(dateInput) {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const dateStr = formatDateIN(d);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${dateStr}, ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  } catch {
    return String(dateInput);
  }
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function convertBelowThousand(n) {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + ' ';
    n %= 10;
  }
  if (n > 0) {
    str += ONES[n] + ' ';
  }
  return str.trim();
}

/**
 * Converts numeric amount to Indian Rupee Words
 * e.g. 125000 -> "Rupees One Lakh Twenty-Five Thousand Only"
 */
export function numberToWordsINR(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Rupees Zero Only';

  let remaining = Math.abs(num);
  let words = '';

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;

  const hundreds = remaining;

  if (crore > 0) {
    words += convertBelowThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + ' Thousand ';
  }
  if (hundreds > 0) {
    words += convertBelowThousand(hundreds) + ' ';
  }

  const result = `Rupees ${words.trim()} Only`;
  return num < 0 ? `Minus ${result}` : result;
}

export function maskAadhaar(val) {
  if (!val) return '—';
  const clean = String(val).replace(/\D/g, '');
  if (clean.length < 4) return '••••';
  return `•••• •••• ${clean.slice(-4)}`;
}

export function maskPAN(val) {
  if (!val) return '—';
  const str = String(val).trim().toUpperCase();
  if (str.length < 4) return '••••';
  return `••• ••• ${str.slice(-4)}`;
}

export function maskBankAcc(val) {
  if (!val) return '—';
  const str = String(val).trim();
  if (str.length < 4) return '••••';
  return `••••••${str.slice(-4)}`;
}
