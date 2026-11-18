'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/Shell';
import { Button, Empty, RowSkeleton } from '../../components/ui';
import { useApp } from '../../lib/session';
import { createInvite, fetchMembers, removeMember, type MemberRow } from '../../lib/api';

export default function TeamPage() {
  const { t, shop, role, session, toast, errorText, locale } = useApp();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => { if (shop) void fetchMembers(shop.id).then(setMembers).catch((e) => toast(errorText(e), 'error')); };
  useEffect(load, [shop]); // eslint-disable-line react-hooks/exhaustive-deps

  if (role !== 'owner') return <AppShell title={t('team.title')} back="/more/"><Empty title={t('team.owner_only')} /></AppShell>;

  async function invite() {
    if (!shop) return;
    setBusy(true);
    try { setCode(await createInvite(shop.id)); } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <AppShell title={t('team.title')} back="/more/">
      <div className="p-4">
        {code ? (
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-sm text-slate">{t('team.code')}</p>
            <p className="num my-2 text-3xl font-semibold tracking-widest">{code}</p>
            <p className="mb-3 text-sm text-slate">{t('team.share')}</p>
            <Button variant="secondary" onClick={async () => { try { if (navigator.share) await navigator.share({ text: code }); else { await navigator.clipboard.writeText(code); toast(t('common.copied')); } } catch { /* cancelled */ } }}>{t('common.copy')}</Button>
          </div>
        ) : <Button block busy={busy} onClick={invite}>{t('team.invite')}</Button>}
      </div>
      <h2 className="px-4 text-lg font-semibold">{t('team.members')}</h2>
      {members === null ? <RowSkeleton count={3} /> : (
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex min-h-16 items-center justify-between px-4">
              <span><span className="block font-medium">{m.role === 'owner' ? t('team.owner') : t('team.cashier')}{m.userId === session?.user.id ? ' *' : ''}</span>
                <span className="text-sm text-slate">{new Date(m.createdAt).toLocaleDateString(locale === 'om' ? 'en' : locale)}</span></span>
              {m.role !== 'owner' && shop && <Button variant="ghost" onClick={async () => { try { await removeMember(shop.id, m.userId); load(); } catch (e) { toast(errorText(e), 'error'); } }}>{t('team.remove')}</Button>}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
