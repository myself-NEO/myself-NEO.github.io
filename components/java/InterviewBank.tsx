import React, { useEffect, useMemo, useState } from 'react';
import { Level, Track } from '../../content/shared/types';
import { INTERVIEW_TOPICS, InterviewQuestion, loadInterviewBank, QUESTION_KINDS, QuestionKind, topicTitle } from '../../content/java/interview';
import { JAVA_HOME } from '../../content/java';
import { itemKey, useNotebook } from '../learn/notebook';
import { matchesFilter } from '../learn/search';
import { takeJumpTarget } from '../learn/jump';
import { Breadcrumbs, ProgressBar, SearchIcon, focusRing } from '../learn/ui';
import { ContentError } from '../learn/States';
import JavaSectionNav from './JavaSectionNav';
import QuestionCard from './QuestionCard';

type StatusFilter = 'all' | 'new' | 'attempted' | 'bookmarked' | 'revise' | 'missed';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Not attempted' },
  { id: 'attempted', label: 'Attempted' },
  { id: 'bookmarked', label: 'Bookmarked' },
  { id: 'revise', label: 'To revise' },
  { id: 'missed', label: 'Missed' },
];

const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Basic' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

const FilterButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${focusRing} ${
      active ? 'bg-sky-500/15 border-sky-500/50 text-sky-200' : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
    }`}
  >
    {children}
  </button>
);

/** #java/interview — the question bank, optionally preset to one topic or to the tricky questions. */
const InterviewBank: React.FC<{ track: Track; preset?: string }> = ({ track, preset }) => {
  const notebook = useNotebook();
  const [bank, setBank] = useState<InterviewQuestion[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const tricky = preset === 'tricky';
  const presetTopic = preset && !tricky ? preset : 'all';
  const [topic, setTopic] = useState<string>(presetTopic);
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [kind, setKind] = useState<QuestionKind | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [trickyOnly, setTrickyOnly] = useState(tricky);
  const [query, setQuery] = useState('');
  // Set when arriving from the notebook: that question opens and scrolls into view.
  const [openId] = useState<string | undefined>(() => takeJumpTarget(`question:${track.id}:`));

  useEffect(() => {
    let cancelled = false;
    setError(false);
    loadInterviewBank()
      .then((questions) => !cancelled && setBank(questions))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (bank && openId) requestAnimationFrame(() => document.getElementById(`q-${openId}`)?.scrollIntoView({ block: 'start' }));
  }, [bank, openId]);

  const statusOf = (q: InterviewQuestion) => {
    const k = itemKey(track.id, q.id);
    return { progress: notebook.questions[k], revise: Boolean(notebook.revise[k]), saved: Boolean(notebook.saved[`question:${k}`]) };
  };

  const filtered = useMemo(
    () =>
      (bank ?? []).filter((q) => {
        const s = statusOf(q);
        const attempted = Boolean(s.progress?.revealedAt || s.progress?.draft?.trim());
        const statusOk =
          status === 'all' ||
          (status === 'new' && !attempted) ||
          (status === 'attempted' && attempted) ||
          (status === 'bookmarked' && s.saved) ||
          (status === 'revise' && s.revise) ||
          (status === 'missed' && s.progress?.rating === 'missed');
        return (
          statusOk &&
          (topic === 'all' || q.topic === topic) &&
          (level === 'all' || q.level === level) &&
          (kind === 'all' || q.kind === kind) &&
          (!trickyOnly || q.tricky) &&
          matchesFilter(query, q.title, q.body, topicTitle(q.topic), q.answer)
        );
      }),
    // statusOf reads the notebook, so it is a dependency through `notebook`.
    [bank, notebook, topic, level, kind, status, trickyOnly, query],
  );

  const scope = (bank ?? []).filter((q) => (tricky ? q.tricky : presetTopic === 'all' || q.topic === presetTopic));
  const attemptedCount = scope.filter((q) => {
    const s = statusOf(q).progress;
    return Boolean(s?.revealedAt || s?.draft?.trim());
  }).length;
  const gotIt = scope.filter((q) => statusOf(q).progress?.rating === 'got-it').length;
  const toRevise = scope.filter((q) => statusOf(q).revise).length;
  const hasFilters = topic !== presetTopic || level !== 'all' || kind !== 'all' || status !== 'all' || trickyOnly !== tricky || query.trim() !== '';

  const title = tricky ? 'Java tricky questions' : presetTopic !== 'all' ? `${topicTitle(presetTopic)} interview questions` : 'Java interview question bank';
  const intro = tricky
    ? 'Questions designed to expose half-remembered answers: the ones where the obvious reply is incomplete or wrong. Each answer explains exactly why the usual answers fall short.'
    : 'Basic, intermediate and advanced questions across every module: conceptual, internals, output prediction, debugging, scenario and coding. Attempt each one in your own words, take hints one at a time, then compare with the detailed answer and rate yourself.';

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <JavaSectionNav active="interview" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs
          items={[
            { label: 'Java', href: JAVA_HOME },
            ...(preset ? [{ label: 'Interview prep', href: `${JAVA_HOME}/interview` }] : []),
            { label: tricky ? 'Tricky questions' : presetTopic !== 'all' ? topicTitle(presetTopic) : 'Interview prep' },
          ]}
        />
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">{tricky ? 'Interview prep · Tricky questions' : 'Interview prep'}</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{title}</h1>
            <p className="text-slate-400 max-w-2xl">{intro}</p>
          </div>
          <div className="w-full md:w-72 rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 space-y-2">
            <p className="text-sm text-slate-300">
              <span className="text-2xl font-bold text-white">{attemptedCount}</span> / {scope.length} attempted
            </p>
            <ProgressBar value={attemptedCount} max={scope.length} label="Questions attempted" />
            <p className="text-xs text-slate-400">
              {gotIt} rated “got it” · {toRevise} on your revision list
            </p>
          </div>
        </header>

        {!tricky && (
          <p className="mb-6 text-sm text-slate-400">
            Short on time?{' '}
            <a href={`${JAVA_HOME}/interview/tricky`} className="text-violet-300 hover:underline font-semibold">
              Start with the tricky questions
            </a>{' '}
            — they cover the classics: String immutability, equals/hashCode, HashMap internals, volatile vs synchronized, wait vs sleep, finally
            and more.
          </p>
        )}

        <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 mb-8 space-y-3">
          <label className="relative block">
            <span className="sr-only">Search questions</span>
            <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions and answers (e.g. “volatile”, “resize”, “finally”)"
              className="w-full rounded-lg bg-slate-950/60 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="topic-filter" className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-16">
              Topic
            </label>
            <select
              id="topic-filter"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-lg bg-slate-950/60 border border-slate-700 px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All topics</option>
              {INTERVIEW_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <FilterButton active={trickyOnly} onClick={() => setTrickyOnly((v) => !v)}>
              Tricky only
            </FilterButton>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by level">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-16">Level</span>
            <FilterButton active={level === 'all'} onClick={() => setLevel('all')}>
              All
            </FilterButton>
            {LEVELS.map((l) => (
              <FilterButton key={l.id} active={level === l.id} onClick={() => setLevel(l.id)}>
                {l.label}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by question type">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-16">Type</span>
            <FilterButton active={kind === 'all'} onClick={() => setKind('all')}>
              All
            </FilterButton>
            {QUESTION_KINDS.map((k) => (
              <FilterButton key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-16">Status</span>
            {STATUS_FILTERS.map((s) => (
              <FilterButton key={s.id} active={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label}
              </FilterButton>
            ))}
          </div>
        </div>

        {error && <ContentError onRetry={() => setAttempt((a) => a + 1)} />}
        {!error && !bank && (
          <p role="status" className="text-slate-400 py-10 text-center">
            Loading questions…
          </p>
        )}
        {bank && (
          <>
            <p className="text-sm text-slate-400 mb-3" role="status">
              Showing {filtered.length} of {bank.length} questions
            </p>
            {scope.length === 0 ? (
              <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
                <p className="text-slate-300 font-semibold mb-1">Questions for this topic are coming soon.</p>
                <p className="text-sm text-slate-500 mb-4">The question bank grows with each stage of the notebook.</p>
                <a href={`${JAVA_HOME}/interview`} className="inline-flex px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold">
                  See all available questions
                </a>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
                <p className="text-slate-300 font-semibold mb-1">No questions match these filters.</p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(presetTopic);
                      setLevel('all');
                      setKind('all');
                      setStatus('all');
                      setTrickyOnly(tricky);
                      setQuery('');
                    }}
                    className="mt-3 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((q) => (
                  <QuestionCard
                    key={q.id}
                    track={track}
                    question={q}
                    defaultOpen={q.id === openId}
                    showTopic={topic === 'all'}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default InterviewBank;
