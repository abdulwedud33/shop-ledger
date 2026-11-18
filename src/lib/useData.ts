'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalBalance, type LocalCustomer, type LocalProduct } from './db';
import { useApp } from './session';

/** Live, offline-capable reads from the local cache. `undefined` means still loading (show a skeleton). */
export function useProducts(): LocalProduct[] | undefined {
  const { shop } = useApp();
  return useLiveQuery(async () => (shop ? (await db.products.where('shopId').equals(shop.id).filter((p) => p.archived === 0).sortBy('name')) : []), [shop?.id]);
}

export function useCustomers(): LocalCustomer[] | undefined {
  const { shop } = useApp();
  return useLiveQuery(async () => (shop ? (await db.customers.where('shopId').equals(shop.id).filter((c) => c.archived === 0).sortBy('name')) : []), [shop?.id]);
}

export function useBalances(): Map<string, LocalBalance> | undefined {
  const { shop } = useApp();
  const rows = useLiveQuery(async () => (shop ? db.balances.where('shopId').equals(shop.id).toArray() : []), [shop?.id]);
  return rows ? new Map(rows.map((b) => [b.customerId, b])) : undefined;
}
