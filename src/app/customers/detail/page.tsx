'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '../../../components/Shell';
import { Amount, Button, Empty, Field, RowSkeleton, Select, Sheet, Skeleton } from '../../../components/ui';
import { useApp } from '../../../lib/session';
import { db } from '../../../lib/db';
import { callAi, fetchLedger } from '../../../lib/api';
import { queuePayment } from '../../../lib/sync';
import { paymentSchema, validate } from '../../../lib/schemas';
import { parseMoney, toDecimalString, type Minor } from '../../../domain/money';
import type { PayMethod } from '../../../domain/cart';
import type { MessageKey } from '../../../i18n';

export default function CustomerDetailPage() {
  return <Suspense fallback={<AppShell title="..."><RowSkeleton /></AppShell>}><Inner /></Suspense>;
}

const LEDGER_LABEL: Record<string, MessageKey> = { charge: 'cust.l_charge', payment: 'cust.l_payment', void_reversal: 'cust.l_void', adjustment: 'cust.l_adjustment' };

function Inner() {
  const { t, money, shop, role, online, locale, toast } = useApp();
  const id = useSearchParams().get('id') ?? '';
  const customer = useLiveQuery(() => (id ? db.customers.get(id) : undefined), [id]);
  const balanceRow = useLiveQuery(() => (id ? db.balances.get(id) : undefined), [id]);
  const ledger = useLiveQuery(() => (id ? db.ledger.where('customerId').equals(id).reverse().sortBy('createdAt') : []), [id]);
  const [payOpen, setPayOpen] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Refresh the statement from the server when online; keep pending local rows.
  useEffect(() => {
    if (!shop || !id || !online) return;
    let alive = true;
    void fetchLedger(shop.id, id).then(async (rows) => {
      if (!alive) return;
      await db.transaction('rw', db.ledger, async () => {
        await db.ledger.where('customerId').equals(id).filter((r) => !r.pending).delete();
        await db.ledger.bulkPut(rows);
      });
    }).catch(() => { /* keep cached statement */ });
    return () => { alive = false; };
  }, [shop, id, online, balanceRow?.balance]);

  const balance = balanceRow?.balance ?? 0;
  const charges = (ledger ?? []).filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const pct = charges > 0 ? Math.max(0, Math.min(100, Math.round((1 - balance / charges) * 100))) : 0;

  async function writeReminder() {
    setAiBusy(true);
    try {
      const r = await callAi<{ message: string }>('ai-reminder', { customerId: id, tone: 'friendly', locale });
      setReminder(r.message);
    } catch { toast(t('err.AI_UNAVAILABLE'), 'error'); } finally { setAiBusy(false); }
  }

  if (customer === undefined) return <AppShell title="..." back="/customers/"><RowSkeleton /></AppShell>;
  if (!customer) return <AppShell title={t('cust.title')} back="/customers/"><Empty title={t('cust.not_found')} /></AppShell>;

  return (
    <AppShell title={customer.name} back="/customers/">
      <section className="p-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-slate">{balance > 0 ? t('cust.owes') : t('cust.settled')}</p>
          <p className="text-3xl"><Amount text={money(Math.max(0, balance))} tone={balance > 0 ? (balanceRow?.overdue ? 'late' : 'owed') : 'in'} /></p>
          {balance > 0 && charges > 0 && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full bg-ledger" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-xs text-slate">{t('cust.progress', { pct })}</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled={balance <= 0} onClick={() => setPayOpen(true)}>{t('cust.pay')}</Button>
          {role === 'owner' && balance > 0 && online && <Button variant="secondary" busy={aiBusy} onClick={writeReminder}>{t('cust.remind')}</Button>}
        </div>
      </section>

      <h2 className="px-4 text-lg font-semibold">{t('cust.statement')}</h2>
      {ledger === undefined ? <RowSkeleton count={4} /> : ledger.length === 0 ? (
        <p className="px-4 py-6 text-center text-slate">{t('sales.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {ledger.map((l) => (
            <li key={l.id} className="flex min-h-16 items-center justify-between px-4">
              <span><span className="block">{t(LEDGER_LABEL[l.type] ?? 'cust.l_adjustment')}</span><span className="text-sm text-slate">{new Date(l.createdAt).toLocaleDateString(locale === 'om' ? 'en' : locale)}{l.pending ? ` · ${t('status.saved_local')}` : ''}</span></span>
              <Amount text={money(l.amount)} tone={l.amount < 0 ? 'in' : 'owed'} />
            </li>
          ))}
        </ul>
      )}

      {payOpen && <PaySheet customerId={id} balance={balance} onClose={() => setPayOpen(false)} />}
      <Sheet open={reminder !== null} onClose={() => setReminder(null)} title={t('ai.reminder_draft')}
        footer={<Button block onClick={async () => { try { if (navigator.share) await navigator.share({ text: reminder ?? '' }); else { await navigator.clipboard.writeText(reminder ?? ''); toast(t('common.copied')); } } catch { /* cancelled */ } }}>{t('common.copy')}</Button>}>
        {reminder === null ? <Skeleton className="h-20" /> : <p className="whitespace-pre-wrap">{reminder}</p>}
      </Sheet>
    </AppShell>
  );
}

function PaySheet({ customerId, balance, onClose }: { customerId: string; balance: Minor; onClose: () => void }) {
  const { t, shop, money, toast, errorText } = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Exclude<PayMethod, 'credit'>>('cash');
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!shop) return;
    const v = validate(paymentSchema, { amount });
    const minor = parseMoney(amount);
    if (!v.ok || minor === null) { setErr(t('v.number')); return; }
    if (minor > balance) { setErr(t('err.OVERPAYMENT')); return; }
    try {
      await queuePayment(shop.id, { customerId, amount: minor, method });
      toast(t('cust.paid'));
      onClose();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={t('cust.pay')} footer={<Button block onClick={save}>{t('common.save')}</Button>}>
      <div className="mb-2 flex gap-2">
        <Button variant="secondary" onClick={() => setAmount(toDecimalString(balance).replace(/\.00$/, ''))}>{t('cust.full')} ({money(balance)})</Button>
        <Button variant="secondary" onClick={() => setAmount(toDecimalString(Math.floor(balance / 2)).replace(/\.00$/, ''))}>{t('cust.half')}</Button>
      </div>
      <Field label={t('cust.amount')} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(null); }} error={err} autoFocus />
      <Select label={t('cust.method')} value={method} onChange={(e) => setMethod(e.target.value as Exclude<PayMethod, 'credit'>)}>
        <option value="cash">{t('sell.cash')}</option><option value="mobile_money">{t('sell.mobile_money')}</option><option value="bank">{t('sell.bank')}</option>
      </Select>
    </Sheet>
  );
}
