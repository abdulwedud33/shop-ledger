'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '../../components/Shell';
import { Amount, Button, Chip, Empty, Field, RowSkeleton, Select, Sheet } from '../../components/ui';
import { useApp } from '../../lib/session';
import { db, type LocalSale } from '../../lib/db';
import { queueVoid } from '../../lib/sync';
import { reasonSchema, validate } from '../../lib/schemas';
import { formatQty, lineTotal } from '../../domain/money';

export default function SalesPage() {
  const { t, money, shop, role, locale } = useApp();
  const sales = useLiveQuery(async () => (shop ? (await db.sales.where('shopId').equals(shop.id).reverse().sortBy('createdAt')) : []), [shop?.id]);
  const [open, setOpen] = useState<LocalSale | null>(null);
  const dateLocale = locale === 'om' ? 'en' : locale;

  return (
    <AppShell title={t('sales.title')} back="/more/">
      {sales === undefined ? <RowSkeleton /> : sales.length === 0 ? <Empty title={t('sales.empty')} /> : (
        <ul className="divide-y divide-line">
          {sales.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setOpen(s)} className="flex min-h-16 w-full items-center justify-between px-4 text-left">
                <span>
                  <span className="block font-medium">{s.customerName ?? t(s.method === 'credit' ? 'sell.credit' : 'sell.cash')}</span>
                  <span className="text-sm text-slate">{new Date(s.createdAt).toLocaleString(dateLocale)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {s.sync !== 'synced' && <Chip icon="sync">{t('sales.waiting')}</Chip>}
                  {s.status === 'voided' && <Chip tone="bad">{t('sales.voided')}</Chip>}
                  <Amount text={money(s.total)} className={s.status === 'voided' ? 'line-through opacity-60' : ''} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <SaleSheet sale={open} canVoid={role === 'owner'} onClose={() => setOpen(null)} />}
    </AppShell>
  );
}

function SaleSheet({ sale, canVoid, onClose }: { sale: LocalSale; canVoid: boolean; onClose: () => void }) {
  const { t, money, shop, toast, errorText } = useApp();
  const [voiding, setVoiding] = useState(false);
  const [preset, setPreset] = useState('mistake');
  const [other, setOther] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function doVoid() {
    if (!shop) return;
    const reason = preset === 'mistake' ? t('sales.r_mistake') : preset === 'returned' ? t('sales.r_returned') : other;
    const v = validate(reasonSchema, { reason });
    if (!v.ok) { setErr(t('v.required')); return; }
    try { await queueVoid(shop.id, sale, v.data.reason); toast(t('sales.void_done')); onClose(); } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={t('sales.title')}
      footer={canVoid && sale.status === 'completed' && sale.serverId
        ? (voiding ? <Button block variant="danger" onClick={doVoid}>{t('sales.void')}</Button> : <Button block variant="secondary" onClick={() => setVoiding(true)}>{t('sales.void')}</Button>)
        : undefined}>
      <ul className="space-y-1">{sale.items.map((i) => (
        <li key={i.productId} className="flex justify-between"><span>{i.name} <span className="text-slate">x {formatQty(i.qty)}</span></span><span className="num">{money(lineTotal(i.unitPrice, i.qty))}</span></li>
      ))}</ul>
      <p className="mt-3 flex justify-between border-t border-line pt-3 text-lg"><span>{t('sell.total')}</span><Amount text={money(sale.total)} /></p>
      {sale.paid < sale.total && <p className="flex justify-between text-owed-text"><span>{t('sell.on_credit')}</span><Amount tone="owed" text={money(sale.total - sale.paid)} /></p>}
      {voiding && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate">{t('sales.void_warning')}</p>
          <Select label={t('sales.reason')} value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="mistake">{t('sales.r_mistake')}</option><option value="returned">{t('sales.r_returned')}</option><option value="other">{t('sales.r_other')}</option>
          </Select>
          {preset === 'other' && <Field label={t('sales.reason')} value={other} onChange={(e) => setOther(e.target.value)} error={err} />}
        </div>
      )}
    </Sheet>
  );
}
