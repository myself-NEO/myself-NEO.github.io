import React, { useCallback, useRef } from 'react';
import { LessonMeta, Track } from '../../content/shared/types';
import { findLesson, findProblem, flattenLessons } from '../../content/shared/curriculum';
import { loadLessonBody } from '../../content/shared/loaders';
import LearningLayout, { useHeadings } from './LearningLayout';
import MarkdownContent from './MarkdownContent';
import { isLessonComplete, isQuizPassed, problemStatus, progressActions, useProgress } from './progress';
import { lessonHref, problemHref, problemsHref, trackCrumbs } from './routes';
import { useMarkdownBody } from './useMarkdownBody';
import { ArrowIcon, Breadcrumbs, CheckCircleIcon, Chip, ClockIcon, LevelBadge, StatusIcon } from './ui';
import { ContentError, ContentSkeleton, NotFound } from './States';

/**
 * The page header already shows the lesson title, so a note's own leading "# Title" line is dropped —
 * unless it is the first of several parts ("# Dynamic Programming — Part 1: …"), which labels a section.
 */
const stripLeadingTitle = (markdown: string) =>
  markdown.replace(/^\s*#\s([^\n]*)\n/, (line, title: string) => (/\bpart\s+\d+\s*[:—–-]/i.test(title) ? line : ''));

const ComingSoonNotes: React.FC<{ track: Track; lesson: LessonMeta }> = ({ track, lesson }) => {
  const related = lesson.related.map((slug) => findLesson(track, slug)?.lesson).filter((l): l is LessonMeta => Boolean(l && !l.comingSoon));
  return (
    <section aria-labelledby="coming-soon-heading" className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2">Notes coming soon</p>
      <h2 id="coming-soon-heading" className="text-xl font-bold text-white mb-3">
        This guide hasn't been written yet
      </h2>
      <p className="text-sm text-slate-300 mb-4">
        It has a place in the curriculum so the learning path stays complete. The objectives above show what it will cover.
      </p>
      {related.length > 0 && (
        <>
          <p className="text-sm text-slate-300 mb-2">In the meantime, these guides cover parts of it:</p>
          <ul className="space-y-1.5">
            {related.map((r) => (
              <li key={r.slug}>
                <a href={lessonHref(track, r.slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                  {r.title} <ArrowIcon className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

const LessonPage: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const location = findLesson(track, slug);
  const comingSoon = Boolean(location?.lesson.comingSoon);
  const progress = useProgress();
  const { state, retry } = useMarkdownBody(
    () => (location && !comingSoon ? loadLessonBody(track.id, slug) : Promise.resolve('')),
    `${track.id}/${slug}`,
  );
  const articleRef = useRef<HTMLDivElement>(null);
  const headings = useHeadings(articleRef, state.status === 'ready', slug);
  const onQuizPassed = useCallback(() => progressActions.markQuizPassed(track.id, slug), [track.id, slug]);

  if (!location) {
    return (
      <LearningLayout track={track} headings={[]}>
        <NotFound what="lesson" home={track.home} />
      </LearningLayout>
    );
  }

  const { lesson, stage, moduleTitle, index } = location;
  const ordered = flattenLessons(track);
  const prev = ordered[index - 1]?.lesson;
  const next = ordered[index + 1]?.lesson;
  const done = isLessonComplete(progress, track.id, slug);
  const quizPassed = isQuizPassed(progress, track.id, slug);
  const hasQuiz = state.status === 'ready' && state.body.includes('```quiz');
  const relatedLessons = lesson.related.map((r) => findLesson(track, r)?.lesson).filter((l): l is LessonMeta => Boolean(l));
  const relatedProblems = lesson.problems.map((p) => findProblem(track, p)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <LearningLayout track={track} current={{ type: 'lesson', slug }} headings={headings}>
      <Breadcrumbs items={[...trackCrumbs(track), { label: `Stage ${stage.number}: ${stage.title}` }, { label: lesson.title }]} />

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <LevelBadge level={lesson.level} />
          <Chip>{moduleTitle}</Chip>
          {comingSoon ? (
            <Chip className="!bg-amber-500/10 !text-amber-300 !border-amber-500/30">Coming soon</Chip>
          ) : (
            <Chip className="gap-1">
              <ClockIcon /> {lesson.minutes} min
            </Chip>
          )}
          {lesson.essential ? (
            <Chip className="!bg-sky-500/10 !text-sky-300 !border-sky-500/30">Interview essential</Chip>
          ) : (
            <Chip className="!bg-indigo-500/10 !text-indigo-300 !border-indigo-500/30">Deep dive · after fundamentals</Chip>
          )}
          {done && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <CheckCircleIcon filled className="h-4 w-4" /> Completed
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{lesson.title}</h1>
        <p className="text-lg text-slate-400 leading-relaxed">{lesson.summary}</p>
      </header>

      <section aria-label="Lesson overview" className="grid sm:grid-cols-2 gap-4 mb-10">
        <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Learning objectives</h2>
          <ul className="space-y-2">
            {lesson.objectives.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-slate-300">
                <span className="text-sky-400 mt-0.5" aria-hidden="true">✓</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Prerequisites</h2>
          {lesson.prerequisites.length === 0 ? (
            <p className="text-sm text-slate-300">None — a good place to start. Basic {track.language ?? 'programming'} syntax is assumed.</p>
          ) : (
            <ul className="space-y-2">
              {lesson.prerequisites.map((p) => {
                const pre = findLesson(track, p)?.lesson;
                if (!pre) return null;
                const preDone = isLessonComplete(progress, track.id, p);
                return (
                  <li key={p}>
                    <a href={lessonHref(track, p)} className="flex items-start gap-2 text-sm text-slate-300 hover:text-sky-400 transition-colors">
                      <CheckCircleIcon filled={preDone} className={`h-4 w-4 mt-0.5 flex-shrink-0 ${preDone ? 'text-emerald-400' : 'text-slate-600'}`} />
                      {pre.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div ref={articleRef}>
        {comingSoon && <ComingSoonNotes track={track} lesson={lesson} />}
        {!comingSoon && state.status === 'loading' && <ContentSkeleton />}
        {!comingSoon && state.status === 'error' && <ContentError onRetry={retry} />}
        {!comingSoon && state.status === 'ready' && (
          <MarkdownContent
            markdown={stripLeadingTitle(state.body)}
            basePath={track.basePath}
            onQuizPassed={onQuizPassed}
            quizAlreadyPassed={quizPassed}
          />
        )}
      </div>

      {!comingSoon && (relatedLessons.length > 0 || relatedProblems.length > 0) && (
        <section aria-labelledby="related-heading" className="mt-14 rounded-xl border border-slate-700/80 bg-slate-800/30 p-5 sm:p-6">
          <h2 id="related-heading" className="text-lg font-bold text-white mb-4">
            Keep going
          </h2>
          <div className={`grid gap-6 ${relatedProblems.length > 0 ? 'sm:grid-cols-2' : ''}`}>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Related topics</h3>
              <ul className="space-y-1.5">
                {relatedLessons.map((rel) => (
                  <li key={rel.slug}>
                    <a href={lessonHref(track, rel.slug)} className="text-sm text-sky-400 hover:text-sky-300">
                      {rel.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {relatedProblems.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Practice problems</h3>
                <ul className="space-y-1.5">
                  {relatedProblems.map((problem) => (
                    <li key={problem.slug}>
                      <a href={problemHref(track, problem.slug)} className="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300">
                        <StatusIcon status={problemStatus(progress, track.id, problem.slug)} className="h-4 w-4" />
                        {problem.title}
                        <LevelBadge level={problem.difficulty} className="!text-[10px]" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {!comingSoon && (
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-700/80 bg-slate-900/60 p-5">
          <div>
            <p className="font-semibold text-white">{done ? 'Lesson completed' : 'Finished this lesson?'}</p>
            <p className="text-sm text-slate-400">
              {hasQuiz && (quizPassed ? 'Knowledge check passed. ' : 'Tip: pass the knowledge check above before moving on. ')}
              Progress is saved in this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={() => progressActions.setLessonComplete(track.id, slug, !done)}
            aria-pressed={done}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              done ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25' : 'bg-sky-500 hover:bg-sky-400 text-white'
            }`}
          >
            <CheckCircleIcon filled={done} className="h-5 w-5" />
            {done ? 'Completed — mark as not done' : 'Mark lesson complete'}
          </button>
        </div>
      )}

      <nav aria-label="Lesson navigation" className="mt-8 grid sm:grid-cols-2 gap-4">
        {prev ? (
          <a href={lessonHref(track, prev.slug)} className="group rounded-xl border border-slate-700/80 p-4 hover:border-sky-500/50 transition-colors">
            <span className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              <ArrowIcon direction="left" className="h-3.5 w-3.5" /> Previous
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{prev.title}</span>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={lessonHref(track, next.slug)} className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors">
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Next <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{next.title}</span>
          </a>
        ) : (
          <a
            href={track.problems.length > 0 ? problemsHref(track) : track.home.href}
            className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors"
          >
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Up next <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">
              {track.problems.length > 0 ? 'Practice problems' : `Back to the ${track.home.label} roadmap`}
            </span>
          </a>
        )}
      </nav>
    </LearningLayout>
  );
};

export default LessonPage;
