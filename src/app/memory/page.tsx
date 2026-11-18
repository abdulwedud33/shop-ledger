'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/Shell';
import { Button, Empty, RowSkeleton } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useApp } from '../../lib/session';
import { deleteMemory, fetchMemory, type MemoryRow } from '../../lib/api';

/** What the assistant remembers about this shop. Everything is visible, editable by deleting, and clearable. */
export default function MemoryPage() {
  const { t, shop, role, toast, errorText } = useApp();
  const [rows, setRows] = useState<MemoryRow[] | null>(null);
  const load = () => { if (shop) void fetchMemory(shop.id).then(setRows).catch((e) => toast(errorText(e), 'error')); };
  useEffect(load, [shop]); // eslint-disable-line react-hooks/exhaustive-deps

  async function clearAll() {
    try { for (const r of rows ?? []) await deleteMemory(r.id); load(); } catch (e) { toast(errorText(e), 'error'); }
  }
  if (role !== 'owner') return <AppShell title={t('more.memory')} back="/more/"><Empty title={t('set.owner_only')} /></AppShell>;

  return (
    <AppShell title={t('more.memory')} back="/more/" hideAssistant>
      {rows === null ? <RowSkeleton count={3} /> : rows.length === 0 ? <Empty title={t('ai.memory_empty')} /> : (
        <>
          <ul className="divide-y divide-line">{rows.map((r) => (
            <li key={r.id} className="flex min-h-16 items-center justify-between px-4"><span><span className="block font-medium">{r.key}</span><span className="text-sm text-slate">{r.value}</span></span>
              <button type="button" aria-label={t('sell.remove')} onClick={async () => { try { await deleteMemory(r.id); load(); } catch (e) { toast(errorText(e), 'error'); } }} className="grid h-12 w-12 place-items-center text-slate"><Icon name="trash" /></button></li>
          ))}</ul>
          <div className="p-4"><Button variant="danger" block onClick={clearAll}>{t('ai.memory_clear')}</Button></div>
        </>
      )}
    </AppShell>
  );
}
