import React, { useCallback, useRef } from 'react';
import { Track } from '../../content/system-design/types';
import { findLesson, findProblem, flattenLessons } from '../../content/system-design';
import { loadLessonBody } from '../../content/system-design/loaders';
import LearningLayout, { useHeadings } from './LearningLayout';
import MarkdownContent from './MarkdownContent';
import { isLessonComplete, isQuizPassed, problemStatus, progressActions, useProgress } from './progress';
import { lessonHref, problemHref, problemsHref, ROOT_HREF, trackHref } from './routes';
import { useMarkdownBody } from './useMarkdownBody';
import { ArrowIcon, Breadcrumbs, CheckCircleIcon, Chip, ClockIcon, LevelBadge, StatusIcon } from './ui';
import { ContentError, ContentSkeleton, NotFound } from './States';

const LessonPage: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const location = findLesson(track, slug);
  const progress = useProgress();
  const { state, retry } = useMarkdownBody(() => loadLessonBody(track.id, slug), `${track.id}/${slug}`);
  const articleRef = useRef<HTMLDivElement>(null);
  const headings = useHeadings(articleRef, state.status === 'ready', slug);
  const onQuizPassed = useCallback(() => progressActions.markQuizPassed(track.id, slug), [track.id, slug]);

  if (!location) {
    return (
      <LearningLayout track={track} headings={[]}>
        <NotFound what="lesson" />
      </LearningLayout>
    );
  }

  const { lesson, stage, moduleTitle, index } = location;
  const ordered = flattenLessons(track);
  const prev = ordered[index - 1]?.lesson;
  const next = ordered[index + 1]?.lesson;
  const done = isLessonComplete(progress, track.id, slug);
  const quizPassed = isQuizPassed(progress, track.id, slug);

  return (
    <LearningLayout track={track} current={{ type: 'lesson', slug }} headings={headings}>
      <Breadcrumbs
        items={[
          { label: 'System Design', href: ROOT_HREF },
          { label: track.title, href: trackHref(track.id) },
          { label: `Stage ${stage.number}: ${stage.title}` },
          { label: lesson.title },
        ]}
      />

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <LevelBadge level={lesson.level} />
          <Chip>{moduleTitle}</Chip>
          <Chip className="gap-1">
            <ClockIcon /> {lesson.minutes} min
          </Chip>
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
            <p className="text-sm text-slate-300">None — a good place to start. Basic Java syntax is assumed.</p>
          ) : (
            <ul className="space-y-2">
              {lesson.prerequisites.map((p) => {
                const pre = findLesson(track, p)?.lesson;
                if (!pre) return null;
                const preDone = isLessonComplete(progress, track.id, p);
                return (
                  <li key={p}>
                    <a href={lessonHref(track.id, p)} className="flex items-start gap-2 text-sm text-slate-300 hover:text-sky-400 transition-colors">
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
        {state.status === 'loading' && <ContentSkeleton />}
        {state.status === 'error' && <ContentError onRetry={retry} />}
        {state.status === 'ready' && (
          <MarkdownContent markdown={state.body} track={track.id} onQuizPassed={onQuizPassed} quizAlreadyPassed={quizPassed} />
        )}
      </div>

      <section aria-labelledby="related-heading" className="mt-14 rounded-xl border border-slate-700/80 bg-slate-800/30 p-5 sm:p-6">
        <h2 id="related-heading" className="text-lg font-bold text-white mb-4">
          Keep going
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Related concepts</h3>
            <ul className="space-y-1.5">
              {lesson.related.map((r) => {
                const rel = findLesson(track, r)?.lesson;
                return rel ? (
                  <li key={r}>
                    <a href={lessonHref(track.id, r)} className="text-sm text-sky-400 hover:text-sky-300">
                      {rel.title}
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Practice problems</h3>
            <ul className="space-y-1.5">
              {lesson.problems.map((p) => {
                const problem = findProblem(track, p);
                return problem ? (
                  <li key={p}>
                    <a href={problemHref(track.id, p)} className="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300">
                      <StatusIcon status={problemStatus(progress, track.id, p)} className="h-4 w-4" />
                      {problem.title}
                      <LevelBadge level={problem.difficulty} className="!text-[10px]" />
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-700/80 bg-slate-900/60 p-5">
        <div>
          <p className="font-semibold text-white">{done ? 'Lesson completed' : 'Finished this lesson?'}</p>
          <p className="text-sm text-slate-400">
            {quizPassed ? 'Knowledge check passed. ' : 'Tip: pass the knowledge check above before moving on. '}
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

      <nav aria-label="Lesson navigation" className="mt-8 grid sm:grid-cols-2 gap-4">
        {prev ? (
          <a href={lessonHref(track.id, prev.slug)} className="group rounded-xl border border-slate-700/80 p-4 hover:border-sky-500/50 transition-colors">
            <span className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              <ArrowIcon direction="left" className="h-3.5 w-3.5" /> Previous
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{prev.title}</span>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={lessonHref(track.id, next.slug)} className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors">
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Next <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">{next.title}</span>
          </a>
        ) : (
          <a href={problemsHref(track.id)} className="group rounded-xl border border-slate-700/80 p-4 text-right hover:border-sky-500/50 transition-colors">
            <span className="flex items-center justify-end gap-1 text-xs text-slate-400 mb-1">
              Up next <ArrowIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-200 group-hover:text-sky-300">Practice problems</span>
          </a>
        )}
      </nav>
    </LearningLayout>
  );
};

export default LessonPage;
