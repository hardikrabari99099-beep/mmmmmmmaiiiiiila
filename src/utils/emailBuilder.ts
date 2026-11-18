import type { EmailBlock, VisualEmailDesign } from '../types/campaign';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTextWithBreaks(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '#';
  // Allow https://, http://, mailto:, or merge tokens like {{PortalUrl}}
  if (
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^\{\{[\s\S]+\}\}$/.test(trimmed)
  ) {
    return trimmed.replace(/"/g, '%22');
  }
  return `https://${trimmed.replace(/"/g, '%22')}`;
}

export function createCustomerUpdatePreset(): VisualEmailDesign {
  return {
    accentColor: '#DC2626',
    backgroundColor: '#F1F5F9',
    blocks: [
      {
        id: 'blk-header-1',
        type: 'header',
        companyName: 'Your Company',
        kicker: 'Customer Account Update',
        rightLabel: 'Ref: {{OfferCode}}',
        logoUrl: '',
      },
      {
        id: 'blk-intro-1',
        type: 'text',
        muted: false,
        content:
          'Hi {{FirstName}}, here is your latest account summary for {{Company}}. Review your active details below and use your account reference when contacting support.',
      },
      {
        id: 'blk-grid-1',
        type: 'key_value_grid',
        items: [
          { id: 'kv-1', label: 'Customer Name', value: '{{FirstName}} {{LastName}}' },
          { id: 'kv-2', label: 'Active Plan', value: '{{Plan}}' },
          { id: 'kv-3', label: 'Account Code', value: '{{OfferCode}}' },
        ],
      },
      {
        id: 'blk-cta-1',
        type: 'cta_banner',
        heading: 'Stay stress-free with automatic updates & priority renewal',
        subtext: 'Activate instant billing & product update alerts for your {{Plan}} workspace.',
        badgeSymbol: '★',
        buttonLabel: 'Enable Now',
        buttonUrl: 'https://example.com/enable?code={{OfferCode}}',
      },
      {
        id: 'blk-note-1',
        type: 'text',
        muted: false,
        content:
          'Please keep your contact details for {{City}} up to date so you never miss critical service notices or release notes.\n\nNote: If you have an attached PDF summary below, you can open it using any standard PDF viewer.',
      },
      {
        id: 'blk-footer-1',
        type: 'footer',
        links: [
          { id: 'fl-1', label: 'Help & Security Tips', url: 'https://example.com/help' },
          { id: 'fl-2', label: 'Terms & Conditions', url: 'https://example.com/terms' },
          { id: 'fl-3', label: 'Contact Us', url: 'https://example.com/contact' },
        ],
        websiteUrl: 'https://example.com',
        linkedinUrl: 'https://linkedin.com',
        xUrl: 'https://x.com',
        youtubeUrl: 'https://youtube.com',
        disclaimer:
          'Copyright © 2026 Your Company · Privacy Policy\nPlease do not reply to this email if sent from an automated notification address.',
      },
    ],
  };
}

export function createProductReleasePreset(): VisualEmailDesign {
  return {
    accentColor: '#2563EB',
    backgroundColor: '#F8FAFC',
    blocks: [
      {
        id: 'blk-header-2',
        type: 'header',
        companyName: 'SheetMail Cloud',
        kicker: 'Product Release · Existing Customers',
        rightLabel: '{{Plan}} Tier',
        logoUrl: '',
      },
      {
        id: 'blk-intro-2',
        type: 'text',
        muted: false,
        content:
          'Hello {{FirstName}},\n\nAs an existing {{Company}} customer in {{City}}, you now have early access to our newest workflow upgrades with zero extra setup.',
      },
      {
        id: 'blk-cta-2',
        type: 'cta_banner',
        heading: 'Explore what is new in your {{Plan}} workspace',
        subtext: 'Use customer code {{OfferCode}} to unlock priority onboarding with our team.',
        badgeSymbol: '→',
        buttonLabel: 'View Release Notes',
        buttonUrl: 'https://example.com/releases?code={{OfferCode}}',
      },
      {
        id: 'blk-grid-2',
        type: 'key_value_grid',
        items: [
          { id: 'kv-a', label: 'Organization', value: '{{Company}}' },
          { id: 'kv-b', label: 'Your Role', value: '{{Role}}' },
          { id: 'kv-c', label: 'Access Code', value: '{{OfferCode}}' },
        ],
      },
      {
        id: 'blk-footer-2',
        type: 'footer',
        links: [
          { id: 'fl-a', label: 'Release Changelog', url: 'https://example.com/changelog' },
          { id: 'fl-b', label: 'Support Portal', url: 'https://example.com/support' },
        ],
        websiteUrl: 'https://example.com',
        linkedinUrl: 'https://linkedin.com',
        xUrl: '',
        youtubeUrl: '',
        disclaimer:
          'You received this update because you are an active customer of SheetMail Cloud.',
      },
    ],
  };
}

function renderBlockHtml(block: EmailBlock, accentColor: string): string {
  switch (block.type) {
    case 'header': {
      const hasLogo = Boolean(block.logoUrl.trim());
      return `
        <tr>
          <td style="padding:24px 28px 18px 28px;border-bottom:2px solid ${escapeHtml(accentColor)};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="text-align:left;">
                  ${
                    hasLogo
                      ? `<img src="${sanitizeUrl(block.logoUrl)}" alt="${escapeHtml(block.companyName)}" style="max-height:34px;width:auto;display:block;border:0;" />`
                      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:700;color:#0F172A;letter-spacing:-0.01em;">${escapeHtml(block.companyName || 'Company')}</div>`
                  }
                  ${
                    block.kicker.trim()
                      ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748B;margin-top:4px;">${escapeHtml(block.kicker)}</div>`
                      : ''
                  }
                </td>
                ${
                  block.rightLabel.trim()
                    ? `<td valign="middle" style="text-align:right;font-family:Courier New,monospace;font-size:12px;color:#475569;white-space:nowrap;">${escapeHtml(block.rightLabel)}</td>`
                    : ''
                }
              </tr>
            </table>
          </td>
        </tr>
      `;
    }

    case 'text': {
      const color = block.muted ? '#64748B' : '#1E293B';
      const fontSize = block.muted ? '13px' : '14px';
      return `
        <tr>
          <td style="padding:18px 28px 6px 28px;font-family:Arial,Helvetica,sans-serif;font-size:${fontSize};line-height:1.65;color:${color};">
            ${formatTextWithBreaks(block.content)}
          </td>
        </tr>
      `;
    }

    case 'key_value_grid': {
      const items = block.items.slice(0, 4);
      if (items.length === 0) return '';
      const widthPct = Math.floor(100 / items.length);
      const cells = items
        .map(
          (item) => `
            <td width="${widthPct}%" valign="top" style="padding:12px 10px;text-align:center;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:#475569;text-decoration:underline;margin-bottom:6px;">
                ${escapeHtml(item.label || 'Field')}
              </div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#0F172A;word-break:break-word;">
                ${escapeHtml(item.value || '—')}
              </div>
            </td>
          `
        )
        .join('');

      return `
        <tr>
          <td style="padding:14px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #CBD5E1;border-radius:10px;background-color:#FFFFFF;">
              <tr>
                ${cells}
              </tr>
            </table>
          </td>
        </tr>
      `;
    }

    case 'cta_banner': {
      return `
        <tr>
          <td style="padding:14px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:12px;background-color:#F8FAFC;">
              <tr>
                <td style="padding:22px 20px;text-align:center;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:${escapeHtml(accentColor)};line-height:1.35;margin-bottom:14px;">
                    ${escapeHtml(block.heading)}
                  </div>
                  ${
                    block.badgeSymbol.trim()
                      ? `<div style="display:inline-block;width:54px;height:54px;line-height:54px;border-radius:50%;border:2px solid #CBD5E1;background-color:#FFFFFF;color:${escapeHtml(accentColor)};font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;text-align:center;margin-bottom:14px;">${escapeHtml(block.badgeSymbol.trim())}</div>`
                      : ''
                  }
                  ${
                    block.subtext.trim()
                      ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#475569;max-width:440px;margin:0 auto 16px auto;">${escapeHtml(block.subtext)}</div>`
                      : ''
                  }
                  <div>
                    <a href="${sanitizeUrl(block.buttonUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 26px;border-radius:8px;background-color:${escapeHtml(accentColor)};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">
                      ${escapeHtml(block.buttonLabel || 'Learn More')}
                    </a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }

    case 'footer': {
      const navLinksHtml = block.links
        .filter((l) => l.label.trim())
        .map(
          (l) =>
            `<a href="${sanitizeUrl(l.url)}" target="_blank" rel="noopener noreferrer" style="color:${escapeHtml(accentColor)};text-decoration:none;font-weight:500;">${escapeHtml(l.label)}</a>`
        )
        .join('<span style="color:#CBD5E1;padding:0 10px;">|</span>');

      const socials: Array<{ name: string; url: string }> = [
        { name: 'Website', url: block.websiteUrl },
        { name: 'LinkedIn', url: block.linkedinUrl },
        { name: 'X', url: block.xUrl },
        { name: 'YouTube', url: block.youtubeUrl },
      ].filter((s) => s.url.trim() !== '');

      const socialsHtml = socials
        .map(
          (s) =>
            `<a href="${sanitizeUrl(s.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 6px;padding:4px 9px;border:1px solid #E2E8F0;border-radius:5px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:#334155;text-decoration:none;background-color:#FFFFFF;">${escapeHtml(s.name)}</a>`
        )
        .join('');

      return `
        <tr>
          <td style="padding:20px 28px 26px 28px;border-top:1px solid #E2E8F0;text-align:center;">
            ${
              navLinksHtml
                ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin-bottom:14px;">${navLinksHtml}</div>`
                : ''
            }
            ${socialsHtml ? `<div style="margin-bottom:14px;">${socialsHtml}</div>` : ''}
            ${
              block.disclaimer.trim()
                ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#64748B;">${formatTextWithBreaks(block.disclaimer)}</div>`
                : ''
            }
          </td>
        </tr>
      `;
    }
  }
}

export function compileVisualEmailToHtml(design: VisualEmailDesign): string {
  const accent = /^#[0-9A-Fa-f]{3,8}$/.test(design.accentColor.trim())
    ? design.accentColor.trim()
    : '#DC2626';
  const bg = /^#[0-9A-Fa-f]{3,8}$/.test(design.backgroundColor.trim())
    ? design.backgroundColor.trim()
    : '#F1F5F9';

  const blocksHtml = design.blocks.map((block) => renderBlockHtml(block, accent)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
          ${blocksHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
