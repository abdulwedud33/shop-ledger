'use client';

import { useState } from 'react';
import { Button, Sheet, Skeleton, Amount } from './ui';
import { useApp } from '../lib/session';
import { callAi, saveMemory } from '../lib/api';
import { queuePayment, queueSale, queueStockIn } from '../lib/sync';
import { formatQty } from '../domain/money';
import type { PayMethod } from '../domain/cart';

export interface SaleDraft { kind: 'sale'; lines: { productId: string; name: string; unit: string; qty: number; unitPrice: number }[]; customer: { id: string; name: string } | null; paid: number; method: PayMethod; total: number }
export interface PaymentDraft { kind: 'payment'; customer: { id: string; name: string }; amount: number }
export interface StockInDraft { kind: 'stock_in'; product: { id: string; name: string; unit: string }; qty: number; unitCost: number | null }
export type Draft = SaleDraft | PaymentDraft | StockInDraft;

interface Clarification { field: string; question: string; options: { id: string; label: string }[] }
interface ParseResponse {
  status: 'draft_ready' | 'needs_clarification' | 'unsupported';
  draft: Draft | null; clarifications: Clarification[];
  memorySuggestion: { kind: 'alias'; key: string; value: string } | null; note: string | null;
}

/** Quick entry: type a sentence, check the draft, tap Confirm. The AI never saves anything by itself. */
export function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, money, shop, locale, toast, errorText } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ParseResponse | null>(null);
  const [hints, setHints] = useState<{ field: string; id: string }[]>([]);

  const reset = () => { setRes(null); setText(''); setHints([]); };
  const close = () => { reset(); onClose(); };

  async function run(nextHints: { field: string; id: string }[]) {
    if (!shop || !text.trim()) return;
    setBusy(true);
    try {
      setRes(await callAi<ParseResponse>('ai-parse-entry', { sentence: text.trim().slice(0, 300), locale, hints: nextHints }));
    } catch {
      toast(t('err.AI_UNAVAILABLE'), 'error');
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!shop || !res?.draft) return;
    const d = res.draft;
    try {
      if (d.kind === 'sale') {
        await queueSale({
          shopId: shop.id, customerId: d.customer?.id ?? null, customerName: d.customer?.name ?? null, paid: d.paid,
          method: d.method === 'credit' ? 'cash' : d.method,
          cart: { lines: d.lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, unitPrice: l.unitPrice, qty: l.qty })) },
        });
        toast(t('sell.done'));
      } else if (d.kind === 'payment') {
        await queuePayment(shop.id, { customerId: d.customer.id, amount: d.amount, method: 'cash' });
        toast(t('cust.paid'));
      } else {
        await queueStockIn(shop.id, { productId: d.product.id, qty: d.qty, unitCost: d.unitCost });
        toast(t('prod.stock_added'));
      }
      close();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  async function remember() {
    if (!shop || !res?.memorySuggestion) return;
    try { await saveMemory(shop.id, 'alias', res.memorySuggestion.key, res.memorySuggestion.value); setRes({ ...res, memorySuggestion: null }); } catch (e) { toast(errorText(e), 'error'); }
  }

  const d = res?.draft;
  return (
    <Sheet open={open} onClose={close} title={t('ai.title')}
      footer={d ? (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset} className="flex-1">{t('ai.discard')}</Button>
          <Button onClick={confirm} className="flex-1">{t('common.confirm')}</Button>
        </div>
      ) : (
        <Button block busy={busy} disabled={!text.trim()} onClick={() => run(hints)}>{t('ai.go')}</Button>
      )}>
      {!d && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} placeholder={t('ai.placeholder')}
          aria-label={t('ai.title')} className="w-full rounded-control border border-line bg-surface p-3 text-base" />
      )}
      {busy && <div className="mt-3 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-3/4" /></div>}

      {res?.status === 'unsupported' && <p className="mt-3 text-sm text-slate">{t('ai.unsupported')}</p>}

      {res?.status === 'needs_clarification' && res.clarifications.map((c) => (
        <div key={c.field + c.question} className="mt-3">
          <p className="mb-2 font-medium">{c.question || t('ai.which')}</p>
          <div className="flex flex-wrap gap-2">
            {c.options.map((o) => (
              <Button key={o.id} variant="secondary" onClick={() => { const h = [...hints, { field: c.field, id: o.id }]; setHints(h); void run(h); }}>{o.label}</Button>
            ))}
          </div>
        </div>
      ))}

      {d && (
        <div className="mt-1 rounded-card border border-line p-3">
          <p className="mb-2 text-sm text-slate">{t('ai.draft')}</p>
          {d.kind === 'sale' && (
            <>
              <ul className="space-y-1">{d.lines.map((l) => (
                <li key={l.productId} className="flex justify-between"><span>{l.name} <span className="text-slate">x {formatQty(l.qty)} {l.unit}</span></span><Amount text={money(Math.round(l.unitPrice * l.qty / 1000))} /></li>
              ))}</ul>
              <p className="mt-2 flex justify-between border-t border-line pt-2"><span>{t('sell.total')}</span><Amount text={money(d.total)} /></p>
              {d.customer && <p className="text-sm text-slate">{t('sell.customer')}: {d.customer.name}</p>}
              {d.paid < d.total && <p className="text-sm text-owed-text">{t('sell.on_credit')}: {money(d.total - d.paid)}</p>}
            </>
          )}
          {d.kind === 'payment' && <p className="flex justify-between"><span>{d.customer.name}</span><Amount tone="in" text={money(d.amount)} /></p>}
          {d.kind === 'stock_in' && <p className="flex justify-between"><span>{d.product.name} <span className="text-slate">+{formatQty(d.qty)} {d.product.unit}</span></span></p>}
        </div>
      )}

      {res?.memorySuggestion && d && (
        <div className="mt-3 flex items-center justify-between rounded-card bg-line/50 p-3 text-sm">
          <span>{t('ai.remember')} <b>{res.memorySuggestion.key}</b> = {res.memorySuggestion.value}</span>
          <Button variant="ghost" onClick={remember}>{t('ai.remember_yes')}</Button>
        </div>
      )}
    </Sheet>
  );
}
