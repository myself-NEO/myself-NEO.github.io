import React, { useCallback, useRef } from 'react';
import { ProblemStatus, Track } from '../../content/shared/types';
import { findLesson, findProblem } from '../../content/shared/curriculum';
import { hasProblemBody, loadProblemBody } from '../../content/shared/loaders';
import LearningLayout, { useHeadings } from './LearningLayout';
import MarkdownContent from './MarkdownContent';
import { isLessonComplete, problemStatus, progressActions, useProgress } from './progress';
import { lessonHref, problemHref, problemsHref, trackCrumbs } from './routes';
import { useMarkdownBody } from './useMarkdownBody';
import { ArrowIcon, Breadcrumbs, CheckCircleIcon, Chip, ClockIcon, LevelBadge, STATUS_LABEL, StatusIcon } from './ui';
import { ContentError, ContentSkeleton, NotFound } from './States';

const STATUSES: ProblemStatus[] = ['not-started', 'in-progress', 'completed'];

export const StatusControl: React.FC<{ track: Track; slug: string; title: string }> = ({ track, slug, title }) => {
  const progress = useProgress();
  const status = problemStatus(progress, track.id, slug);
  return (
    <div role="radiogroup" aria-label={`Status of ${title}`} className="inline-flex flex-wrap rounded-xl border border-slate-700 bg-slate-950/50 p-1 gap-1">
      {STATUSES.map((s) => {
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => progressActions.setProblemStatus(track.id, slug, s)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              active
                ? s === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : s === 'in-progress'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-slate-800 text-slate-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <StatusIcon status={s} className="h-4 w-4" />
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
};

/** Shown for problems whose worked breakdown hasn't been written yet. */
const BreakdownComingSoon: React.FC<{ track: Track }> = ({ track }) => (
  <section aria-labelledby="coming-soon-heading" className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
    <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2">Breakdown coming soon</p>
    <h2 id="coming-soon-heading" className="text-xl font-bold text-white mb-3">
      Practise this one on your own for now
    </h2>
    <p className="text-sm text-slate-300 mb-4">
      The step-by-step walkthrough, reference Java solution and tests for this problem haven't been published yet. You can still
      practise it: the statement above is the prompt, and the patterns listed in the header are the ones a strong solution
      typically uses.
    </p>
    <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300 mb-5">
      <li>Run the <a href={lessonHref(track, 'delivery-framework')} className="text-sky-400 hover:underline">LLD interview framework</a> against the statement, with a timer.</li>
      <li>Review the lessons under <em>Review first</em> if any of them feel shaky.</li>
      <li>Compare your design with a fully worked problem that uses similar ideas.</li>
    </ol>
    <a href={problemsHref(track)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
      See problems with full breakdowns <ArrowIcon className="h-3.5 w-3.5" />
    </a>
  </section>
);

const ProblemPage: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const problem = findProblem(track, slug);
  const progress = useProgress();
  const hasBreakdown = hasProblemBody(track.id, slug);
  const { state, retry } = useMarkdownBody(
    () => (hasBreakdown ? loadProblemBody(track.id, slug) : Promise.resolve('')),
    `${track.id}/${slug}`,
  );
  const articleRef = useRef<HTMLDivElement>(null);
  const headings = useHeadings(articleRef, state.status === 'ready', slug);
  const onReveal = useCallback(() => progressActions.markProblemStarted(track.id, slug), [track.id, slug]);

  if (!problem) {
    return (
      <LearningLayout track={track} headings={[]}>
        <NotFound what="problem" home={track.home} />
      </LearningLayout>
    );
  }

  const index = track.problems.indexOf(problem);
  const prev = track.problems[index - 1];
  const next = track.problems[index + 1];

  return (
    <LearningLayout track={track} current={{ type: 'problem', slug }} headings={headings}>
      <Breadcrumbs
        items={[
          ...trackCrumbs(track),
          { label: 'Practice problems', href: problemsHref(track) },
          { label: problem.title },
        ]}
      />

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <LevelBadge level={problem.difficulty} />
          <Chip className="gap-1">
            <ClockIcon /> ~{problem.minutes} min
          </Chip>
          {problem.patterns.map((p) => (
            <Chip key={p}>{p}</Chip>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Design a {problem.title}</h1>
        <p className="text-lg text-slate-400 leading-relaxed mb-6">{problem.summary}</p>
        <StatusControl track={track} slug={slug} title={problem.title} />
      </header>

      <section aria-label="Before you start" className="grid sm:grid-cols-2 gap-4 mb-10">
        <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Review first</h2>
          <ul className="space-y-2">
            {problem.concepts.map((c) => {
              const lesson = findLesson(track, c)?.lesson;
              if (!lesson) return null;
              const done = isLessonComplete(progress, track.id, c);
              return (
                <li key={c}>
                  <a href={lessonHref(track, c)} className="flex items-start gap-2 text-sm text-slate-300 hover:text-sky-400 transition-colors">
                    <CheckCircleIcon filled={done} className={`h-4 w-4 mt-0.5 flex-shrink-0 ${done ? 'text-emerald-400' : 'text-slate-600'}`} />
                    {lesson.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-300 mb-3">How to practise</h2>
          <ol className="space-y-1.5 text-sm text-slate-300 list-decimal list-inside">
            <li>Set a timer for ~{problem.minutes} minutes.</li>
            <li>Read the statement, then write your own clarifying questions.</li>
            <li>Sketch entities and classes before opening any hint.</li>
            <li>{hasBreakdown ? 'Reveal hints one at a time; compare with the solution last.' : 'Compare with a related worked problem when you are done.'}</li>
          </ol>
        </div>
      </section>

      <div ref={articleRef}>
        {!hasBreakdown && <BreakdownComingSoon track={track} />}
        {hasBreakdown && state.status === 'loading' && <ContentSkeleton />}
        {hasBreakdown && state.status === 'error' && <ContentError onRetry={retry} />}
        {hasBreakdown && state.status === 'ready' && <MarkdownContent markdown={state.body} basePath={track.basePath} onReveal={onReveal} />}
      </div>

      <div className="mt-14 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-700/80 bg-slate-900/60 p-5">
        <div>
          <p className="font-semibold text-white">Track your progress</p>
          <p className="text-sm text-slate-400">
            {hasBreakdown ? 'Opening a hint or solution moves a problem to “In progress”. ' : 'Set the status as you practise. '}
            Saved in this browser.
          </p>
        </div>
        <StatusControl track={track} slug={slug} title={problem.title} />
      </div>

      <nav aria-label="Problem navigation" className="mt-8 grid sm:grid-cols-2 gap-4">
        {prev ? (
          <a href={problemHref(track, prev.slug)} className="group rounded-xl border border-slate-700/80 p-4 hover:border-sky-500/50 transition-colors">
            <span className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              <ArrowIcon direction="left" className="h-3.5 w-3.5" /> Previous problem
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{prev.title}</span>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={problemHref(track, next.slug)} className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors">
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Next problem <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{next.title}</span>
          </a>
        ) : (
          <a href={problemsHref(track)} className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors">
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Back to <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">All practice problems</span>
          </a>
        )}
      </nav>
    </LearningLayout>
  );
};

export default ProblemPage;
