import { ArrowRight, Menu } from 'lucide-react';
import type { NavSection } from '../types/campaign';

interface TopBarProps {
  activeSection: NavSection;
  fileName: string | null;
  selectedCount: number;
  isSending: boolean;
  onOpenMobileMenu: () => void;
  onNavigate: (section: NavSection) => void;
  onOpenConfirmSend: () => void;
  canSend: boolean;
}

const SECTION_TITLES: Record<NavSection, string> = {
  recipients: 'Recipients Sheet',
  compose: 'Compose & Preview',
  dispatch: 'Sender & Dispatch',
  history: 'Campaign History',
};

export function TopBar({
  activeSection,
  fileName,
  selectedCount,
  isSending,
  onOpenMobileMenu,
  onNavigate,
  onOpenConfirmSend,
  canSend,
}: TopBarProps) {
  const renderPrimaryAction = () => {
    if (activeSection === 'recipients') {
      return (
        <button
          type="button"
          onClick={() => onNavigate('compose')}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span>Compose Email</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      );
    }

    if (activeSection === 'compose') {
      return (
        <button
          type="button"
          onClick={() => onNavigate('dispatch')}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span>Sender & Dispatch</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      );
    }

    if (activeSection === 'dispatch') {
      return (
        <button
          type="button"
          onClick={onOpenConfirmSend}
          disabled={!canSend || isSending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span>{isSending ? 'Sending Campaign...' : `Review & Send (${selectedCount})`}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onNavigate('recipients')}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <span>New Campaign</span>
      </button>
    );
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 whitespace-nowrap hidden sm:inline">Workspace</span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
          <h1 className="font-display font-semibold text-slate-900 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
          {fileName && (
            <>
              <span className="text-slate-300 hidden md:inline" aria-hidden="true">·</span>
              <span className="text-xs text-slate-500 font-mono truncate max-w-[200px] hidden md:inline">
                {fileName}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0">{renderPrimaryAction()}</div>
    </header>
  );
}
