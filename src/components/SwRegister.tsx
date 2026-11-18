'use client';
import { useEffect } from 'react';

/** Registers the offline service worker (app shell only; see public/sw.js). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is optional */ });
  }, []);
  return null;
}
