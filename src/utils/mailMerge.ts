import type { RecipientRecord, RecipientValidity } from '../types/campaign';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function detectEmailColumn(
  headers: string[],
  rows: Record<string, string>[]
): string | null {
  if (headers.length === 0) return null;

  const exactCandidates = ['email', 'emailaddress', 'recipientemail', 'mail', 'to'];
  for (const candidate of exactCandidates) {
    const match = headers.find((h) => normalizeHeaderKey(h) === candidate);
    if (match) return match;
  }

  const partialMatch = headers.find((h) => normalizeHeaderKey(h).includes('email'));
  if (partialMatch) return partialMatch;

  let bestHeader: string | null = null;
  let bestScore = 0;

  const sampleRows = rows.slice(0, 25);
  if (sampleRows.length === 0) return headers[0];

  for (const header of headers) {
    let validCount = 0;
    for (const row of sampleRows) {
      if (isValidEmail(row[header] ?? '')) {
        validCount += 1;
      }
    }
    if (validCount > bestScore) {
      bestScore = validCount;
      bestHeader = header;
    }
  }

  return bestScore > 0 ? bestHeader : headers[0];
}

export function buildRecipients(
  rows: Record<string, string>[],
  emailColumn: string
): RecipientRecord[] {
  const seenEmails = new Set<string>();

  return rows.map((row, index) => {
    const rawEmail = (row[emailColumn] ?? '').trim();
    const normalizedEmail = rawEmail.toLowerCase();

    let validity: RecipientValidity;
    if (!isValidEmail(rawEmail)) {
      validity = 'invalid';
    } else if (seenEmails.has(normalizedEmail)) {
      validity = 'duplicate';
    } else {
      validity = 'valid';
      seenEmails.add(normalizedEmail);
    }

    return {
      id: `row-${index + 1}`,
      rowIndex: index + 1,
      email: rawEmail,
      validity,
      included: validity === 'valid',
      data: row,
    };
  });
}

const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function extractTemplateVariables(template: string): string[] {
  const seen = new Set<string>();
  const vars: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');

  while ((match = regex.exec(template)) !== null) {
    const varName = match[1].trim();
    if (varName && !seen.has(varName)) {
      seen.add(varName);
      vars.push(varName);
    }
  }
  return vars;
}

export function resolveRowValue(row: Record<string, string>, variableName: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(row, variableName)) {
    return row[variableName];
  }
  const targetNorm = normalizeHeaderKey(variableName);
  const matchingKey = Object.keys(row).find((key) => normalizeHeaderKey(key) === targetNorm);
  if (matchingKey !== undefined) {
    return row[matchingKey];
  }
  return undefined;
}

export function renderTemplate(
  template: string,
  row: Record<string, string>
): { output: string; missingVars: string[] } {
  const missingSet = new Set<string>();

  const output = template.replace(VARIABLE_REGEX, (_fullMatch, rawKey: string) => {
    const key = rawKey.trim();
    const val = resolveRowValue(row, key);
    if (val === undefined || val.trim() === '') {
      missingSet.add(key);
      return '';
    }
    return val;
  });

  return {
    output,
    missingVars: Array.from(missingSet),
  };
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 12px 0;line-height:1.55;">${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function encodeBase64Url(str: string): string {
  return toBase64Utf8(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function encodeMimeSubject(subject: string): string {
  // Use RFC 2047 UTF-8 Base64 encoding when non-ASCII characters are present
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject.replace(/[\r\n]+/g, ' ');
  }
  return `=?UTF-8?B?${toBase64Utf8(subject.replace(/[\r\n]+/g, ' '))}?=`;
}

function wrapBase64Lines(base64: string, lineLength = 76): string {
  const clean = base64.replace(/\s+/g, '');
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += lineLength) {
    lines.push(clean.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
}

export interface MimeAttachmentInput {
  filename: string;
  contentType: string;
  base64Content: string;
}

export interface MimeMessageInput {
  to: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  body: string;
  isHtml: boolean;
  attachments?: MimeAttachmentInput[];
}

function buildBodyMimeSection(body: string, isHtml: boolean, altBoundary: string): string[] {
  if (isHtml) {
    const plainFallback = htmlToPlainText(body);
    return [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(toBase64Utf8(plainFallback)),
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(toBase64Utf8(body)),
      `--${altBoundary}--`,
    ];
  }

  return [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64Lines(toBase64Utf8(body)),
  ];
}

export function buildRawMimeMessage(input: MimeMessageInput): string {
  const headers: string[] = [];

  if (input.from) {
    const cleanFromName = input.fromName?.trim().replace(/["\r\n]/g, '');
    if (cleanFromName) {
      const encodedName = /^[\x20-\x7E]*$/.test(cleanFromName)
        ? `"${cleanFromName}"`
        : encodeMimeSubject(cleanFromName);
      headers.push(`From: ${encodedName} <${input.from.trim()}>`);
    } else {
      headers.push(`From: ${input.from.trim()}`);
    }
  }

  headers.push(`To: ${input.to.trim()}`);

  if (input.replyTo?.trim()) {
    headers.push(`Reply-To: ${input.replyTo.trim()}`);
  }

  headers.push(`Subject: ${encodeMimeSubject(input.subject)}`);
  headers.push('MIME-Version: 1.0');

  const nonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const altBoundary = `sheetmail_alt_${nonce}`;
  const attachments = input.attachments ?? [];

  if (attachments.length === 0) {
    const bodyLines = buildBodyMimeSection(input.body, input.isHtml, altBoundary);
    return `${headers.join('\r\n')}\r\n${bodyLines.join('\r\n')}`;
  }

  const mixedBoundary = `sheetmail_mix_${nonce}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts: string[] = [
    `--${mixedBoundary}`,
    ...buildBodyMimeSection(input.body, input.isHtml, altBoundary),
  ];

  for (const att of attachments) {
    const safeName = att.filename.replace(/["\r\n]/g, '_');
    const mimeType = att.contentType || 'application/octet-stream';
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${mimeType}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(att.base64Content)
    );
  }

  parts.push(`--${mixedBoundary}--`);
  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
}

export function encodeGmailMimeMessage(input: MimeMessageInput): string {
  return encodeBase64Url(buildRawMimeMessage(input));
}
