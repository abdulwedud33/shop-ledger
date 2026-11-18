'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../lib/session';
import { acceptInvite } from '../../lib/api';
import { Button, Field } from '../../components/ui';
import { inviteCodeSchema, validate } from '../../lib/schemas';

export default function JoinPage() {
  const { t, refreshShop, errorText, toast } = useApp();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    const v = validate(inviteCodeSchema, { code });
    if (!v.ok) { setErr(t(v.errors.code ?? 'v.required')); return; }
    setErr(null); setBusy(true);
    try {
      await acceptInvite(v.data.code.replace(/\s+/g, ''));
      await refreshShop();
      router.replace('/');
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">{t('join.title')}</h1>
      <Field label={t('join.code')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" error={err} />
      <Button block busy={busy} onClick={join}>{t('join.cta')}</Button>
    </main>
  );
}
