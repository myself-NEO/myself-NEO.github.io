import React, { useState } from 'react';
import { Level, ProblemStatus, Track } from '../../content/shared/types';
import { hasProblemBody } from '../../content/shared/loaders';
import { problemStatus, useProgress } from './progress';
import { problemHref, trackCrumbs } from './routes';
import { matchesFilter } from './search';
import { Breadcrumbs, Chip, ClockIcon, LEVEL_LABEL, LevelBadge, ProgressBar, SearchIcon, STATUS_LABEL, StatusBadge } from './ui';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const STATUSES: ProblemStatus[] = ['not-started', 'in-progress', 'completed'];

const LEVEL_BLURB: Record<Level, string> = {
  beginner: 'One main entity lifecycle, a handful of classes. Focus on clean modelling and encapsulation.',
  intermediate: 'Several interacting entities, a state machine or two, and at least one extensibility follow-up.',
  advanced: 'Concurrency, scarce resources, delivery guarantees or pluggable engines. Expect deep follow-ups.',
};

const FilterButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
      active ? 'bg-sky-500/15 border-sky-500/50 text-sky-200' : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
    }`}
  >
    {children}
  </button>
);

const ProblemLibrary: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [status, setStatus] = useState<ProblemStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = track.problems.filter(
    (p) =>
      (level === 'all' || p.difficulty === level) &&
      (status === 'all' || problemStatus(progress, track.id, p.slug) === status) &&
      matchesFilter(query, p.title, p.summary, ...p.patterns, ...p.tags),
  );
  const completed = track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'completed').length;
  const hasFilters = level !== 'all' || status !== 'all' || query.trim() !== '';
  const withBreakdown = track.problems.filter((p) => hasProblemBody(track.id, p.slug)).length;

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs
          items={[
            ...trackCrumbs(track),
            { label: 'Practice problems' },
          ]}
        />

        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Stage {track.stages.length + 1} · Practice library</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{track.shortTitle} practice problems</h1>
            <p className="text-slate-400 max-w-2xl">
              {track.problems.length} interview problems from simple to complex.{' '}
              {withBreakdown === track.problems.length
                ? 'Each has a full breakdown that walks from clarifying questions to a complete, tested Java 17 solution with hints, edge cases and follow-ups.'
                : `${withBreakdown} have full breakdowns that walk from clarifying questions to a complete, tested Java 17 solution with hints, edge cases and follow-ups; the rest are marked “breakdown coming soon” and can be practised from their statements.`}
            </p>
          </div>
          <div className="w-full md:w-64 rounded-xl border border-slate-700/80 bg-slate-800/40 p-4">
            <p className="text-sm text-slate-300 mb-2">
              <span className="text-2xl font-bold text-white">{completed}</span> / {track.problems.length} completed
            </p>
            <ProgressBar value={completed} max={track.problems.length} label="Problems completed" />
          </div>
        </header>

        <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 mb-8 space-y-3">
          <label className="relative block">
            <span className="sr-only">Search problems</span>
            <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, pattern or topic (e.g. “state”, “concurrency”)"
              className="w-full rounded-lg bg-slate-950/60 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by difficulty">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Difficulty</span>
            <FilterButton active={level === 'all'} onClick={() => setLevel('all')}>All</FilterButton>
            {LEVELS.map((l) => (
              <FilterButton key={l} active={level === l} onClick={() => setLevel(l)}>
                {LEVEL_LABEL[l]}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Status</span>
            <FilterButton active={status === 'all'} onClick={() => setStatus('all')}>All</FilterButton>
            {STATUSES.map((s) => (
              <FilterButton key={s} active={status === s} onClick={() => setStatus(s)}>
                {STATUS_LABEL[s]}
              </FilterButton>
            ))}
          </div>
        </div>

        <p className="sr-only" role="status">
          {filtered.length} problems shown
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-300 font-semibold mb-1">No problems match these filters.</p>
            <p className="text-sm text-slate-500 mb-4">Try a different search term or clear the filters.</p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setLevel('all');
                  setStatus('all');
                  setQuery('');
                }}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          LEVELS.map((l) => {
            const items = filtered.filter((p) => p.difficulty === l);
            if (items.length === 0) return null;
            return (
              <section key={l} aria-labelledby={`level-${l}`} className="mb-10">
                <div className="flex flex-wrap items-baseline gap-3 mb-1">
                  <h2 id={`level-${l}`} className="text-xl font-bold text-white">
                    {LEVEL_LABEL[l]}
                  </h2>
                  <span className="text-sm text-slate-500">{items.length} problems</span>
                </div>
                <p className="text-sm text-slate-400 mb-4">{LEVEL_BLURB[l]}</p>
                <ul className="grid md:grid-cols-2 gap-3">
                  {items.map((p) => (
                    <li key={p.slug}>
                      <a
                        href={problemHref(track, p.slug)}
                        className="group flex h-full flex-col rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 hover:border-sky-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="font-semibold text-slate-100 group-hover:text-sky-300">
                            {p.title}
                            {!hasProblemBody(track.id, p.slug) && (
                              <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">Breakdown soon</span>
                            )}
                          </h3>
                          <StatusBadge status={problemStatus(progress, track.id, p.slug)} />
                        </div>
                        <p className="text-sm text-slate-400 mb-3 flex-1">{p.summary}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <LevelBadge level={p.difficulty} />
                          <Chip className="gap-1">
                            <ClockIcon /> {p.minutes} min
                          </Chip>
                          {p.patterns.map((pattern) => (
                            <Chip key={pattern}>{pattern}</Chip>
                          ))}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
};

export default ProblemLibrary;
