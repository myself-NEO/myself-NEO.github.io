import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LessonMeta, Track } from '../../content/shared/types';
import { findLesson, findProblem, flattenLessons } from '../../content/shared/curriculum';
import { loadLessonBody } from '../../content/shared/loaders';
import LearningLayout, { useHeadings } from './LearningLayout';
import MarkdownContent from './MarkdownContent';
import LessonNotes from './LessonNotes';
import { getProgress, isLessonComplete, isQuizPassed, problemStatus, progressActions, QuizAnswer, useProgress } from './progress';
import { isSaved, itemKey, notebookActions, useNotebook } from './notebook';
import { lessonHref, problemHref, problemsHref, trackCrumbs } from './routes';
import { practiceCopy } from './practice';
import { takeJumpTarget } from './jump';
import { useMarkdownBody } from './useMarkdownBody';
import { ArrowIcon, BookmarkIcon, Breadcrumbs, CheckCircleIcon, Chip, ClockIcon, FlagIcon, LevelBadge, StatusIcon, ToggleChip } from './ui';
import { ContentError, ContentSkeleton, NotFound } from './States';

/** How long the reader must stay on a section before it becomes the resume point. */
const RESUME_DELAY_MS = 1200;

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
  const notebook = useNotebook();
  const { state, retry } = useMarkdownBody(
    () => (location && !comingSoon ? loadLessonBody(track.id, slug) : Promise.resolve('')),
    `${track.id}/${slug}`,
  );
  const articleRef = useRef<HTMLDivElement>(null);
  const headings = useHeadings(articleRef, state.status === 'ready', slug);
  const onQuizPassed = useCallback(() => progressActions.markQuizPassed(track.id, slug), [track.id, slug]);
  const onQuizAnswer = useCallback((answer: QuizAnswer) => progressActions.recordQuizAnswer(track.id, slug, answer), [track.id, slug]);

  // Where the learner stopped reading last time (captured before this visit overwrites it).
  const [resumeHeading, setResumeHeading] = useState(() => {
    const saved = getProgress().resume[track.id];
    return saved?.slug === slug ? saved.heading : undefined;
  });
  const exists = Boolean(location) && !comingSoon;
  useEffect(() => {
    if (exists) progressActions.markLessonVisited(track.id, slug);
  }, [exists, track.id, slug]);

  // Only record the reading position once the learner scrolls, so merely opening the page doesn't erase it.
  const scrolled = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const onScroll = () => {
      scrolled.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true, once: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(resumeTimer.current);
    };
  }, [slug]);
  const onActiveHeading = useCallback(
    (id: string | null) => {
      if (!exists || !scrolled.current) return;
      clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => progressActions.setResumeHeading(track.id, slug, id ?? undefined), RESUME_DELAY_MS);
    },
    [exists, track.id, slug],
  );

  // A link from the notebook to a saved section: scroll there once the content has rendered.
  const ready = state.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const target = takeJumpTarget(`lesson:${track.id}:${slug}#`);
    if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
  }, [ready, track.id, slug]);

  // Personal revision tools (tracks with a notebook only).
  const stageId = location?.stage.id ?? '';
  const lessonTitle = location?.lesson.title ?? '';
  const savedSections = useMemo(
    () =>
      new Set(
        Object.values(notebook.saved)
          .filter((item) => item.kind === 'section' && item.track === track.id && item.ref.startsWith(`${slug}#`))
          .map((item) => item.ref.slice(slug.length + 1)),
      ),
    [notebook.saved, track.id, slug],
  );
  const onToggleSection = useCallback(
    (id: string, title: string) =>
      notebookActions.toggleSaved({ kind: 'section', track: track.id, ref: `${slug}#${id}`, title, context: lessonTitle, topic: stageId }),
    [track.id, slug, lessonTitle, stageId],
  );
  const onSaveSnippet = useCallback(
    (snippet: { code: string; language: string; title?: string }) => {
      notebookActions.addSnippet({
        track: track.id,
        title: snippet.title ? `${snippet.title} (${lessonTitle})` : lessonTitle,
        code: snippet.code,
        language: snippet.language,
        topic: stageId,
        lesson: slug,
      });
    },
    [track.id, slug, lessonTitle, stageId],
  );

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
  const practice = practiceCopy(track);
  const withNotebook = Boolean(track.notebook) && !comingSoon;
  const bookmarked = isSaved(notebook, 'lesson', track.id, slug);
  const difficult = Boolean(notebook.difficult[itemKey(track.id, slug)]);
  const javaVersion = lesson.javaVersion ?? track.javaVersion;
  const resumeTarget = state.status === 'ready' && resumeHeading ? headings.find((h) => h.id === resumeHeading) : undefined;
  const showResume = Boolean(resumeTarget && headings[0]?.id !== resumeTarget.id);

  return (
    <LearningLayout track={track} current={{ type: 'lesson', slug }} headings={headings} onActiveHeading={onActiveHeading}>
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
          {javaVersion !== undefined && <Chip className="!bg-orange-400/10 !text-orange-200 !border-orange-400/30">Java {javaVersion}+</Chip>}
          {done && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <CheckCircleIcon filled className="h-4 w-4" /> Completed
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{lesson.title}</h1>
        <p className="text-lg text-slate-400 leading-relaxed">{lesson.summary}</p>
        {withNotebook && (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Revision tools">
            <ToggleChip
              pressed={bookmarked}
              onClick={() =>
                notebookActions.toggleSaved({
                  kind: 'lesson',
                  track: track.id,
                  ref: slug,
                  title: lesson.title,
                  context: `Stage ${stage.number}: ${stage.title}`,
                  topic: stage.id,
                })
              }
              icon={<BookmarkIcon filled={bookmarked} className="h-3.5 w-3.5" />}
              label="Bookmark lesson"
              pressedLabel="Bookmarked"
            />
            <ToggleChip
              pressed={difficult}
              onClick={() => notebookActions.toggleDifficult(track.id, slug)}
              icon={<FlagIcon filled={difficult} className="h-3.5 w-3.5" />}
              label="Mark as difficult"
              pressedLabel="Difficult: on your revision list"
              tone="amber"
            />
          </div>
        )}
      </header>

      <section aria-label="Lesson overview" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 [overflow-wrap:anywhere]">
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
            <p className="text-sm text-slate-300">
              None — a good place to start. {track.assumedKnowledge ?? `Basic ${track.language ?? 'programming'} syntax is assumed.`}
            </p>
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

      {showResume && resumeTarget && (
        <div role="status" className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3">
          <p className="text-sm text-slate-300">
            Welcome back. You were reading <span className="font-semibold text-white">“{resumeTarget.text}”</span>.
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                document.getElementById(resumeTarget.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setResumeHeading(undefined);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              Continue there <ArrowIcon className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setResumeHeading(undefined)} className="text-xs text-slate-400 hover:text-white underline underline-offset-2">
              Start from the top
            </button>
          </div>
        </div>
      )}

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
            onQuizAnswer={onQuizAnswer}
            javaVersion={track.javaVersion}
            onToggleSection={withNotebook ? onToggleSection : undefined}
            savedSections={withNotebook ? savedSections : undefined}
            onSaveSnippet={withNotebook ? onSaveSnippet : undefined}
          />
        )}
      </div>

      {withNotebook && state.status === 'ready' && (
        <LessonNotes
          key={slug}
          track={track}
          lesson={lesson}
          topic={stage.id}
          notebookHref={track.sectionLinks?.find((l) => /notebook/i.test(l.label))?.href}
        />
      )}

      {!comingSoon && (relatedLessons.length > 0 || relatedProblems.length > 0) && (
        <section aria-labelledby="related-heading" className="mt-14 rounded-xl border border-slate-700/80 bg-slate-800/30 p-5 sm:p-6">
          <h2 id="related-heading" className="text-lg font-bold text-white mb-4">
            Keep going
          </h2>
          <div className={`grid gap-6 ${relatedProblems.length > 0 ? 'sm:grid-cols-2' : ''}`}>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Related lessons</h3>
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
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{practice.groupTitle}</h3>
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
              {track.problems.length > 0 ? practice.groupTitle : `Back to the ${track.home.label} roadmap`}
            </span>
          </a>
        )}
      </nav>
    </LearningLayout>
  );
};

export default LessonPage;
