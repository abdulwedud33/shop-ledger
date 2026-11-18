'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../lib/session';
import { createShop } from '../../lib/api';
import { queueProduct } from '../../lib/sync';
import { Button, Field, Select, Stepper, cn } from '../../components/ui';
import { Icon } from '../../components/icons';
import { shopNameSchema, validate } from '../../lib/schemas';
import { LOCALES, LOCALE_NAMES, type Locale } from '../../i18n';
import { numberToQty, parseMoney } from '../../domain/money';

interface Row { name: string; price: string; qty: number }

export default function OnboardingPage() {
  const { t, locale, setLocale, errorText, toast, refreshShop } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  // Smart default: sample items are pre-filled so a first trial takes seconds.
  const [rows, setRows] = useState<Row[]>(() => [
    { name: t('ob.sample.sugar'), price: '120', qty: 0 },
    { name: t('ob.sample.oil'), price: '250', qty: 0 },
    { name: t('ob.sample.soap'), price: '40', qty: 0 },
    { name: t('ob.sample.bread'), price: '10', qty: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const validRows = rows.filter((r) => r.name.trim() && parseMoney(r.price) !== null);

  function next() {
    if (step === 1) {
      const v = validate(shopNameSchema, { name });
      if (!v.ok) { setNameErr(t(v.errors.name ?? 'v.required')); return; }
      setNameErr(null);
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function finish() {
    setBusy(true);
    try {
      const shopId = await createShop(name.trim(), locale);
      for (const r of validRows) {
        await queueProduct(shopId, {
          name: r.name.trim(), unit: 'pcs', sellPrice: parseMoney(r.price) ?? 0, costPrice: null,
          openingQty: numberToQty(r.qty), reorderLevel: numberToQty(0),
        });
      }
      await refreshShop();
      router.replace('/sell/');
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      {/* Fixed top: progress. Fixed bottom: actions. Nothing moves between steps. */}
      <header className="px-6 pt-6">
        <p className="text-sm text-slate">{t('ob.step', { n: step })}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
          <div className="h-full bg-ledger transition-[width] duration-200" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </header>

      <main className="min-h-[360px] flex-1 px-6 py-6">
        {step === 1 && (
          <>
            <h1 className="mb-4 text-2xl font-semibold">{t('ob.shop_title')}</h1>
            <Field label={t('ob.shop_name')} value={name} onChange={(e) => setName(e.target.value)} error={nameErr} autoFocus />
            <Select label={t('common.language')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </Select>
            <Link href="/join/" className="text-ledger underline">{t('more.join')}</Link>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold">{t('ob.products_title')}</h1>
            <p className="mb-4 mt-1 text-sm text-slate">{t('ob.samples_hint')}</p>
            <ul className="space-y-1">
              {rows.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Field label={t('prod.name')} value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="flex-1" />
                  <Field label={t('prod.price')} inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value })} className="w-24"
                    error={r.price && parseMoney(r.price) === null ? t('v.number') : null} />
                  <button type="button" aria-label={t('sell.remove')} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="mt-6 grid h-12 w-10 place-items-center text-slate"><Icon name="trash" /></button>
                </li>
              ))}
            </ul>
            {rows.length < 8 && <Button variant="secondary" onClick={() => setRows((x) => [...x, { name: '', price: '', qty: 0 }])}>{t('ob.add_row')}</Button>}
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="mb-4 text-2xl font-semibold">{t('ob.stock_title')}</h1>
            {validRows.length === 0 && <p className="text-slate">{t('ob.ready_body')}</p>}
            <ul className="divide-y divide-line">
              {rows.map((r, i) => (r.name.trim() && parseMoney(r.price) !== null) ? (
                <li key={i} className="flex items-center justify-between py-2"><span className="font-medium">{r.name}</span><Stepper value={r.qty} onChange={(v) => update(i, { qty: v })} /></li>
              ) : null)}
            </ul>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 flex gap-3 border-t border-line bg-paper px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <Button variant="secondary" className={cn('flex-1', step === 1 && 'invisible')} onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>{t('common.back')}</Button>
        {step < 3
          ? <Button className="flex-1" onClick={next}>{t('common.next')}</Button>
          : <Button className="flex-1" busy={busy} onClick={finish}>{t('ob.ready_cta')}</Button>}
      </footer>
    </div>
  );
}
