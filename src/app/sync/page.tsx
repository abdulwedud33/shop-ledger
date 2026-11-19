'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '../../components/Shell';
import { Button, Chip, Empty, RowSkeleton } from '../../components/ui';
import { useApp } from '../../lib/session';
import { db } from '../../lib/db';
import { discardItem, kick, retryItem } from '../../lib/sync';
import type { MessageKey } from '../../i18n';

export default function SyncPage() {
  const { t, shop } = useApp();
  const items = useLiveQuery(async () => (shop ? (await db.outbox.where('shopId').equals(shop.id).sortBy('createdAt')).filter((i) => i.status !== 'synced') : []), [shop?.id]);

  return (
    <AppShell title={t('sync.title')} back="/more/" hideAssistant>
      {items === undefined ? <RowSkeleton count={3} /> : items.length === 0 ? <Empty title={t('sync.all_good')} /> : (
        <>
          <div className="p-4"><Button variant="secondary" block onClick={() => shop && kick(shop.id)}>{t('sync.retry')}</Button></div>
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex min-h-16 items-center justify-between gap-2 px-4">
                <span><span className="block font-medium">{t(`sync.kind.${i.kind}` as MessageKey)}</span>
                  <span className="text-sm text-slate">{new Date(i.createdAt).toLocaleString()}</span>
                  {i.lastErrorCode && <span className="block text-sm text-brick">{t(`err.${i.lastErrorCode}` as MessageKey)}</span>}</span>
                {i.status === 'failed' ? (
                  <span className="flex gap-1"><Button variant="secondary" onClick={() => shop && retryItem(shop.id, i.id)}>{t('sync.retry')}</Button><Button variant="danger" onClick={() => shop && discardItem(shop.id, i.id)}>{t('sync.discard')}</Button></span>
                ) : <Chip icon="sync">{t('sync.waiting')}</Chip>}
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
