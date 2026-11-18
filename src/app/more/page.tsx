'use client';

import Link from 'next/link';
import { AppShell } from '../../components/Shell';
import { Icon, type IconName } from '../../components/icons';
import { Select } from '../../components/ui';
import { useApp } from '../../lib/session';
import { LOCALES, LOCALE_NAMES, type Locale, type MessageKey } from '../../i18n';
import { updateShop } from '../../lib/api';

const ITEMS: { href: string; key: MessageKey; icon: IconName; owner?: boolean }[] = [
  { href: '/reports/', key: 'more.reports', icon: 'report' },
  { href: '/sales/', key: 'more.sales', icon: 'box' },
  { href: '/team/', key: 'more.team', icon: 'users', owner: true },
  { href: '/memory/', key: 'more.memory', icon: 'spark', owner: true },
  { href: '/sync/', key: 'more.sync', icon: 'sync' },
  { href: '/settings/', key: 'more.settings', icon: 'gear', owner: true },
];

export default function MorePage() {
  const { t, role, locale, setLocale, signOut, shop, refreshShop } = useApp();
  return (
    <AppShell title={t('more.title')}>
      <ul className="divide-y divide-line">
        {ITEMS.filter((i) => !i.owner || role === 'owner').map((i) => (
          <li key={i.href}><Link href={i.href} className="flex min-h-16 items-center gap-3 px-4"><Icon name={i.icon} className="text-slate" /><span className="flex-1">{t(i.key)}</span><Icon name="chevron" className="text-slate" /></Link></li>
        ))}
      </ul>
      <div className="p-4">
        <Select label={t('common.language')} value={locale} onChange={async (e) => {
          const l = e.target.value as Locale;
          setLocale(l);
          if (shop && role === 'owner') { try { await updateShop(shop.id, { locale: l }); await refreshShop(); } catch { /* language still changed locally */ } }
        }}>
          {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
        </Select>
        <button type="button" onClick={() => void signOut()} className="min-h-touch w-full rounded-control border border-line text-brick">{t('more.sign_out')}</button>
      </div>
    </AppShell>
  );
}
