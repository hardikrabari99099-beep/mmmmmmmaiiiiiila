import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecipients,
  buildRawMimeMessage,
  detectEmailColumn,
  encodeGmailMimeMessage,
  extractTemplateVariables,
  isValidEmail,
  renderTemplate,
} from './mailMerge';

test('isValidEmail validates standard and rejects malformed addresses', () => {
  assert.equal(isValidEmail('ananya.sharma@acme.io'), true);
  assert.equal(isValidEmail('  rohan+promo@company.co.in  '), true);
  assert.equal(isValidEmail('missing-domain@'), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail(''), false);
});

test('detectEmailColumn picks header by name or email value density', () => {
  const headers = ['Full Name', 'Contact Address', 'Company'];
  const rows = [
    { 'Full Name': 'Aarav', 'Contact Address': 'aarav@example.com', Company: 'Northstar' },
    { 'Full Name': 'Meera', 'Contact Address': 'meera@example.com', Company: 'Veloce' },
  ];
  assert.equal(detectEmailColumn(headers, rows), 'Contact Address');
  assert.equal(detectEmailColumn(['Name', 'Work Email'], []), 'Work Email');
});

test('buildRecipients marks valid, invalid, and duplicate rows accurately', () => {
  const rows = [
    { Name: 'Priya', Email: 'priya@example.com' },
    { Name: 'Priya Dup', Email: 'PRIYA@example.com' },
    { Name: 'Broken', Email: 'bad-email' },
    { Name: 'Karan', Email: 'karan@example.com' },
  ];
  const recipients = buildRecipients(rows, 'Email');
  assert.equal(recipients.length, 4);
  assert.equal(recipients[0].validity, 'valid');
  assert.equal(recipients[0].included, true);
  assert.equal(recipients[1].validity, 'duplicate');
  assert.equal(recipients[1].included, false);
  assert.equal(recipients[2].validity, 'invalid');
  assert.equal(recipients[2].included, false);
  assert.equal(recipients[3].validity, 'valid');
  assert.equal(recipients[3].included, true);
});

test('extractTemplateVariables deduplicates and preserves appearance order', () => {
  const vars = extractTemplateVariables(
    'Hi {{FirstName}}, welcome to {{Company}}! Reminder for {{FirstName}} ({{OfferCode}}).'
  );
  assert.deepEqual(vars, ['FirstName', 'Company', 'OfferCode']);
});

test('renderTemplate substitutes exact and normalized keys and reports missing vars', () => {
  const row = { FirstName: 'Neha', Company: 'Orbit Labs', Plan: '' };
  const result = renderTemplate(
    'Hello {{FirstName}} at {{ company }}, your {{Plan}} tier code is {{MissingCol}}.',
    row
  );
  assert.equal(result.output, 'Hello Neha at Orbit Labs, your  tier code is .');
  assert.deepEqual(result.missingVars, ['Plan', 'MissingCol']);
});

test('encodeGmailMimeMessage produces valid base64url without padding and encodes UTF-8 subjects', () => {
  const rawMime = buildRawMimeMessage({
    from: 'sender@gmail.com',
    fromName: 'Hardik Team',
    to: 'user@example.com',
    subject: 'Namaste 🙏 {{FirstName}} — Exclusive Invite',
    body: '<p>Hello <strong>World</strong></p>',
    isHtml: true,
  });

  assert.ok(rawMime.includes('To: user@example.com'));
  assert.ok(rawMime.includes('Subject: =?UTF-8?B?'));
  assert.ok(rawMime.includes('multipart/alternative'));

  const encoded = encodeGmailMimeMessage({
    from: 'sender@gmail.com',
    to: 'user@example.com',
    subject: 'Plain ASCII Subject',
    body: 'Hello plain text',
    isHtml: false,
  });

  assert.equal(/[+/=]/.test(encoded), false);
});

test('buildRawMimeMessage wraps HTML and PDF attachments in multipart/mixed', () => {
  const mime = buildRawMimeMessage({
    from: 'updates@company.com',
    to: 'customer@example.com',
    subject: 'Monthly Update',
    body: '<p>See attached PDF</p>',
    isHtml: true,
    attachments: [
      {
        filename: 'statement.pdf',
        contentType: 'application/pdf',
        base64Content: 'JVBERi0xLjQK',
      },
    ],
  });

  assert.ok(mime.includes('multipart/mixed'));
  assert.ok(mime.includes('multipart/alternative'));
  assert.ok(mime.includes('Content-Disposition: attachment; filename="statement.pdf"'));
  assert.ok(mime.includes('JVBERi0xLjQK'));
});
