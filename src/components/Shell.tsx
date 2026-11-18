'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useApp } from '../lib/session';
import { useSyncSummary } from '../lib/hooks';
import { Banner, cn } from './ui';
import { Icon, type IconName } from './icons';
import { AssistantSheet } from './Assistant';
import type { MessageKey } from '../i18n';

const NAV: { href: string; key: MessageKey; icon: IconName; center?: boolean }[] = [
  { href: '/', key: 'nav.home', icon: 'home' },
  { href: '/products/', key: 'nav.products', icon: 'box' },
  { href: '/sell/', key: 'nav.sell', icon: 'plus', center: true },
  { href: '/customers/', key: 'nav.customers', icon: 'users' },
  { href: '/more/', key: 'nav.more', icon: 'more' },
];

export function AppShell({ title, children, back, action, hideAssistant }: { title: string; children: ReactNode; back?: string; action?: ReactNode; hideAssistant?: boolean }) {
  const { t, online, shop } = useApp();
  const path = usePathname() ?? '/';
  const sync = useSyncSummary(shop?.id);
  const [aiOpen, setAiOpen] = useState(false);
  const waiting = sync.pending + sync.syncing;

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-[calc(76px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          {back && <Link href={back} aria-label={t('common.back')} className="-ml-2 grid h-10 w-10 place-items-center rounded-control"><Icon name="chevron" className="rotate-180" /></Link>}
          <h1 className="flex-1 truncate text-xl font-semibold">{title}</h1>
          {action}
          <Link href="/sync/" className="grid h-10 min-w-10 place-items-center rounded-control px-1 text-slate"
            aria-label={sync.failed ? t('status.failed', { n: sync.failed }) : waiting ? t('status.syncing') : t('status.synced')}>
            {sync.failed > 0 ? <Icon name="alert" className="text-brick" /> : waiting > 0 ? <Icon name="sync" /> : <Icon name="check" className="text-ledger" />}
          </Link>
        </div>
        {!online && <Banner>{t('status.offline')}</Banner>}
      </header>

      <main>{children}</main>

      {!hideAssistant && (
        <button type="button" onClick={() => setAiOpen(true)} aria-label={t('ai.open')}
          className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] right-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-ink shadow-bar">
          <Icon name="spark" />
        </button>
      )}
      <AssistantSheet open={aiOpen} onClose={() => setAiOpen(false)} />

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface shadow-bar">
        <ul className="mx-auto flex max-w-lg items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <li key={n.href} className="flex-1">
                <Link href={n.href} aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-[64px] flex-col items-center justify-center gap-1 text-xs font-medium', active ? 'text-ledger' : 'text-slate')}>
                  {n.center
                    ? <span className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-ledger text-on-ledger shadow-bar"><Icon name="plus" size={26} /></span>
                    : <Icon name={n.icon} />}
                  <span className={cn(n.center && 'mt-0.5')}>{t(n.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
