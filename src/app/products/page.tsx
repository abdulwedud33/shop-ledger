'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/Shell';
import { Button, Chip, Empty, Field, RowSkeleton, Select, Sheet, Amount } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useApp } from '../../lib/session';
import { useProducts } from '../../lib/useData';
import { db, type LocalProduct } from '../../lib/db';
import { queueAdjust, queueProduct, queueStockIn } from '../../lib/sync';
import { setProductCost, updateProduct } from '../../lib/api';
import { adjustSchema, productSchema, restockSchema, toQtyOrZero, validate, type FieldErrors } from '../../lib/schemas';
import { filterBy } from '../../domain/search';
import { formatQty, numberToQty, parseMoney, parseQty, toDecimalString, type Minor } from '../../domain/money';
import { isLowStock } from '../../domain/stock';
import type { MessageKey } from '../../i18n';

const UNITS = ['pcs', 'kg', 'l', 'pack', 'box'] as const;
const unitLabel = (u: string): MessageKey | null => ((UNITS as readonly string[]).includes(u) ? (`unit.${u}` as MessageKey) : null);

export default function ProductsPage() {
  return <Suspense fallback={<AppShell title="..."><RowSkeleton /></AppShell>}><ProductsInner /></Suspense>;
}

function ProductsInner() {
  const { t, money, role } = useApp();
  const products = useProducts();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<LocalProduct | 'new' | null>(null);
  const [restock, setRestock] = useState<LocalProduct | null>(null);
  const [adjust, setAdjust] = useState<LocalProduct | null>(null);
  const isOwner = role === 'owner';

  const restockId = params.get('restock');
  useEffect(() => {
    if (!restockId || !products) return;
    const p = products.find((x) => x.id === restockId);
    if (p) setRestock(p);
  }, [restockId, products]);

  const list = useMemo(() => filterBy(products ?? [], q, (p) => p.name, 200), [products, q]);

  return (
    <AppShell title={t('prod.title')} action={isOwner ? <Button variant="ghost" onClick={() => setEditing('new')} aria-label={t('prod.add')}><Icon name="plus" /></Button> : undefined}>
      <div className="p-4 pb-2">
        <label className="relative block">
          <span className="sr-only">{t('prod.search')}</span>
          <Icon name="search" className="absolute left-3 top-3.5 text-slate" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('prod.search')} type="search" className="min-h-touch w-full rounded-control border border-line bg-surface pl-10 pr-3" />
        </label>
      </div>

      {products === undefined ? <RowSkeleton /> : products.length === 0 ? (
        <Empty title={t('prod.empty')} action={isOwner ? <Button onClick={() => setEditing('new')}>{t('prod.empty_cta')}</Button> : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => (isOwner ? setEditing(p) : setRestock(p))} className="flex min-h-16 w-full items-center justify-between px-4 text-left">
                <span>
                  <span className="block font-medium">{p.name}{p.pending && <span className="ml-2 text-xs text-slate">{t('status.saved_local')}</span>}</span>
                  <span className="num text-sm text-slate">{money(p.sellPrice)} / {unitLabel(p.unit) ? t(unitLabel(p.unit)!) : p.unit}</span>
                </span>
                <span className="flex items-center gap-2">
                  {isLowStock(p.stockQty, p.reorderLevel) && <Chip tone={p.stockQty <= 0 ? 'bad' : 'warn'} icon="alert">{p.stockQty <= 0 ? t('prod.out') : t('prod.low')}</Chip>}
                  <Amount text={formatQty(p.stockQty)} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && <ProductSheet product={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onRestock={(p) => { setEditing(null); setRestock(p); }} onAdjust={(p) => { setEditing(null); setAdjust(p); }} />}
      {restock && <RestockSheet product={restock} onClose={() => setRestock(null)} />}
      {adjust && <AdjustSheet product={adjust} onClose={() => setAdjust(null)} />}
    </AppShell>
  );
}

function ProductSheet({ product, onClose, onRestock, onAdjust }: { product: LocalProduct | null; onClose: () => void; onRestock: (p: LocalProduct) => void; onAdjust: (p: LocalProduct) => void }) {
  const { t, shop, toast, errorText } = useApp();
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'pcs');
  const [price, setPrice] = useState(product ? toDecimalString(product.sellPrice).replace(/\.00$/, '') : '');
  const [cost, setCost] = useState(product?.costPrice != null ? toDecimalString(product.costPrice).replace(/\.00$/, '') : '');
  const [opening, setOpening] = useState('');
  const [reorder, setReorder] = useState(product ? formatQty(product.reorderLevel) : '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const err = (k: string) => (errors[k] ? t(errors[k]!) : null);

  async function save() {
    if (!shop) return;
    const v = validate(productSchema, { name, unit, price, cost, opening: product ? '0' : opening, reorder });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({}); setBusy(true);
    try {
      const sellPrice = parseMoney(price) as Minor;
      const costPrice = cost.trim() === '' ? null : (parseMoney(cost) as Minor);
      if (!product) {
        await queueProduct(shop.id, { name: v.data.name, unit, sellPrice, costPrice, openingQty: toQtyOrZero(opening), reorderLevel: toQtyOrZero(reorder) });
      } else {
        await updateProduct(product.id, { name: v.data.name, unit, sell_price: sellPrice / 100, reorder_level: toQtyOrZero(reorder) / 1000 });
        if (costPrice !== null) await setProductCost(shop.id, product.id, costPrice / 100);
        await db.products.update(product.id, { name: v.data.name, unit, sellPrice, reorderLevel: toQtyOrZero(reorder), costPrice });
      }
      toast(t('prod.saved'));
      onClose();
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  async function archive() {
    if (!product) return;
    setBusy(true);
    try { await updateProduct(product.id, { archived_at: new Date().toISOString() }); await db.products.update(product.id, { archived: 1 }); onClose(); }
    catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title={product ? t('prod.edit') : t('prod.add')}
      footer={<Button block busy={busy} onClick={save}>{t('common.save')}</Button>}>
      <Field label={t('prod.name')} value={name} onChange={(e) => setName(e.target.value)} error={err('name')} />
      <div className="grid grid-cols-2 gap-3">
        <Select label={t('prod.unit')} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}` as MessageKey)}</option>)}
        </Select>
        <Field label={t('prod.price')} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={err('price')} />
        <Field label={`${t('prod.cost')} (${t('common.optional')})`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} error={err('cost')} />
        {!product && <Field label={t('prod.opening')} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} error={err('opening')} />}
        <Field label={t('prod.reorder')} inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} error={err('reorder')} />
      </div>
      {product && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onRestock(product)}>{t('prod.restock')}</Button>
          <Button variant="secondary" onClick={() => onAdjust(product)}>{t('prod.adjust')}</Button>
          <Button variant="danger" onClick={archive} busy={busy}>{t('prod.archive')}</Button>
        </div>
      )}
    </Sheet>
  );
}

function RestockSheet({ product, onClose }: { product: LocalProduct; onClose: () => void }) {
  const { t, shop, role, toast, errorText } = useApp();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(product.costPrice != null ? toDecimalString(product.costPrice).replace(/\.00$/, '') : ''); // smart default: last cost
  const [errors, setErrors] = useState<FieldErrors>({});
  const err = (k: string) => (errors[k] ? t(errors[k]!) : null);

  async function save() {
    if (!shop) return;
    const v = validate(restockSchema, { qty, cost: role === 'owner' ? cost : '' });
    if (!v.ok) { setErrors(v.errors); return; }
    try {
      await queueStockIn(shop.id, { productId: product.id, qty: parseQty(qty) as number, unitCost: role === 'owner' && cost.trim() !== '' ? (parseMoney(cost) as Minor) : null });
      toast(t('prod.stock_added'));
      onClose();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={`${t('prod.restock')}: ${product.name}`} footer={<Button block onClick={save}>{t('common.save')}</Button>}>
      <Field label={t('prod.qty')} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={err('qty')} autoFocus />
      {role === 'owner' && <Field label={t('prod.cost_unit')} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} error={err('cost')} />}
    </Sheet>
  );
}

function AdjustSheet({ product, onClose }: { product: LocalProduct; onClose: () => void }) {
  const { t, shop, toast, errorText } = useApp();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const err = (k: string) => (errors[k] ? t(errors[k]!) : null);

  async function save() {
    if (!shop) return;
    const v = validate(adjustSchema, { delta, reason });
    if (!v.ok) { setErrors(v.errors); return; }
    try {
      const qtyDelta = numberToQty(delta.replace(',', '.'));
      await queueAdjust(shop.id, { productId: product.id, qtyDelta, reason: reason.trim(), type: 'adjustment' });
      toast(t('prod.stock_fixed'));
      onClose();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={`${t('prod.adjust')}: ${product.name}`} footer={<Button block onClick={save}>{t('common.save')}</Button>}>
      <Field label={t('prod.qty')} inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} hint={t('prod.change_hint')} error={err('delta')} autoFocus />
      <Field label={t('prod.reason')} value={reason} onChange={(e) => setReason(e.target.value)} error={err('reason')} />
    </Sheet>
  );
}
