'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '../lib/session';
import { PageSkeleton } from './ui';
import { env } from '../lib/env';

const PUBLIC = ['/auth/'];

/** Client-side route guard. Real access control is RLS on the server; this only steers the UI. */
export function Gate({ children }: { children: ReactNode }) {
  const { ready, session, shop } = useApp();
  const path = usePathname() ?? '/';
  const router = useRouter();

  const isPublic = PUBLIC.includes(path);
  let target: string | null = null;
  if (ready) {
    if (!session && !isPublic) target = '/auth/';
    else if (session && !shop && path !== '/onboarding/' && path !== '/join/') target = '/onboarding/';
    else if (session && shop && (path === '/auth/' || path === '/onboarding/')) target = '/';
  }
  useEffect(() => { if (target) router.replace(target); }, [target, router]);

  if (!env.configured) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Setup needed</h1>
        <p className="mt-2 text-slate">Copy <code>.env.example</code> to <code>.env.local</code> and fill in the project URL and public key.</p>
      </main>
    );
  }
  if (!ready || target) return <PageSkeleton />;
  return <>{children}</>;
}
