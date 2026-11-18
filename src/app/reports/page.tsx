'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/Shell';
import { Amount, Button, CardSkeleton, Empty, RowSkeleton, Stat } from '../../components/ui';
import { useApp } from '../../lib/session';
import { fetchSalesForExport, fetchSummary, fetchTopProducts, type Summary, type TopProduct } from '../../lib/api';
import { rangeFor, type Period } from '../../domain/dates';
import { toCsv } from '../../domain/csv';
import { formatQty } from '../../domain/money';

export default function ReportsPage() {
  const { t, money, shop, role, online, toast, errorText } = useApp();
  const [period, setPeriod] = useState<Period>('today');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [top, setTop] = useState<TopProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const range = useMemo(() => rangeFor(period, shop?.timezone ?? 'UTC'), [period, shop?.timezone]);

  useEffect(() => {
    if (!shop) return;
    let alive = true;
    setSummary(null); setTop(null); setFailed(false);
    Promise.all([fetchSummary(shop.id, range.from, range.to), fetchTopProducts(shop.id, range.from, range.to)])
      .then(([s, p]) => { if (alive) { setSummary(s); setTop(p); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [shop, range.from, range.to]);

  async function exportCsv() {
    if (!shop) return;
    try {
      const rows = await fetchSalesForExport(shop.id, range.from, range.to);
      const csv = toCsv([['date', 'total', 'paid', 'method', 'status'], ...rows.map((r) => [r.created_at, r.total, r.paid_amount, r.method, r.status])]);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `sales-${period}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <AppShell title={t('rep.title')} back="/more/">
      <div className="flex gap-2 p-4" role="tablist">
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}
            className={`min-h-touch flex-1 rounded-control border font-medium ${period === p ? 'border-ledger bg-ledger text-on-ledger' : 'border-line bg-surface'}`}>
            {t(p === 'today' ? 'common.today' : p === 'week' ? 'common.week' : 'common.month')}
          </button>
        ))}
      </div>
      {!online && !summary ? <Empty title={t('err.OFFLINE')} /> : failed ? <Empty title={t('err.UNKNOWN')} /> : !summary ? <CardSkeleton /> : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4">
            <Stat label={t('rep.sales')} value={money(summary.salesTotal)} />
            <Stat label={t('rep.cash_in')} value={money(summary.cashIn)} tone="in" />
            <Stat label={t('rep.credit_given')} value={money(summary.creditGiven)} tone="owed" />
            <Stat label={t('rep.collected')} value={money(summary.debtCollected)} tone="in" />
            {role === 'owner' && summary.profit !== null && <Stat label={t('rep.profit')} value={money(summary.profit)} tone="in" />}
          </div>
          <h2 className="px-4 pb-1 pt-6 text-lg font-semibold">{t('rep.top')}</h2>
          {top === null ? <RowSkeleton count={3} /> : top.length === 0 ? <p className="px-4 text-slate">{t('rep.none')}</p> : (
            <ul className="divide-y divide-line">{top.map((p) => (
              <li key={p.productId} className="flex min-h-14 items-center justify-between px-4"><span>{p.name} <span className="text-sm text-slate">x {formatQty(p.qty)} {p.unit}</span></span><Amount text={money(p.revenue)} /></li>
            ))}</ul>
          )}
          <div className="p-4"><Button variant="secondary" block onClick={exportCsv}>{t('rep.export')}</Button></div>
        </>
      )}
    </AppShell>
  );
}
