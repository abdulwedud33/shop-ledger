'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/Shell';
import { Amount, Button, Chip, Empty, Field, RowSkeleton, Sheet } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useApp } from '../../lib/session';
import { useBalances, useCustomers } from '../../lib/useData';
import { queueCustomer } from '../../lib/sync';
import { customerSchema, validate, type FieldErrors } from '../../lib/schemas';
import { filterBy } from '../../domain/search';
import { parseMoney, type Minor } from '../../domain/money';

export default function CustomersPage() {
  const { t, money } = useApp();
  const customers = useCustomers();
  const balances = useBalances();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const sorted = [...(customers ?? [])].sort((a, b) => (balances?.get(b.id)?.balance ?? 0) - (balances?.get(a.id)?.balance ?? 0) || a.name.localeCompare(b.name));
    return filterBy(sorted, q, (c) => `${c.name} ${c.phone ?? ''}`, 200);
  }, [customers, balances, q]);

  return (
    <AppShell title={t('cust.title')} action={<Button variant="ghost" onClick={() => setAdding(true)} aria-label={t('cust.add')}><Icon name="plus" /></Button>}>
      <div className="p-4 pb-2">
        <label className="relative block"><span className="sr-only">{t('cust.search')}</span>
          <Icon name="search" className="absolute left-3 top-3.5 text-slate" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={t('cust.search')} className="min-h-touch w-full rounded-control border border-line bg-surface pl-10 pr-3" />
        </label>
      </div>
      {customers === undefined || balances === undefined ? <RowSkeleton /> : customers.length === 0 ? (
        <Empty title={t('cust.empty')} action={<Button onClick={() => setAdding(true)}>{t('cust.add')}</Button>} />
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-slate">{t('cust.not_found')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((c) => {
            const b = balances.get(c.id);
            return (
              <li key={c.id}>
                <Link href={`/customers/detail/?id=${c.id}`} className="flex min-h-16 items-center justify-between px-4">
                  <span><span className="block font-medium">{c.name}</span>{c.phone && <span className="num text-sm text-slate">{c.phone}</span>}</span>
                  <span className="flex items-center gap-2">
                    {b?.overdue && <Chip tone="bad" icon="alert">{t('cust.overdue', { n: b.daysOpen })}</Chip>}
                    {b && b.balance > 0 ? <Amount text={money(b.balance)} tone={b.overdue ? 'late' : 'owed'} /> : <span className="text-sm text-slate">{t('cust.settled')}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <AddCustomerSheet onClose={() => setAdding(false)} />}
    </AppShell>
  );
}

function AddCustomerSheet({ onClose }: { onClose: () => void }) {
  const { t, shop, toast, errorText } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [limit, setLimit] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const err = (k: string) => (errors[k] ? t(errors[k]!) : null);

  async function save() {
    if (!shop) return;
    const v = validate(customerSchema, { name, phone, limit });
    if (!v.ok) { setErrors(v.errors); return; }
    try {
      await queueCustomer(shop.id, { name: v.data.name, phone: v.data.phone || null, creditLimit: limit.trim() === '' ? null : (parseMoney(limit) as Minor) });
      toast(t('cust.saved'));
      onClose();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={t('cust.add')} footer={<Button block onClick={save}>{t('common.save')}</Button>}>
      <Field label={t('cust.name')} value={name} onChange={(e) => setName(e.target.value)} error={err('name')} autoFocus />
      <Field label={t('cust.phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={err('phone')} />
      <Field label={t('cust.limit')} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} error={err('limit')} />
    </Sheet>
  );
}
