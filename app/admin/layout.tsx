'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'cupboard-admin-acknowledged';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);

  useEffect(() => {
    // Check session storage so we don't re-prompt on every page nav
    try {
      const v = sessionStorage.getItem(STORAGE_KEY);
      setAcknowledged(v === 'true');
    } catch {
      setAcknowledged(false);
    }
  }, []);

  if (acknowledged === null) {
    return null; // hydration flash guard
  }

  if (!acknowledged) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md bg-white border border-cupboard-stone rounded-lg p-8 shadow-sm">
          <h1 className="font-serif text-2xl text-cupboard-deep mb-3">
            Admin area
          </h1>
          <p className="text-sm text-cupboard-deep leading-relaxed mb-2">
            This is the eval tool. It can run test suites against the live
            chat system and modify test cases, which costs API tokens.
          </p>
          <p className="text-sm text-cupboard-deep leading-relaxed mb-6">
            Are you sure you want to continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                sessionStorage.setItem(STORAGE_KEY, 'true');
                setAcknowledged(true);
              }}
              className="rounded-md bg-cupboard-accent px-4 py-2 text-sm font-medium text-cupboard-cream hover:bg-cupboard-deep transition-colors"
            >
              Yes, continue
            </button>
            <Link
              href="/"
              className="rounded-md border border-cupboard-stone px-4 py-2 text-sm font-medium text-cupboard-deep hover:bg-cupboard-stone/30 transition-colors"
            >
              Take me back
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-cupboard-stone bg-cupboard-cream">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-sm bg-cupboard-accent flex items-center justify-center text-cupboard-cream font-serif text-sm">
                C
              </div>
              <span className="font-serif text-lg text-cupboard-deep">
                Cupboard
              </span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/admin/evals"
                className="text-cupboard-deep hover:underline"
              >
                Eval cases
              </Link>
              <Link
                href="/admin/evals/run"
                className="text-cupboard-deep hover:underline"
              >
                Run suite
              </Link>
              <Link
                href="/admin/evals/runs"
                className="text-cupboard-deep hover:underline"
              >
                Past runs
              </Link>
            </nav>
          </div>
          <div className="text-xs text-cupboard-warm uppercase tracking-wider">
            Admin
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
