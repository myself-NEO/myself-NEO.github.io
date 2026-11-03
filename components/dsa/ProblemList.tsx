import React, { useState } from 'react';
import { ProblemStatus, Track } from '../../content/shared/types';
import { findLesson } from '../../content/shared/curriculum';
import {
  LEETCODE_DIFFICULTIES,
  LEETCODE_PROBLEMS,
  LeetCodeDifficulty,
  LeetCodeProblem,
  leetCodeUrl,
  PRACTICE_TOPICS,
  practiceTopic,
  problemRef,
} from '../../content/learning/problems';
import { notebookActions, NotebookState, useNotebook } from '../learn/notebook';
import { progressActions, ProgressState, useProgress } from '../learn/progress';
import { lessonHref } from '../learn/routes';
import { matchesFilter } from '../learn/search';
import { ArrowIcon, Breadcrumbs, Chip, ExternalLinkIcon, FlagIcon, NoteIcon, ProgressBar, SearchIcon, focusRing } from '../learn/ui';
import DsaSectionNav, { DSA_HOME, DSA_PROBLEMS } from './DsaSectionNav';
import ProblemNotes from './ProblemNotes';
import { DSA, DifficultyBadge, isRevisit, noteOf, PRACTICE_STATUS_LABEL, PRACTICE_STATUSES, statusOf } from './practice';

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

const STATUS_SELECT_CLASSES: Record<ProblemStatus, string> = {
  'not-started': 'text-slate-300 border-slate-700',
  'in-progress': 'text-amber-200 border-amber-500/50 bg-amber-500/10',
  attempted: 'text-violet-200 border-violet-500/50 bg-violet-500/10',
  completed: 'text-emerald-200 border-emerald-500/50 bg-emerald-500/10',
};

