'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/session';
import { Button, Field, Select } from '../../components/ui';
import { signInSchema, signUpSchema, validate, type FieldErrors } from '../../lib/schemas';
import { LOCALES, LOCALE_NAMES, type Locale } from '../../i18n';
import { translateError } from '../../domain/errors';

export default function AuthPage() {
  const { t, locale, setLocale, toast } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    const v = mode === 'in' ? validate(signInSchema, { email, password }) : validate(signUpSchema, { email, password, name });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({}); setBusy(true); setInfo(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) setInfo(t('auth.check_email'));
      }
    } catch (e) {
      const code = translateError(e).code;
      toast(code === 'RATE_LIMITED' || code === 'OFFLINE' ? t(`err.${code}`) : t('auth.failed'), 'error');
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-semibold">{t('app.name')}</h1>
      <p className="mb-8 mt-2 text-slate">{t('auth.tagline')}</p>

      <h2 className="mb-4 text-xl font-semibold">{mode === 'in' ? t('auth.sign_in') : t('auth.sign_up')}</h2>
      {mode === 'up' && <Field label={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" error={errors.name ? t(errors.name) : null} />}
      <Field label={t('auth.email')} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email ? t(errors.email) : null} />
      <Field label={t('auth.password')} type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password}
        onChange={(e) => setPassword(e.target.value)} hint={mode === 'up' ? t('auth.hint_password') : undefined} error={errors.password ? t(errors.password) : null} />
      <p className="min-h-[40px] text-sm text-ledger" role="status">{info}</p>
      <Button block busy={busy} onClick={submit}>{mode === 'in' ? t('auth.sign_in') : t('auth.sign_up')}</Button>
      <button type="button" className="mt-4 min-h-touch text-ledger underline" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErrors({}); setInfo(null); }}>
        {mode === 'in' ? t('auth.to_sign_up') : t('auth.to_sign_in')}
      </button>
      <Select label={t('common.language')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="mt-6">
        {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
      </Select>
    </main>
  );
}
