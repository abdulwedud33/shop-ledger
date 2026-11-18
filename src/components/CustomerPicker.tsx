'use client';

import { useMemo, useState } from 'react';
import { Button, Field, Amount } from './ui';
import { useApp } from '../lib/session';
import { useBalances, useCustomers } from '../lib/useData';
import { queueCustomer } from '../lib/sync';
import { customerSchema, validate, type FieldErrors } from '../lib/schemas';
import { filterBy } from '../domain/search';
import { parseMoney } from '../domain/money';

export interface PickedCustomer { id: string; name: string }

/** Search existing customers or add a new one inline (name and phone only). */
export function CustomerPicker({ value, onChange }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void }) {
  const { t, money, shop, toast, errorText } = useApp();
  const customers = useCustomers();
  const balances = useBalances();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const list = useMemo(() => filterBy(customers ?? [], q, (c) => c.name, 6), [customers, q]);

  async function add() {
    if (!shop) return;
    const v = validate(customerSchema, { name, phone, limit: '' });
    if (!v.ok) { setErrors(v.errors); return; }
    try {
      const id = await queueCustomer(shop.id, { name: v.data.name, phone: v.data.phone || null, creditLimit: null });
      onChange({ id, name: v.data.name });
      setAdding(false); setName(''); setPhone('');
      toast(t('cust.saved'));
    } catch (e) { toast(errorText(e), 'error'); }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-control border border-line p-3">
        <span className="font-medium">{value.name}</span>
        <Button variant="ghost" onClick={() => onChange(null)}>{t('common.edit')}</Button>
      </div>
    );
  }

  return (
    <div>
      {!adding ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cust.search')} aria-label={t('sell.choose_customer')} className="mb-2 min-h-touch w-full rounded-control border border-line bg-surface px-3" />
          <ul className="divide-y divide-line rounded-control border border-line">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onChange({ id: c.id, name: c.name })} className="flex min-h-touch w-full items-center justify-between px-3 text-left">
                  <span>{c.name}</span>
                  {(balances?.get(c.id)?.balance ?? 0) > 0 && <Amount tone="owed" text={money(balances!.get(c.id)!.balance)} />}
                </button>
              </li>
            ))}
            <li><button type="button" onClick={() => { setAdding(true); setName(q); }} className="min-h-touch w-full px-3 text-left text-ledger">+ {t('sell.new_customer')}</button></li>
          </ul>
        </>
      ) : (
        <div>
          <Field label={t('cust.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name ? t(errors.name) : null} autoFocus />
          <Field label={t('cust.phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone ? t(errors.phone) : null} />
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setAdding(false)} className="flex-1">{t('common.cancel')}</Button><Button onClick={add} className="flex-1">{t('common.save')}</Button></div>
        </div>
      )}
    </div>
  );
}

export { parseMoney };
