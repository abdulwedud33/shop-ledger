'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '../components/Shell';
import { Amount, Button, CardSkeleton, Chip, RowSkeleton, Stat } from '../components/ui';
import { useApp } from '../lib/session';
import { getMeta, setMeta } from '../lib/db';
import { callAi, fetchSummary, type Summary } from '../lib/api';
import { useBalances, useCustomers, useProducts } from '../lib/useData';
import { rangeFor } from '../domain/dates';
import { formatQty } from '../domain/money';
import { isLowStock } from '../domain/stock';

interface Insights { summary: string; suggestions: { text: string; kind: string }[]; unavailable: string[] }

export default function HomePage() {
  const { t, money, shop, role, online, toast, locale } = useApp();
  const products = useProducts();
  const customers = useCustomers();
  const balances = useBalances();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const pulledAt = useLiveQuery(() => (shop ? getMeta<number>(`pulled-at:${shop.id}`) : undefined), [shop?.id]);
  const range = useMemo(() => rangeFor('today', shop?.timezone ?? 'UTC'), [shop?.timezone, pulledAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shop) return;
    let alive = true;
    (async () => {
      try {
        const s = await fetchSummary(shop.id, range.from, range.to);
        if (!alive) return;
        setSummary(s);
        await setMeta(`summary:today:${shop.id}`, s);
      } catch {
        const cached = await getMeta<Summary>(`summary:today:${shop.id}`);
        if (alive && cached) setSummary(cached);
      }
    })();
    return () => { alive = false; };
  }, [shop, range.from, range.to, pulledAt, online]);

  const low = (products ?? []).filter((p) => isLowStock(p.stockQty, p.reorderLevel)).slice(0, 5);
  const lowCount = (products ?? []).filter((p) => isLowStock(p.stockQty, p.reorderLevel)).length;
  const names = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const debts = [...(balances?.values() ?? [])].filter((d) => d.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalOwed = debts.reduce((s, d) => s + d.balance, 0);

  async function getInsights() {
    if (!shop) return;
    setAiBusy(true);
    try { setInsights(await callAi<Insights>('ai-insights', { locale, period: 'today' })); }
    catch { toast(t('err.AI_UNAVAILABLE'), 'error'); }
    finally { setAiBusy(false); }
  }

  const loading = products === undefined || customers === undefined || balances === undefined;

  return (
    <AppShell title={shop?.name ?? t('app.name')}>
      <section aria-label={t('home.today')}>
        <h2 className="px-4 pt-4 text-sm font-medium text-slate">{t('home.today')}</h2>
        {!summary && loading ? <CardSkeleton /> : (
          <div className="grid grid-cols-2 gap-3 p-4">
            <Stat label={t('home.sales')} value={money(summary?.salesTotal ?? 0)} />
            <Stat label={t('home.cash_in')} value={money(summary?.cashIn ?? 0)} tone="in" />
            <Stat label={t('home.owed')} value={money(summary?.totalOwed ?? totalOwed)} tone="owed" />
            {role === 'owner'
              ? <Stat label={t('home.profit')} value={money(summary?.profit ?? 0)} tone="in" />
              : <Stat label={t('home.low_title')} value={String(summary?.lowStockCount ?? lowCount)} />}
          </div>
        )}
        {summary && <p className="px-4 text-sm text-slate">{t('home.sales_count', { n: summary.salesCount })}</p>}
      </section>

      {(lowCount > 0 || totalOwed > 0) && (
        <section className="space-y-2 px-4 pt-4" aria-label="Alerts">
          {lowCount > 0 && <div className="flex items-center justify-between rounded-card border border-owed bg-surface p-3"><span className="text-sm">{t('home.low_alert', { n: lowCount })}</span><Chip tone="warn" icon="alert">{t('prod.low')}</Chip></div>}
          {totalOwed > 0 && <div className="flex items-center justify-between rounded-card border border-owed bg-surface p-3"><span className="text-sm">{t('home.debt_alert', { n: debts.length, amount: money(totalOwed) })}</span></div>}
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between px-4"><h2 className="text-lg font-semibold">{t('home.low_title')}</h2><Link href="/products/" className="text-sm text-ledger">{t('common.see_all')}</Link></div>
        {products === undefined ? <RowSkeleton count={3} /> : low.length === 0 ? <p className="px-4 py-3 text-slate">{t('home.low_none')}</p> : (
          <ul className="divide-y divide-line">{low.map((p) => (
            <li key={p.id}><Link href={`/products/?restock=${p.id}`} className="flex min-h-16 items-center justify-between px-4">
              <span className="font-medium">{p.name}</span>
              <span className="flex items-center gap-2"><span className="num text-sm text-slate">{formatQty(p.stockQty)} {p.unit}</span><Chip tone={p.stockQty <= 0 ? 'bad' : 'warn'} icon="alert">{p.stockQty <= 0 ? t('prod.out') : t('prod.low')}</Chip></span>
            </Link></li>
          ))}</ul>
        )}
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between px-4"><h2 className="text-lg font-semibold">{t('home.debt_title')}</h2><Link href="/customers/" className="text-sm text-ledger">{t('common.see_all')}</Link></div>
        {balances === undefined || customers === undefined ? <RowSkeleton count={3} /> : debts.length === 0 ? <p className="px-4 py-3 text-slate">{t('home.debt_none')}</p> : (
          <ul className="divide-y divide-line">{debts.slice(0, 5).map((d) => (
            <li key={d.customerId}><Link href={`/customers/detail/?id=${d.customerId}`} className="flex min-h-16 items-center justify-between px-4">
              <span className="font-medium">{names.get(d.customerId) ?? '...'}</span>
              <span className="flex items-center gap-2">{d.overdue && <Chip tone="bad" icon="alert">{t('cust.overdue', { n: d.daysOpen })}</Chip>}<Amount text={money(d.balance)} tone={d.overdue ? 'late' : 'owed'} /></span>
            </Link></li>
          ))}</ul>
        )}
      </section>

      {role === 'owner' && online && (
        <section className="mt-6 px-4 pb-4">
          <h2 className="mb-2 text-lg font-semibold">{t('ai.insights')}</h2>
          {insights ? (
            <div className="rounded-card border border-line bg-surface p-4">
              <p>{insights.summary}</p>
              {insights.suggestions.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate">{insights.suggestions.map((s, i) => <li key={i}>{s.text}</li>)}</ul>}
            </div>
          ) : <Button variant="secondary" busy={aiBusy} onClick={getInsights}>{t('ai.insights_cta')}</Button>}
        </section>
      )}
    </AppShell>
  );
}
