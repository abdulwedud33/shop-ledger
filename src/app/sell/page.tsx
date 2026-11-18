'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '../../components/Shell';
import { Amount, Button, Empty, Field, Sheet, TileSkeleton, cn } from '../../components/ui';
import { Icon } from '../../components/icons';
import { CustomerPicker, type PickedCustomer } from '../../components/CustomerPicker';
import { useApp } from '../../lib/session';
import { useBalances, useCustomers, useProducts } from '../../lib/useData';
import { db, type LocalSale } from '../../lib/db';
import { queueSale } from '../../lib/sync';
import { addOne, cartTotal, checkPayment, emptyCart, removeLine, setQty, type Cart, type PayMethod } from '../../domain/cart';
import { filterBy } from '../../domain/search';
import { formatQty, lineTotal, parseMoney, parseQty, toDecimalString } from '../../domain/money';
import { stockCheck } from '../../domain/stock';
import { receiptText } from '../../domain/receipt';

type Method = Exclude<PayMethod, 'credit'> | 'credit';

export default function SellPage() {
  const { t, money, shop, locale, toast } = useApp();
  const products = useProducts();
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [q, setQ] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState<LocalSale | null>(null);

  // Frequent products first (from the last 50 sales on this phone).
  const freq = useLiveQuery(async () => {
    if (!shop) return new Map<string, number>();
    const sales = await db.sales.where('shopId').equals(shop.id).reverse().limit(50).toArray();
    const m = new Map<string, number>();
    for (const s of sales) for (const i of s.items) m.set(i.productId, (m.get(i.productId) ?? 0) + 1);
    return m;
  }, [shop?.id]);

  const tiles = useMemo(() => {
    const sorted = [...(products ?? [])].sort((a, b) => (freq?.get(b.id) ?? 0) - (freq?.get(a.id) ?? 0) || a.name.localeCompare(b.name));
    return filterBy(sorted, q, (p) => p.name, 60);
  }, [products, freq, q]);

  const total = cartTotal(cart);
  const count = cart.lines.length;

  function add(id: string) {
    const p = products?.find((x) => x.id === id);
    if (!p || !shop) return;
    const inCart = cart.lines.find((l) => l.productId === id)?.qty ?? 0;
    const check = stockCheck(p.stockQty, inCart + 1000, p.reorderLevel, shop.allowNegativeStock);
    if (check.blocked) { toast(t('err.STOCK_LOW'), 'error'); return; }
    setCart((c) => addOne(c, { id: p.id, name: p.name, unit: p.unit, sellPrice: p.sellPrice }));
  }

  if (done) {
    return <Receipt sale={done} onNew={() => { setDone(null); setCart(emptyCart); setQ(''); }} />;
  }

  return (
    <AppShell title={t('sell.title')} hideAssistant={count > 0}>
      <div className="p-4 pb-2">
        <label className="relative block">
          <span className="sr-only">{t('sell.search')}</span>
          <Icon name="search" className="absolute left-3 top-3.5 text-slate" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={t('sell.search')} className="min-h-touch w-full rounded-control border border-line bg-surface pl-10 pr-3" />
        </label>
      </div>

      {products === undefined ? <TileSkeleton /> : products.length === 0 ? (
        <Empty title={t('sell.no_products')} action={<Link href="/products/" className="text-ledger underline">{t('nav.products')}</Link>} />
      ) : (
        <ul className={cn('grid grid-cols-2 gap-2 p-4', count > 0 && 'pb-28')}>
          {tiles.map((p) => {
            const qty = cart.lines.find((l) => l.productId === p.id)?.qty ?? 0;
            const left = p.stockQty - qty;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => add(p.id)}
                  className={cn('relative flex min-h-[72px] w-full min-w-[96px] flex-col justify-between rounded-card border bg-surface p-3 text-left transition-transform duration-100 active:scale-[0.97]', qty > 0 ? 'border-ledger' : 'border-line')}>
                  <span className="line-clamp-2 font-semibold">{p.name}</span>
                  <span className="mt-1 flex items-center justify-between text-sm"><span className="num text-slate">{money(p.sellPrice)}</span>
                    {left <= p.reorderLevel && <span className="text-xs text-owed-text">{t('sell.low_left', { n: formatQty(Math.max(0, left)) })}</span>}</span>
                  {qty > 0 && <span className="num absolute right-2 top-2 rounded-full bg-ledger px-2 text-xs font-semibold text-on-ledger">{formatQty(qty)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg px-4 pb-2">
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-bar">
            <button type="button" onClick={() => setCartOpen(true)} className="min-h-touch flex-1 text-left">
              <span className="block text-sm text-slate">{t('sell.items', { n: count })}</span>
              <Amount text={money(total)} className="text-2xl" />
            </button>
            <Button onClick={() => setPayOpen(true)}>{t('sell.charge', { amount: money(total) })}</Button>
          </div>
        </div>
      )}

      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setCart={setCart} />
      {payOpen && shop && <PaySheet cart={cart} onClose={() => setPayOpen(false)} onDone={(s) => { setPayOpen(false); setDone(s); }} />}
    </AppShell>
  );
}

function CartSheet({ open, onClose, cart, setCart }: { open: boolean; onClose: () => void; cart: Cart; setCart: (c: Cart) => void }) {
  const { t, money } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title={t('sell.title')} footer={<Button block onClick={onClose}>{t('common.done')}</Button>}>
      {cart.lines.length === 0 ? <p className="py-6 text-center text-slate">{t('sell.empty')}</p> : (
        <ul className="divide-y divide-line">
          {cart.lines.map((l) => (
            <li key={l.productId} className="flex items-center gap-3 py-2">
              <div className="flex-1"><p className="font-medium">{l.name}</p><p className="num text-sm text-slate">{money(l.unitPrice)} x {formatQty(l.qty)} = {money(lineTotal(l.unitPrice, l.qty))}</p></div>
              <input aria-label={t('prod.qty')} inputMode="decimal" defaultValue={formatQty(l.qty)} key={l.qty}
                onBlur={(e) => { const m = parseQty(e.target.value); if (m) setCart(setQty(cart, l.productId, m)); }}
                className="num min-h-touch w-20 rounded-control border border-line bg-surface px-2 text-center" />
              <button type="button" aria-label={t('sell.remove')} onClick={() => setCart(removeLine(cart, l.productId))} className="grid h-12 w-10 place-items-center text-slate"><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function PaySheet({ cart, onClose, onDone }: { cart: Cart; onClose: () => void; onDone: (s: LocalSale) => void }) {
  const { t, money, shop, toast, errorText } = useApp();
  const customers = useCustomers();
  const balances = useBalances();
  const total = cartTotal(cart);
  const [method, setMethod] = useState<Method>('cash');
  const [paidText, setPaidText] = useState(toDecimalString(total).replace(/\.00$/, '')); // smart default: full amount
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [busy, setBusy] = useState(false);

  const paid = method === 'credit' ? 0 : (parseMoney(paidText) ?? -1);
  const issues = checkPayment({ total, paid, customerId: customer?.id ?? null });
  const credit = Math.max(0, total - Math.max(0, paid));
  const cust = customers?.find((c) => c.id === customer?.id);
  const balance = customer ? balances?.get(customer.id)?.balance ?? 0 : 0;
  const overLimit = !!cust?.creditLimit && credit > 0 && balance + credit > cust.creditLimit;

  const METHODS: { id: Method; label: string }[] = [
    { id: 'cash', label: t('sell.cash') }, { id: 'mobile_money', label: t('sell.mobile_money') },
    { id: 'bank', label: t('sell.bank') }, { id: 'credit', label: t('sell.credit') },
  ];

  async function confirm() {
    if (!shop || issues.length > 0 || overLimit) return;
    setBusy(true);
    try {
      const sale = await queueSale({
        shopId: shop.id, cart, paid, method: method === 'credit' ? 'cash' : method, customerId: customer?.id ?? null, customerName: customer?.name ?? null,
      });
      onDone(sale);
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title={t('sell.payment')}
      footer={<Button block busy={busy} disabled={issues.length > 0 || overLimit} onClick={confirm}>{t('sell.confirm')} · {money(total)}</Button>}>
      <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('sell.payment')}>
        {METHODS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
            onClick={() => { setMethod(m.id); if (m.id !== 'credit' && (parseMoney(paidText) ?? 0) === 0) setPaidText(toDecimalString(total).replace(/\.00$/, '')); }}
            className={cn('min-h-touch rounded-control border px-4 font-medium', method === m.id ? 'border-ledger bg-ledger text-on-ledger' : 'border-line bg-surface')}>
            {m.label}
          </button>
        ))}
      </div>
      {method !== 'credit' && (
        <Field label={t('sell.paid_now')} inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)}
          error={paid < 0 ? t('v.number') : issues.includes('PAID_EXCEEDS_TOTAL') ? t('err.OVERPAYMENT') : null} />
      )}
      {credit > 0 && paid >= 0 && (
        <div className="mb-3 rounded-control bg-owed/10 p-3">
          <p className="flex justify-between text-owed-text"><span>{t('sell.on_credit')}</span><Amount tone="owed" text={money(credit)} /></p>
          <p className="mb-2 mt-1 text-sm text-slate">{t('sell.customer')}</p>
          <CustomerPicker value={customer} onChange={setCustomer} />
          {customer && <p className="mt-2 flex justify-between text-sm text-slate"><span>{t('sell.balance')}</span><span className="num">{money(balance)}</span></p>}
          {cust?.creditLimit ? <p className="flex justify-between text-sm text-slate"><span>{t('sell.limit')}</span><span className="num">{money(cust.creditLimit)}</span></p> : null}
          {overLimit && <p className="mt-2 text-sm text-brick" role="alert">{t('err.LIMIT_EXCEEDED')}</p>}
          {issues.includes('CUSTOMER_REQUIRED') && <p className="mt-2 text-sm text-brick">{t('err.CUSTOMER_REQUIRED')}</p>}
        </div>
      )}
    </Sheet>
  );
}

function Receipt({ sale, onNew }: { sale: LocalSale; onNew: () => void }) {
  const { t, money, shop, locale, toast } = useApp();
  const text = receiptText({
    shopName: shop?.name ?? '', at: new Date(sale.createdAt), locale, total: sale.total, paid: sale.paid, customerName: sale.customerName,
    lines: sale.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, unitPrice: i.unitPrice, qty: i.qty })),
    labels: { title: t('receipt.title'), total: t('sell.total'), paid: t('sell.paid_now'), credit: t('sell.on_credit'), thanks: t('receipt.thanks') },
  });
  async function share() {
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast(t('common.copied')); }
    } catch { /* share cancelled */ }
  }
  return (
    <AppShell title={t('sell.done')} hideAssistant>
      <div className="p-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-ledger"><Icon name="check" /><b>{t('sell.done')}</b></div>
          <ul className="space-y-1">{sale.items.map((i) => (
            <li key={i.productId} className="flex justify-between"><span>{i.name} <span className="text-slate">x {formatQty(i.qty)}</span></span><span className="num">{money(lineTotal(i.unitPrice, i.qty))}</span></li>
          ))}</ul>
          <p className="mt-3 flex justify-between border-t border-line pt-3 text-xl"><span>{t('sell.total')}</span><Amount text={money(sale.total)} /></p>
          {sale.paid < sale.total && <p className="flex justify-between text-owed-text"><span>{t('sell.on_credit')}</span><Amount tone="owed" text={money(sale.total - sale.paid)} /></p>}
          <p className="mt-3 text-xs text-slate">{t('status.saved_local')}</p>
        </div>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={share}><Icon name="share" size={18} />{t('sell.share')}</Button>
          <Button className="flex-1" onClick={onNew}>{t('sell.new')}</Button>
        </div>
      </div>
    </AppShell>
  );
}