const ProblemRow: React.FC<{ problem: LeetCodeProblem; progress: ProgressState; notebook: NotebookState }> = ({ problem, progress, notebook }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  const status = statusOf(progress, problem);
  const revisit = isRevisit(notebook, problem);
  const hasNote = Boolean(noteOf(notebook, problem));
  const name = `${problem.id}. ${problem.title}`;
  const notesId = `notes-lc-${problem.id}`;

  return (
    <li className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3 sm:p-4" data-problem={problem.id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <a
            href={leetCodeUrl(problem)}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-baseline gap-1.5 font-semibold text-slate-100 hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
          >
            <span>
              <span className="text-slate-500 tabular-nums">{problem.id}.</span> {problem.title}
            </span>
            <ExternalLinkIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500 group-hover:text-sky-300" />
            <span className="sr-only">(opens LeetCode in a new tab)</span>
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <DifficultyBadge difficulty={problem.difficulty} />
            {problem.premium && <Chip className="!text-amber-200 !border-amber-500/40">Premium</Chip>}
            {problem.patterns.map((pattern) => (
              <Chip key={pattern}>{pattern}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`status-lc-${problem.id}`}>
            Status of {name}
          </label>
          <select
            id={`status-lc-${problem.id}`}
            value={status}
            onChange={(e) => progressActions.setProblemStatus(DSA, problemRef(problem), e.target.value as ProblemStatus)}
            className={`rounded-lg border bg-slate-950/60 px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 ${STATUS_SELECT_CLASSES[status]}`}
          >
            {PRACTICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRACTICE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => notebookActions.toggleRevise(DSA, problemRef(problem))}
            aria-pressed={revisit}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${focusRing} ${
              revisit ? 'bg-amber-500/15 border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <FlagIcon filled={revisit} className="h-3.5 w-3.5" />
            Revisit
            <span className="sr-only">{name}</span>
          </button>
          <button
            type="button"
            onClick={() => setNotesOpen((o) => !o)}
            aria-expanded={notesOpen}
            aria-controls={notesId}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${focusRing} ${
              notesOpen || hasNote ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <NoteIcon className="h-3.5 w-3.5" />
            {hasNote ? 'Notes ✓' : 'Notes'}
            <span className="sr-only">for {name}</span>
          </button>
        </div>
      </div>
      {notesOpen && <ProblemNotes problem={problem} id={notesId} />}
    </li>
  );
};

/** #dsa/problems — the LeetCode practice list, with status, notes and a revisit flag per problem. */
const ProblemList: React.FC<{ track: Track; presetTopic?: string }> = ({ track, presetTopic }) => {
  const progress = useProgress();
  const notebook = useNotebook();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState(presetTopic ?? 'all');
  const [difficulty, setDifficulty] = useState<LeetCodeDifficulty | 'all'>('all');
  const [status, setStatus] = useState<ProblemStatus | 'all'>('all');
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [notesOnly, setNotesOnly] = useState(false);

  const filtered = LEETCODE_PROBLEMS.filter(
    (p) =>
      (topic === 'all' || p.topic === topic) &&
      (difficulty === 'all' || p.difficulty === difficulty) &&
      (status === 'all' || statusOf(progress, p) === status) &&
      (!revisitOnly || isRevisit(notebook, p)) &&
      (!notesOnly || Boolean(noteOf(notebook, p))) &&
      matchesFilter(query, String(p.id), p.title, ...p.patterns),
  );
  const solved = LEETCODE_PROBLEMS.filter((p) => statusOf(progress, p) === 'completed');
  const hasFilters = topic !== 'all' || difficulty !== 'all' || status !== 'all' || revisitOnly || notesOnly || query.trim() !== '';
  const clearFilters = () => {
    setQuery('');
    setTopic('all');
    setDifficulty('all');
    setStatus('all');
    setRevisitOnly(false);
    setNotesOnly(false);
  };
  const preset = presetTopic ? practiceTopic(presetTopic) : undefined;

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <DsaSectionNav active="problems" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs
          items={[{ label: 'DSA', href: DSA_HOME }, { label: 'Coding questions', href: preset ? DSA_PROBLEMS : undefined }, ...(preset ? [{ label: preset.title }] : [])]}
        />

        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Practice · LeetCode</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Coding questions</h1>
            <p className="text-slate-400 max-w-2xl">
              {LEETCODE_PROBLEMS.length} hand-picked LeetCode problems in {PRACTICE_TOPICS.length} topics, each ordered from easy to hard and
              linked to the guide that teaches the technique. Solve them on LeetCode, then record your status, flag the ones to revisit and
              keep notes. Everything is saved in this browser.
            </p>
          </div>
          <div className="w-full md:w-72 rounded-xl border border-slate-700/80 bg-slate-800/40 p-4">
            <p className="text-sm text-slate-300 mb-2">
              <span className="text-2xl font-bold text-white">{solved.length}</span> / {LEETCODE_PROBLEMS.length} solved
            </p>
            <ProgressBar value={solved.length} max={LEETCODE_PROBLEMS.length} label="Coding questions solved" />
            <p className="mt-2 text-xs text-slate-500">
              {LEETCODE_DIFFICULTIES.map((d) => {
                const all = LEETCODE_PROBLEMS.filter((p) => p.difficulty === d).length;
                const done = solved.filter((p) => p.difficulty === d).length;
                return `${d} ${done}/${all}`;
              }).join(' · ')}
            </p>
          </div>
        </header>

        <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 mb-8 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="relative block flex-1">
              <span className="sr-only">Search coding questions</span>
              <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by number, title or pattern (e.g. “two pointers”, “dijkstra”)"
                className="w-full rounded-lg bg-slate-950/60 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label htmlFor="problem-topic" className="sr-only">
              Filter by topic
            </label>
            <select
              id="problem-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All topics</option>
              {PRACTICE_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by difficulty">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Difficulty</span>
            <FilterButton active={difficulty === 'all'} onClick={() => setDifficulty('all')}>
              All
            </FilterButton>
            {LEETCODE_DIFFICULTIES.map((d) => (
              <FilterButton key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                {d}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Status</span>
            <FilterButton active={status === 'all'} onClick={() => setStatus('all')}>
              All
            </FilterButton>
            {PRACTICE_STATUSES.map((s) => (
              <FilterButton key={s} active={status === s} onClick={() => setStatus(s)}>
                {PRACTICE_STATUS_LABEL[s]}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="More filters">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Show</span>
            <FilterButton active={revisitOnly} onClick={() => setRevisitOnly((v) => !v)}>
              Marked to revisit
            </FilterButton>
            <FilterButton active={notesOnly} onClick={() => setNotesOnly((v) => !v)}>
              With notes
            </FilterButton>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="ml-auto text-sm font-medium text-sky-400 hover:text-sky-300">
                Clear filters
              </button>
            )}
          </div>
        </div>

        <p className="sr-only" role="status">
          {filtered.length} coding questions shown
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-300 font-semibold mb-1">No coding questions match these filters.</p>
            <p className="text-sm text-slate-500 mb-4">Try a different search term or clear the filters.</p>
            <button type="button" onClick={clearFilters} className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold">
              Clear filters
            </button>
          </div>
        ) : (
          PRACTICE_TOPICS.map((t) => {
            const items = filtered.filter((p) => p.topic === t.id);
            if (items.length === 0) return null;
            const all = LEETCODE_PROBLEMS.filter((p) => p.topic === t.id);
            const done = all.filter((p) => statusOf(progress, p) === 'completed').length;
            const guide = findLesson(track, t.guide)?.lesson;
            return (
              <section key={t.id} aria-labelledby={`topic-${t.id}`} className="mb-10" data-topic={t.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 id={`topic-${t.id}`} className="text-xl font-bold text-white">
                      {t.title}
                    </h2>
                    <span className="text-sm text-slate-500">
                      {done}/{all.length} solved
                    </span>
                  </div>
                  {guide && (
                    <a href={lessonHref(track, guide.slug)} className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:text-sky-300">
                      Guide: {guide.title} <ArrowIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <ol className="space-y-2.5">
                  {items.map((p) => (
                    <ProblemRow key={p.id} problem={p} progress={progress} notebook={notebook} />
                  ))}
                </ol>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
};

export default ProblemList;
