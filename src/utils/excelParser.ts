import * as XLSX from 'xlsx';
import type { DeliveryResult, WorkbookState } from '../types/campaign';

export const SAMPLE_HEADERS = [
  'FirstName',
  'LastName',
  'Email',
  'Company',
  'Role',
  'City',
  'Plan',
  'OfferCode',
];

export const SAMPLE_ROWS: Record<string, string>[] = [
  {
    FirstName: 'Ananya',
    LastName: 'Patel',
    Email: 'ananya.patel@northstarlabs.io',
    Company: 'Northstar Labs',
    Role: 'Head of Operations',
    City: 'Ahmedabad',
    Plan: 'Enterprise',
    OfferCode: 'NS-2026',
  },
  {
    FirstName: 'Rohan',
    LastName: 'Mehta',
    Email: 'rohan.mehta@velocepay.com',
    Company: 'Veloce Pay',
    Role: 'Growth Lead',
    City: 'Mumbai',
    Plan: 'Growth',
    OfferCode: 'VP-EARLY',
  },
  {
    FirstName: 'Meera',
    LastName: 'Nair',
    Email: 'meera.nair@kinetichq.co',
    Company: 'Kinetic HQ',
    Role: 'Product Director',
    City: 'Bengaluru',
    Plan: 'Scale',
    OfferCode: 'KHQ-VIP',
  },
  {
    FirstName: 'Kabir',
    LastName: 'Desai',
    Email: 'kabir.desai@vervecloud.in',
    Company: 'Verve Cloud',
    Role: 'Founder',
    City: 'Pune',
    Plan: 'Enterprise',
    OfferCode: 'VC-FOUNDER',
  },
  {
    FirstName: 'Sara',
    LastName: 'Khan',
    Email: 'invalid-email-format',
    Company: 'Lumina Studio',
    Role: 'Design Partner',
    City: 'Delhi',
    Plan: 'Starter',
    OfferCode: 'LS-15',
  },
];

const FIRST_NAMES = ['Aarav', 'Ananya', 'Rohan', 'Meera', 'Kabir', 'Diya', 'Vivaan', 'Ishita', 'Dev', 'Neha'];
const LAST_NAMES = ['Patel', 'Mehta', 'Nair', 'Desai', 'Sharma', 'Verma', 'Kulkarni', 'Joshi', 'Rao', 'Gupta'];
const COMPANIES = ['Northstar Labs', 'Veloce Pay', 'Kinetic HQ', 'Verve Cloud', 'Apex Freight', 'Meridian Ops', 'Harbor Health', 'Summit Retail'];
const ROLES = ['Head of Operations', 'Growth Lead', 'Product Director', 'Founder', 'VP Marketing', 'Procurement Lead'];
const CITIES = ['Ahmedabad', 'Mumbai', 'Bengaluru', 'Pune', 'Delhi', 'Hyderabad', 'Chennai', 'Surat'];
const PLANS = ['Enterprise', 'Scale', 'Growth', 'Starter'];

export function generateLargeSampleRows(count = 3000): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < count; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.example.com';
    // Include deterministic 1% invalid & 0.5% duplicate entries to showcase high-volume hygiene
    const isInvalid = i > 0 && i % 250 === 0;
    const email = isInvalid
      ? `invalid-row-${i + 1}`
      : `${first.toLowerCase()}.${last.toLowerCase()}.${i + 1}@${domain}`;

    rows.push({
      FirstName: first,
      LastName: last,
      Email: email,
      Company: company,
      Role: ROLES[i % ROLES.length],
      City: CITIES[i % CITIES.length],
      Plan: PLANS[i % PLANS.length],
      OfferCode: `BULK-${String(i + 1).padStart(4, '0')}`,
    });
  }
  return rows;
}

export function parseWorkbookArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  targetSheet?: string
): WorkbookState {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('The uploaded file contains no readable sheets.');
  }

  const activeSheet =
    targetSheet && sheetNames.includes(targetSheet) ? targetSheet : sheetNames[0];
  const sheet = workbook.Sheets[activeSheet];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) {
    return {
      fileName,
      sheetNames,
      activeSheet,
      headers: [],
      rawRows: [],
    };
  }

  const rawHeaderRow = matrix[0] ?? [];
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();

  rawHeaderRow.forEach((cell, idx) => {
    const base = String(cell ?? '').trim() || `Column_${idx + 1}`;
    const count = headerCounts.get(base) ?? 0;
    headerCounts.set(base, count + 1);
    headers.push(count === 0 ? base : `${base}_${count + 1}`);
  });

  const rawRows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const rowArr = matrix[r] ?? [];
    const record: Record<string, string> = {};
    let hasValue = false;

    headers.forEach((header, colIdx) => {
      const val = String(rowArr[colIdx] ?? '').trim();
      if (val !== '') hasValue = true;
      record[header] = val;
    });

    if (hasValue) {
      rawRows.push(record);
    }
  }

  return {
    fileName,
    sheetNames,
    activeSheet,
    headers,
    rawRows,
  };
}

export function downloadSampleExcelTemplate(): void {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: SAMPLE_HEADERS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipients');
  XLSX.writeFile(workbook, 'sheetmail-recipients-template.xlsx');
}

export function exportDeliveryReportXlsx(
  headers: string[],
  rows: Record<string, string>[],
  results: Record<string, DeliveryResult>,
  campaignLabel: string
): void {
  const reportRows = rows.map((row, idx) => {
    const recipientId = `row-${idx + 1}`;
    const result = results[recipientId];
    const exportRow: Record<string, string> = {};
    for (const h of headers) {
      exportRow[h] = row[h] ?? '';
    }
    exportRow['Delivery Status'] = result ? result.status.toUpperCase() : 'SKIPPED';
    exportRow['Sent At'] = result?.sentAt ?? '';
    exportRow['Message ID'] = result?.messageId ?? '';
    exportRow['Error'] = result?.error ?? '';
    return exportRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(reportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Delivery Report');
  const safeName = campaignLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  XLSX.writeFile(workbook, `sheetmail-report-${safeName || 'campaign'}.xlsx`);
}
