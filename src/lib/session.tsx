'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchMyShop, type ShopInfo } from './api';
import { getMeta, setMeta, wipeLocalData } from './db';
import { startSync } from './sync';
import { translate, isLocale, type Locale, type MessageKey, type Params } from '../i18n';
import { translateError } from '../domain/errors';
import { formatMoney, type Minor } from '../domain/money';

type ToastKind = 'ok' | 'info' | 'error';
interface ToastItem { id: number; message: string; kind: ToastKind }

interface AppContext {
  ready: boolean;
  session: Session | null;
  shop: ShopInfo | null;
  role: 'owner' | 'cashier' | null;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, params?: Params) => string;
  money: (minor: Minor) => string;
  errorText: (e: unknown) => string;
  toast: (message: string, kind?: ToastKind) => void;
  online: boolean;
  refreshShop: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem('sl-locale');
    if (isLocale(stored)) return stored;
  } catch { /* storage can be unavailable */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return isLocale(nav) ? nav : 'en';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [locale, setLocaleState] = useState<Locale>('en');
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const hasStoredLocale = useRef(false);

  // Language: stored choice wins, then browser language.
  useEffect(() => {
    try { hasStoredLocale.current = isLocale(localStorage.getItem('sl-locale')); } catch { /* ignore */ }
    setLocaleState(initialLocale());
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    hasStoredLocale.current = true;
    try { localStorage.setItem('sl-locale', l); } catch { /* ignore */ }
  }, []);

  // Online status.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  // Auth session.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); setAuthChecked(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setSession(s); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const loadShop = useCallback(async (userId: string) => {
    const cachedUser = await getMeta<string>('userId');
    if (cachedUser && cachedUser !== userId) await wipeLocalData(); // a different person signed in on this phone
    await setMeta('userId', userId);
    try {
      const s = await fetchMyShop(userId);
      setShop(s);
      if (s) await setMeta('shop', s);
    } catch {
      const cached = await getMeta<ShopInfo>('shop'); // offline start: use the last known shop
      setShop(cached ?? null);
    }
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!authChecked) return;
    if (!userId) { setShop(null); setReady(true); return; }
    let alive = true;
    setReady(false); // hold the UI on a skeleton until the shop is known, so a returning owner never flashes onboarding
    void loadShop(userId).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [authChecked, userId, loadShop]);

  // Shop language is the default until the person picks one.
  useEffect(() => {
    if (shop && !hasStoredLocale.current && isLocale(shop.locale)) setLocaleState(shop.locale);
  }, [shop]);

  // Background sync while signed in with a shop.
  useEffect(() => {
    if (!shop) return;
    return startSync(shop.id, shop.role);
  }, [shop]);

  const refreshShop = useCallback(async () => { if (userId) await loadShop(userId); }, [userId, loadShop]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await wipeLocalData();
    setShop(null);
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = ++toastId.current;
    setToasts((x) => [...x.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);

  const value = useMemo<AppContext>(() => {
    const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
    return {
      ready, session, shop, role: shop?.role ?? null, locale, setLocale, t,
      money: (m) => formatMoney(m, { locale: 'en' }),
      errorText: (e) => t(translateError(e).messageKey),
      toast, online, refreshShop, signOut,
    };
  }, [ready, session, shop, locale, setLocale, toast, online, refreshShop, signOut]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div key={x.id} role="status"
            className={`fade-in pointer-events-auto max-w-md rounded-control border px-4 py-3 text-sm shadow-sheet ${x.kind === 'error' ? 'border-brick bg-surface text-brick' : 'border-line bg-surface text-ink'}`}>
            {x.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
