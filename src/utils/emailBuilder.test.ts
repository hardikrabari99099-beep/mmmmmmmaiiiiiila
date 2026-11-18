import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileVisualEmailToHtml,
  createCustomerUpdatePreset,
  createProductReleasePreset,
} from './emailBuilder';
import { renderTemplate } from './mailMerge';

test('createCustomerUpdatePreset compiles to email-safe table HTML preserving merge tokens', () => {
  const design = createCustomerUpdatePreset();
  const html = compileVisualEmailToHtml(design);

  assert.ok(html.includes('role="presentation"'));
  assert.ok(html.includes('max-width:600px'));
  assert.ok(html.includes('{{FirstName}}'));
  assert.ok(html.includes('{{OfferCode}}'));
  assert.ok(html.includes('Enable Now'));

  const merged = renderTemplate(html, {
    FirstName: 'Ananya',
    LastName: 'Patel',
    Company: 'Northstar Labs',
    Plan: 'Enterprise',
    OfferCode: 'NS-2026',
    City: 'Ahmedabad',
  });

  assert.equal(merged.missingVars.length, 0);
  assert.ok(merged.output.includes('Ananya Patel'));
  assert.ok(merged.output.includes('https://example.com/enable?code=NS-2026'));
});

test('compileVisualEmailToHtml escapes unsafe HTML in text fields', () => {
  const design = createProductReleasePreset();
  design.blocks[1] = {
    id: 'test-text',
    type: 'text',
    muted: false,
    content: 'Update <script>alert(1)</script> for {{FirstName}}',
  };

  const html = compileVisualEmailToHtml(design);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
