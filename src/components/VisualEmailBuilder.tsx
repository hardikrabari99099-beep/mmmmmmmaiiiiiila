import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  MousePointerClick,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import type { EmailBlock, VisualEmailDesign } from '../types/campaign';

interface VisualEmailBuilderProps {
  design: VisualEmailDesign;
  headers: string[];
  onChangeDesign: (next: VisualEmailDesign) => void;
}

const ACCENT_SWATCHES = [
  { name: 'Crimson', hex: '#DC2626' },
  { name: 'Cobalt', hex: '#2563EB' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Slate', hex: '#0F172A' },
];

const BLOCK_LABELS: Record<EmailBlock['type'], string> = {
  header: 'Brand Header',
  text: 'Paragraph Text',
  key_value_grid: 'Summary Info Grid',
  cta_banner: 'Action CTA Card',
  footer: 'Corporate Footer',
};

export function VisualEmailBuilder({
  design,
  headers,
  onChangeDesign,
}: VisualEmailBuilderProps) {
  const [selectedTokenHeader, setSelectedTokenHeader] = useState<string>(headers[0] ?? 'FirstName');
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const updateBlock = (blockId: string, updater: (prev: EmailBlock) => EmailBlock) => {
    onChangeDesign({
      ...design,
      blocks: design.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= design.blocks.length) return;
    const next = [...design.blocks];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    onChangeDesign({ ...design, blocks: next });
  };

  const deleteBlock = (blockId: string) => {
    onChangeDesign({
      ...design,
      blocks: design.blocks.filter((b) => b.id !== blockId),
    });
  };

  const addBlock = (type: EmailBlock['type']) => {
    const id = `blk-${type}-${Date.now().toString(36)}`;
    let newBlock: EmailBlock;

    if (type === 'header') {
      newBlock = {
        id,
        type: 'header',
        companyName: 'Your Company',
        kicker: 'Customer Account Update',
        rightLabel: 'Ref: {{OfferCode}}',
        logoUrl: '',
      };
    } else if (type === 'text') {
      newBlock = {
        id,
        type: 'text',
        muted: false,
        content: 'Hi {{FirstName}}, here is an update regarding your {{Company}} account.',
      };
    } else if (type === 'key_value_grid') {
      newBlock = {
        id,
        type: 'key_value_grid',
        items: [
          { id: `kv-${Date.now()}-1`, label: 'Customer', value: '{{FirstName}}' },
          { id: `kv-${Date.now()}-2`, label: 'Plan', value: '{{Plan}}' },
          { id: `kv-${Date.now()}-3`, label: 'Reference', value: '{{OfferCode}}' },
        ],
      };
    } else if (type === 'cta_banner') {
      newBlock = {
        id,
        type: 'cta_banner',
        heading: 'Take the next step for your {{Company}} account',
        subtext: 'Click below to review your update.',
        badgeSymbol: '★',
        buttonLabel: 'Open Portal',
        buttonUrl: 'https://example.com',
      };
    } else {
      newBlock = {
        id,
        type: 'footer',
        links: [
          { id: `fl-${Date.now()}-1`, label: 'Help Center', url: 'https://example.com/help' },
          { id: `fl-${Date.now()}-2`, label: 'Terms & Conditions', url: 'https://example.com/terms' },
        ],
        websiteUrl: 'https://example.com',
        linkedinUrl: 'https://linkedin.com',
        xUrl: '',
        youtubeUrl: '',
        disclaimer: 'Please do not reply to this email if sent from an automated notice address.',
      };
    }

    onChangeDesign({
      ...design,
      blocks: [...design.blocks, newBlock],
    });
  };

  const handleCopyVariable = async (header: string) => {
    const token = `{{${header}}}`;
    setSelectedTokenHeader(header);
    try {
      await navigator.clipboard.writeText(token);
      setCopiedNotice(`Copied ${token}`);
      setTimeout(() => setCopiedNotice(null), 1800);
    } catch {
      setCopiedNotice(`Use ${token}`);
      setTimeout(() => setCopiedNotice(null), 1800);
    }
  };

  return (
    <div className="space-y-4">
      {/* Theme & Variable Helper */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-700">Brand Color</span>
            <div className="flex items-center gap-1.5">
              {ACCENT_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => onChangeDesign({ ...design, accentColor: swatch.hex })}
                  aria-label={`Set brand color ${swatch.name}`}
                  title={swatch.name}
                  className={`h-6 w-6 rounded-md border transition-transform ${
                    design.accentColor.toUpperCase() === swatch.hex
                      ? 'border-slate-900 scale-110 ring-2 ring-slate-900/20'
                      : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom brand accent color"
                value={design.accentColor}
                onChange={(e) => onChangeDesign({ ...design, accentColor: e.target.value })}
                className="h-6 w-7 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="canvas-bg-select" className="text-xs font-medium text-slate-700">
              Canvas
            </label>
            <select
              id="canvas-bg-select"
              value={design.backgroundColor}
              onChange={(e) => onChangeDesign({ ...design, backgroundColor: e.target.value })}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
            >
              <option value="#F1F5F9">Cool Gray</option>
              <option value="#FFFFFF">Pure White</option>
              <option value="#F8FAFC">Soft Slate</option>
            </select>
          </div>
        </div>

        {headers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
            <span className="text-[11px] font-medium text-slate-500 mr-1">
              Click to copy variable:
            </span>
            {headers.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => void handleCopyVariable(h)}
                className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                  selectedTokenHeader === h
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {`{{${h}}}`}
              </button>
            ))}
            {copiedNotice && (
              <span className="text-[11px] font-medium text-emerald-700 ml-1">
                {copiedNotice}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Block List */}
      <div className="space-y-3">
        {design.blocks.map((block, index) => (
          <div
            key={block.id}
            className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-800">
                {index + 1}. {BLOCK_LABELS[block.type]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${BLOCK_LABELS[block.type]} up`}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(index, 1)}
                  disabled={index === design.blocks.length - 1}
                  aria-label={`Move ${BLOCK_LABELS[block.type]} down`}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteBlock(block.id)}
                  aria-label={`Delete ${BLOCK_LABELS[block.type]}`}
                  className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {block.type === 'header' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={block.companyName}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'header' ? { ...b, companyName: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Subtitle / Kicker</label>
                  <input
                    type="text"
                    value={block.kicker}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'header' ? { ...b, kicker: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Right Reference Tag</label>
                  <input
                    type="text"
                    value={block.rightLabel}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'header' ? { ...b, rightLabel: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Logo Image URL (Optional)</label>
                  <input
                    type="url"
                    value={block.logoUrl}
                    placeholder="https://..."
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'header' ? { ...b, logoUrl: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
              </div>
            )}

            {block.type === 'text' && (
              <div className="space-y-2 text-xs">
                <textarea
                  rows={3}
                  value={block.content}
                  onChange={(e) =>
                    updateBlock(block.id, (b) =>
                      b.type === 'text' ? { ...b, content: e.target.value } : b
                    )
                  }
                  className="w-full rounded border border-slate-300 p-2.5 text-slate-900 leading-relaxed"
                />
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={block.muted}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'text' ? { ...b, muted: e.target.checked } : b
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>Render as muted footnote text</span>
                </label>
              </div>
            )}

            {block.type === 'key_value_grid' && (
              <div className="space-y-2 text-xs">
                {block.items.map((item, itemIdx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={item.label}
                      placeholder="Label (e.g. Plan)"
                      aria-label={`Grid column ${itemIdx + 1} label`}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'key_value_grid'
                            ? {
                                ...b,
                                items: b.items.map((it) =>
                                  it.id === item.id ? { ...it, label: e.target.value } : it
                                ),
                              }
                            : b
                        )
                      }
                      className="col-span-5 h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                    />
                    <input
                      type="text"
                      value={item.value}
                      placeholder="Value (e.g. {{Plan}})"
                      aria-label={`Grid column ${itemIdx + 1} value`}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'key_value_grid'
                            ? {
                                ...b,
                                items: b.items.map((it) =>
                                  it.id === item.id ? { ...it, value: e.target.value } : it
                                ),
                              }
                            : b
                        )
                      }
                      className="col-span-6 h-8 rounded border border-slate-300 px-2.5 font-mono text-slate-900"
                    />
                    <button
                      type="button"
                      disabled={block.items.length <= 1}
                      onClick={() =>
                        updateBlock(block.id, (b) =>
                          b.type === 'key_value_grid'
                            ? { ...b, items: b.items.filter((it) => it.id !== item.id) }
                            : b
                        )
                      }
                      aria-label="Remove grid field"
                      className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {block.items.length < 4 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateBlock(block.id, (b) =>
                        b.type === 'key_value_grid'
                          ? {
                              ...b,
                              items: [
                                ...b.items,
                                {
                                  id: `kv-${Date.now().toString(36)}`,
                                  label: 'Field',
                                  value: `{{${headers[0] ?? 'City'}}}`,
                                },
                              ],
                            }
                          : b
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Summary Column</span>
                  </button>
                )}
              </div>
            )}

            {block.type === 'cta_banner' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 mb-1">Banner Headline</label>
                  <input
                    type="text"
                    value={block.heading}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'cta_banner' ? { ...b, heading: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 mb-1">Subtext (Optional)</label>
                  <input
                    type="text"
                    value={block.subtext}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'cta_banner' ? { ...b, subtext: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Button Label</label>
                  <input
                    type="text"
                    value={block.buttonLabel}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'cta_banner' ? { ...b, buttonLabel: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Circle Icon / Symbol</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={block.badgeSymbol}
                    placeholder="₹ or ★ or ✓"
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'cta_banner' ? { ...b, badgeSymbol: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 mb-1">Button Destination URL</label>
                  <input
                    type="text"
                    value={block.buttonUrl}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'cta_banner' ? { ...b, buttonUrl: e.target.value } : b
                      )
                    }
                    className="w-full h-8 rounded border border-slate-300 px-2.5 font-mono text-slate-900"
                  />
                </div>
              </div>
            )}

            {block.type === 'footer' && (
              <div className="space-y-2.5 text-xs">
                <div className="space-y-1.5">
                  <span className="block text-slate-600 font-medium">Footer Links</span>
                  {block.links.map((lnk) => (
                    <div key={lnk.id} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={lnk.label}
                        placeholder="Link text"
                        onChange={(e) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'footer'
                              ? {
                                  ...b,
                                  links: b.links.map((item) =>
                                    item.id === lnk.id ? { ...item, label: e.target.value } : item
                                  ),
                                }
                              : b
                          )
                        }
                        className="col-span-5 h-8 rounded border border-slate-300 px-2.5 text-slate-900"
                      />
                      <input
                        type="text"
                        value={lnk.url}
                        placeholder="https://..."
                        onChange={(e) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'footer'
                              ? {
                                  ...b,
                                  links: b.links.map((item) =>
                                    item.id === lnk.id ? { ...item, url: e.target.value } : item
                                  ),
                                }
                              : b
                          )
                        }
                        className="col-span-6 h-8 rounded border border-slate-300 px-2.5 font-mono text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateBlock(block.id, (b) =>
                            b.type === 'footer'
                              ? { ...b, links: b.links.filter((item) => item.id !== lnk.id) }
                              : b
                          )
                        }
                        aria-label="Remove footer link"
                        className="col-span-1 p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateBlock(block.id, (b) =>
                        b.type === 'footer'
                          ? {
                              ...b,
                              links: [
                                ...b.links,
                                {
                                  id: `fl-${Date.now().toString(36)}`,
                                  label: 'Privacy Policy',
                                  url: 'https://example.com/privacy',
                                },
                              ],
                            }
                          : b
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Footer Link</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 mb-1">Website URL</label>
                    <input
                      type="text"
                      value={block.websiteUrl}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'footer' ? { ...b, websiteUrl: e.target.value } : b
                        )
                      }
                      className="w-full h-8 rounded border border-slate-300 px-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">LinkedIn URL</label>
                    <input
                      type="text"
                      value={block.linkedinUrl}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'footer' ? { ...b, linkedinUrl: e.target.value } : b
                        )
                      }
                      className="w-full h-8 rounded border border-slate-300 px-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">X / Twitter URL</label>
                    <input
                      type="text"
                      value={block.xUrl}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'footer' ? { ...b, xUrl: e.target.value } : b
                        )
                      }
                      className="w-full h-8 rounded border border-slate-300 px-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">YouTube URL</label>
                    <input
                      type="text"
                      value={block.youtubeUrl}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'footer' ? { ...b, youtubeUrl: e.target.value } : b
                        )
                      }
                      className="w-full h-8 rounded border border-slate-300 px-2 text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Copyright & Automated Notice</label>
                  <textarea
                    rows={2}
                    value={block.disclaimer}
                    onChange={(e) =>
                      updateBlock(block.id, (b) =>
                        b.type === 'footer' ? { ...b, disclaimer: e.target.value } : b
                      )
                    }
                    className="w-full rounded border border-slate-300 p-2 text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Block Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-xs font-medium text-slate-500 mr-1">Add Block:</span>
        <button
          type="button"
          onClick={() => addBlock('text')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <Type className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Paragraph</span>
        </button>
        <button
          type="button"
          onClick={() => addBlock('key_value_grid')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Summary Grid</span>
        </button>
        <button
          type="button"
          onClick={() => addBlock('cta_banner')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          <span>CTA Banner</span>
        </button>
        <button
          type="button"
          onClick={() => addBlock('footer')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Footer</span>
        </button>
      </div>
    </div>
  );
}
