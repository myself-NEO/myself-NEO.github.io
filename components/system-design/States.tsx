import React from 'react';
import { ROOT_HREF } from './routes';

export const ContentSkeleton: React.FC = () => (
  <div role="status" aria-live="polite" className="space-y-4 animate-pulse">
    <span className="sr-only">Loading content…</span>
    <div className="h-7 w-2/5 rounded bg-slate-800" />
    <div className="h-4 w-full rounded bg-slate-800/80" />
    <div className="h-4 w-11/12 rounded bg-slate-800/80" />
    <div className="h-4 w-4/5 rounded bg-slate-800/80" />
    <div className="h-40 w-full rounded-xl bg-slate-800/60" />
    <div className="h-4 w-full rounded bg-slate-800/80" />
    <div className="h-4 w-3/4 rounded bg-slate-800/80" />
  </div>
);

export const ContentError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-6">
    <p className="font-semibold text-rose-200 mb-1">This content couldn’t be loaded.</p>
    <p className="text-sm text-slate-400 mb-4">Check your connection and try again. If the site was just updated, a page refresh may help.</p>
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        Try again
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm font-semibold hover:bg-slate-800"
      >
        Refresh page
      </button>
    </div>
  </div>
);

export const NotFound: React.FC<{ what: string }> = ({ what }) => (
  <div className="text-center py-20">
    <p className="text-sm font-semibold text-sky-400 mb-2">404</p>
    <h1 className="text-2xl font-bold text-white mb-3">We couldn’t find that {what}</h1>
    <p className="text-slate-400 mb-6">It may have been renamed or moved.</p>
    <a href={ROOT_HREF} className="inline-flex px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm">
      Back to System Design
    </a>
  </div>
);
