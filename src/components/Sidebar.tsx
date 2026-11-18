import { FileSpreadsheet, History, Mail, PenSquare, Send, X } from 'lucide-react';
import type { NavSection } from '../types/campaign';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  totalRows: number;
  selectedCount: number;
  fileName: string | null;
  historyCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  step: string;
  icon: typeof FileSpreadsheet;
}> = [
  { id: 'recipients', label: 'Recipients', step: '01', icon: FileSpreadsheet },
  { id: 'compose', label: 'Compose & Preview', step: '02', icon: PenSquare },
  { id: 'dispatch', label: 'Sender & Dispatch', step: '03', icon: Send },
  { id: 'history', label: 'Campaign History', step: '04', icon: History },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  totalRows,
  selectedCount,
  fileName,
  historyCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 w-64 shrink-0">
      <div>
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              SheetMail
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Primary workspace navigation" className="px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const countHint =
              item.id === 'recipients' && totalRows > 0
                ? `${selectedCount}/${totalRows}`
                : item.id === 'history' && historyCount > 0
                  ? `${historyCount}`
                  : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {countHint ? (
                  <span
                    className={`font-mono text-xs tabular-nums shrink-0 ${
                      isActive ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {countHint}
                  </span>
                ) : (
                  <span
                    className={`font-mono text-xs tabular-nums shrink-0 ${
                      isActive ? 'text-slate-400' : 'text-slate-300'
                    }`}
                  >
                    {item.step}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-5 py-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
        <div className="font-medium text-slate-700 truncate">
          {fileName ? fileName : 'No spreadsheet loaded'}
        </div>
        <div className="flex items-center gap-1.5 font-mono tabular-nums text-slate-500">
          <span>{selectedCount} selected</span>
          <span aria-hidden="true">·</span>
          <span>{totalRows} total</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/40"
          />
          <aside className="relative z-50 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
