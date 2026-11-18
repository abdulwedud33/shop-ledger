'use client';

import { useState } from 'react';
import { AppShell } from '../../components/Shell';
import { Button, Empty, Field, Sheet } from '../../components/ui';
import { useApp } from '../../lib/session';
import { deleteShop, updateShop } from '../../lib/api';
import { shopNameSchema, validate } from '../../lib/schemas';
import { wipeLocalData } from '../../lib/db';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const { t, shop, role, refreshShop, toast, errorText } = useApp();
  const [name, setName] = useState(shop?.name ?? '');
  const [days, setDays] = useState(String(shop?.overdueDays ?? 30));
  const [allowNeg, setAllowNeg] = useState(shop?.allowNegativeStock ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  if (role !== 'owner' || !shop) return <AppShell title={t('set.title')} back="/more/"><Empty title={t('set.owner_only')} /></AppShell>;

  async function save() {
    if (!shop) return;
    const v = validate(shopNameSchema, { name });
    const d = Number(days);
    if (!v.ok || !Number.isInteger(d) || d < 1 || d > 365) { setErr(t('v.required')); return; }
    setErr(null);
    try { await updateShop(shop.id, { name: v.ok ? v.data.name : shop.name, overdue_days: d, allow_negative_stock: allowNeg }); await refreshShop(); toast(t('set.saved')); }
    catch (e) { toast(errorText(e), 'error'); }
  }

  async function remove() {
    if (!shop || confirmName.trim() !== shop.name) return;
    try { await deleteShop(shop.id); await supabase.auth.signOut(); await wipeLocalData(); window.location.href = '/auth/'; }
    catch (e) { toast(errorText(e), 'error'); }
  }

  return (
    <AppShell title={t('set.title')} back="/more/">
      <div className="p-4">
        <Field label={t('set.shop_name')} value={name} onChange={(e) => setName(e.target.value)} error={err} />
        <Field label={t('set.overdue')} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        <label className="mb-4 flex min-h-touch items-center gap-3"><input type="checkbox" checked={allowNeg} onChange={(e) => setAllowNeg(e.target.checked)} className="h-5 w-5" /><span>{t('set.negative')}</span></label>
        <Button block onClick={save}>{t('common.save')}</Button>
        <div className="mt-10 border-t border-line pt-6"><Button block variant="danger" onClick={() => setDel(true)}>{t('set.delete')}</Button></div>
      </div>
      <Sheet open={del} onClose={() => setDel(false)} title={t('set.delete')} footer={<Button block variant="danger" disabled={confirmName.trim() !== shop.name} onClick={remove}>{t('set.delete')}</Button>}>
        <p className="mb-3 text-slate">{t('set.delete_warn')}</p>
        <Field label={t('set.shop_name')} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
      </Sheet>
    </AppShell>
  );
}
