import React, { useEffect, useState } from 'react';
import { Level, Track } from '../../content/shared/types';
import { availableLessons, findLesson, flattenLessons } from '../../content/shared/curriculum';
import { INTERVIEW_TOPICS, InterviewQuestion, loadInterviewBank } from '../../content/java/interview';
import { hasProblemBody } from '../../content/shared/loaders';
import { JAVA_HOME } from '../../content/java';
import { isLessonComplete, problemStatus, progressActions, trackAnswers, useProgress } from '../learn/progress';
import { useNotebook } from '../learn/notebook';
import { lessonHref, problemHref, problemsHref } from '../learn/routes';
import { ProgressStat, SearchPanel, StageRoadmap, useTrackProgress } from '../learn/LandingParts';
import { ArrowIcon, CheckCircleIcon, Chip, ClockIcon, LEVEL_LABEL, LevelBadge, ProgressBar, StatusIcon } from '../learn/ui';
import JavaSectionNav from './JavaSectionNav';
import { revisionCount } from './revision';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

const LEVEL_DESCRIPTION: Record<Level, string> = {
  beginner: 'The platform, types, operators, control flow, methods, arrays, strings and the first half of OOP.',
  intermediate: 'OOP in depth, the Collections Framework, exceptions, generics, streams and modern Java.',
  advanced: 'JVM internals, garbage collection, the memory model, concurrency utilities and production engineering.',
};

/** Lessons interviewers ask about most, in a sensible reading order. */
const KEY_TOPICS = [
  'hashmap-internals',
  'equals-and-hashcode',
  'string-immutability',
  'polymorphism-and-overriding',
  'concurrenthashmap-internals',
  'java-memory-model',
  'synchronized-and-intrinsic-locks',
  'threadpoolexecutor-internals',
  'completablefuture',
  'virtual-threads',
  'collectors',
  'class-loading',
  'garbage-collection-basics',
  'sealed-classes-and-pattern-matching',
];

const STUDY_STEPS: { title: string; body: string }[] = [
  {
    title: 'Read, then run',
    body: 'Every lesson has a runnable example with its real output. Run it, change it, and predict the new output before you look.',
  },
  {
    title: 'Answer before revealing',
    body: 'Interview questions and exercises hide their answers. Write your own answer first; hints come one at a time.',
  },
  {
    title: 'Close each lesson with the check',
    body: 'The knowledge check gives immediate feedback. Mistakes are saved so you can review them later.',
  },
  {
    title: 'Revise from your notebook',
    body: 'Bookmark concepts, mark lessons as difficult, save snippets and notes. The revision list collects all of it.',
  },
];

const formatHours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} h`);

const prettyHeading = (id: string) => {
  const text = id.replace(/-\d+$/, '').replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const JavaLanding: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const notebook = useNotebook();
  const { lessons, lessonsDone, quizzesPassed, problemsDone, nextLesson, hasProgress } = useTrackProgress(track);
  const answers = trackAnswers(progress, track.id);
  const accuracy = answers.length > 0 ? Math.round((answers.filter((a) => a.firstCorrect).length / answers.length) * 100) : null;
  const totalMinutes = lessons.reduce((sum, l) => sum + l.minutes, 0);
  const resume = progress.resume[track.id];
  const resumeLesson = resume ? findLesson(track, resume.slug) : undefined;
  const ctaHref = nextLesson ? lessonHref(track, nextLesson.slug) : problemsHref(track);
  const ctaLabel = !nextLesson ? 'Practise coding exercises' : lessonsDone === 0 ? 'Start with lesson 1' : 'Continue learning';
  const savedCount = Object.values(notebook.saved).filter((s) => s.track === track.id).length;
  const notesCount = Object.values(notebook.notes).filter((n) => n.track === track.id).length;
  const snippetsCount = Object.values(notebook.snippets).filter((s) => s.track === track.id).length;
  const toRevise = revisionCount(track, notebook, progress);
  const ordered = flattenLessons(track);
  const plannedLessons = ordered.length - lessons.length;
  const writtenExercises = track.problems.filter((p) => hasProblemBody(track.id, p.slug));
  const [bank, setBank] = useState<InterviewQuestion[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadInterviewBank()
      .then((questions) => !cancelled && setBank(questions))
      .catch(() => !cancelled && setBank([]));
    return () => {
      cancelled = true;
    };
  }, []);
  const questionsIn = (topic: string) => bank?.filter((q) => q.topic === topic).length ?? 0;

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <JavaSectionNav active="home" />

      {/* Hero */}
      <section className="relative pt-12 pb-12 border-b border-slate-800/80">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(249,115,22,0.07),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-10 items-start">
          <div>
            <p className="text-sky-400 font-semibold mb-3 tracking-wider uppercase text-sm">Java Mastery Notebook</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
              Master Java, <span className="gradient-text">from syntax to the JVM.</span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed mb-4 max-w-2xl">
              A complete learning and revision notebook for Java engineers: core language and OOP, the Collections Framework from the inside,
              generics, streams, JVM internals, garbage collection and concurrency — written for SDE-2 and senior interviews and for
              production work.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8 max-w-2xl">
              {plannedLessons > 0 ? (
                <>
                  The notebook is being written stage by stage: {lessons.length} of {ordered.length} lessons are available now (about{' '}
                  {formatHours(totalMinutes)} of reading), and the full {track.stages.length}-stage roadmap is listed so you can see what's coming.{' '}
                </>
              ) : (
                <>
                  {lessons.length} lessons in {track.stages.length} stages (about {formatHours(totalMinutes)}), {writtenExercises.length} coding exercises
                  and an interview question bank.{' '}
                </>
              )}
              Every runnable example targets Java 17 unless it is marked with a newer version, and every output shown comes from a real run.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-sky-500/20"
              >
                {ctaLabel}
                <ArrowIcon />
              </a>
              <button
                type="button"
                onClick={() => document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 text-white font-bold border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                View the roadmap
              </button>
            </div>
            {nextLesson && lessonsDone > 0 && (
              <p className="mt-4 text-sm text-slate-400">
                Up next: <a href={ctaHref} className="text-sky-400 hover:underline">{nextLesson.title}</a>
              </p>
            )}
          </div>

          <aside aria-label="Your progress" className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Your Java progress</h2>
              {hasProgress && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset your Java lesson, quiz and exercise progress in this browser? Your notebook (notes, bookmarks, snippets) is kept.'))
                      progressActions.resetTrack(track.id);
                  }}
                  className="text-xs text-slate-500 hover:text-rose-300 underline underline-offset-2"
                >
                  Reset
                </button>
              )}
            </div>
            <ProgressStat label="Lessons completed" value={lessonsDone} max={lessons.length} />
            <ProgressStat label="Knowledge checks passed" value={quizzesPassed} max={lessons.length} />
            {writtenExercises.length > 0 && <ProgressStat label="Exercises completed" value={problemsDone} max={writtenExercises.length} />}
            <p className="text-sm text-slate-300">
              Quiz accuracy:{' '}
              <span className="font-bold text-white">{accuracy === null ? '—' : `${accuracy}%`}</span>
              <span className="text-slate-500"> {answers.length > 0 ? `(first attempts, ${answers.length} answered)` : '(no answers yet)'}</span>
            </p>
            <a href={`${JAVA_HOME}/progress`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
              Open the progress dashboard <ArrowIcon className="h-3.5 w-3.5" />
            </a>
            <p className="text-xs text-slate-500">Progress and notes are stored in this browser only. Export them from the notebook to keep a backup.</p>
          </aside>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Continue where you left off */}
        {resumeLesson && (
          <section aria-labelledby="resume-heading" className="pt-10">
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 id="resume-heading" className="text-xs font-semibold uppercase tracking-wider text-sky-300 mb-1">
                  Continue where you left off
                </h2>
                <p className="font-bold text-white truncate">{resumeLesson.lesson.title}</p>
                <p className="text-sm text-slate-400">
                  Stage {resumeLesson.stage.number} · {resumeLesson.moduleTitle}
                  {resume?.heading ? ` · at “${prettyHeading(resume.heading)}”` : ''}
                  {isLessonComplete(progress, track.id, resumeLesson.lesson.slug) ? ' · completed' : ''}
                </p>
              </div>
              <a
                href={lessonHref(track, resumeLesson.lesson.slug)}
                className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold"
              >
                Resume <ArrowIcon className="h-4 w-4" />
              </a>
            </div>
          </section>
        )}

        {/* Search */}
        <section aria-label="Search" className="py-10">
          <SearchPanel track={track} placeholder="Search lessons & exercises — try “HashMap”, “volatile”, “G1”, “collectors”, “records”" />
        </section>

        {/* Levels */}
        <section aria-labelledby="levels-heading" className="pb-14">
          <h2 id="levels-heading" className="text-2xl font-bold mb-2">
            Three <span className="text-sky-500">levels</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            Lessons are tagged by level. Work through the stages in order; within a stage, the deep dives can wait until the essentials feel easy.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {LEVELS.map((level) => {
              const levelLessons = availableLessons(ordered.map((l) => l.lesson)).filter((l) => l.level === level);
              const levelPlanned = ordered.filter((l) => l.lesson.level === level && l.lesson.comingSoon).length;
              const done = levelLessons.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
              const minutes = levelLessons.reduce((sum, l) => sum + l.minutes, 0);
              const next = levelLessons.find((l) => !isLessonComplete(progress, track.id, l.slug)) ?? levelLessons[0];
              return (
                <div key={level} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white">{LEVEL_LABEL[level]}</h3>
                    <LevelBadge level={level} />
                  </div>
                  <p className="text-sm text-slate-400 mb-4 flex-1">{LEVEL_DESCRIPTION[level]}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Chip>{levelLessons.length} lessons available</Chip>
                    {levelLessons.length > 0 && (
                      <Chip className="gap-1">
                        <ClockIcon /> ~{formatHours(minutes)}
                      </Chip>
                    )}
                    {levelPlanned > 0 && <Chip className="!text-slate-400">{levelPlanned} coming soon</Chip>}
                  </div>
                  {levelLessons.length > 0 ? (
                    <div className="flex items-center gap-2 mb-4">
                      <ProgressBar value={done} max={levelLessons.length} label={`${LEVEL_LABEL[level]} lessons completed`} />
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {done}/{levelLessons.length}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mb-4">These lessons are planned and will appear here as they are written.</p>
                  )}
                  {next && (
                    <a href={lessonHref(track, next.slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                      {done === 0 ? 'Start' : done === levelLessons.length ? 'Review' : 'Continue'}: {next.title} <ArrowIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick access */}
        <section aria-labelledby="quick-heading" className="pb-14">
          <h2 id="quick-heading" className="text-2xl font-bold mb-2">
            Quick access: <span className="text-sky-500">most-asked topics</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            The topics that come up in almost every SDE-2 Java interview. Lessons from later stages are marked “coming soon” until they're
            written.
          </p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {KEY_TOPICS.map((slug) => {
              const loc = findLesson(track, slug);
              if (!loc) return null;
              const done = isLessonComplete(progress, track.id, slug);
              return (
                <li key={slug}>
                  <a
                    href={lessonHref(track, slug)}
                    className="group flex h-full items-start gap-3 rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 hover:border-sky-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <CheckCircleIcon filled={done} className={`h-5 w-5 mt-0.5 flex-shrink-0 ${done ? 'text-emerald-400' : 'text-slate-600'}`} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-100 group-hover:text-sky-300">{loc.lesson.title}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Stage {loc.stage.number} · {loc.lesson.comingSoon ? 'coming soon' : `${loc.lesson.minutes} min`}
                        {done && <span className="sr-only"> (completed)</span>}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Roadmap */}
        <section id="roadmap" aria-labelledby="roadmap-heading" className="pb-14 scroll-mt-32">
          <h2 id="roadmap-heading" className="text-2xl font-bold mb-2">
            Java <span className="text-sky-500">roadmap</span>
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            Eleven stages from your first program to the JVM and the concurrency round. Expand a stage to see its modules, lessons and your
            progress in each module. Lessons marked <em>deep dive</em> are worth a second pass.
          </p>
          <StageRoadmap
            track={track}
            after={
              <>
                <li className="relative pl-14">
                  <span className="absolute left-0 top-4 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 bg-slate-900 border-violet-400/60 text-violet-300" aria-hidden="true">
                    {track.stages.length + 1}
                  </span>
                  <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Stage {track.stages.length + 1} · Beginner → Advanced</p>
                        <h3 className="text-lg font-bold text-white">Coding Exercises</h3>
                        <p className="text-sm text-slate-400 mt-1">
                          Starter code, progressive hints, test cases and tested reference solutions — from immutable classes to dining philosophers.
                        </p>
                      </div>
                      <a
                        href={problemsHref(track)}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 self-start px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors"
                      >
                        Open exercises <ArrowIcon className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    {writtenExercises.length > 0 ? (
                      <div className="mt-4 flex items-center gap-2 w-full sm:w-64">
                        <ProgressBar value={problemsDone} max={writtenExercises.length} label="Exercises completed" />
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {problemsDone}/{writtenExercises.length}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-slate-500">{track.problems.length} exercises planned · coming soon</p>
                    )}
                  </div>
                </li>
                <li className="relative pl-14">
                  <span className="absolute left-0 top-4 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 bg-slate-900 border-violet-400/60 text-violet-300" aria-hidden="true">
                    Q
                  </span>
                  <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Interview preparation · All levels</p>
                      <h3 className="text-lg font-bold text-white">Interview Question Bank & Tricky Questions</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Conceptual, internals, output-prediction, debugging, scenario and coding questions
                        {bank ? ` — ${bank.length} so far, covering the stages written to date.` : '.'}
                      </p>
                    </div>
                    <a
                      href={`${JAVA_HOME}/interview`}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 self-start px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors"
                    >
                      Practise questions <ArrowIcon className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              </>
            }
          />
        </section>

        {/* Exercises */}
        <section aria-labelledby="exercises-heading" className="pb-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="exercises-heading" className="text-2xl font-bold mb-1">
                Coding <span className="text-sky-500">exercises</span>
              </h2>
              <p className="text-slate-400">Grouped by difficulty. Each links back to the lessons it exercises.</p>
            </div>
            <a href={problemsHref(track)} className="text-sm font-semibold text-sky-400 hover:text-sky-300">
              Filter & search all →
            </a>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {LEVELS.map((level) => (
              <div key={level} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white">{LEVEL_LABEL[level]}</h3>
                  <LevelBadge level={level} />
                </div>
                <ul className="space-y-1">
                  {track.problems
                    .filter((p) => p.difficulty === level)
                    .map((p) => (
                      <li key={p.slug}>
                        <a href={problemHref(track, p.slug)} className="flex items-start gap-2 py-1 text-sm text-slate-300 hover:text-sky-300">
                          <StatusIcon status={problemStatus(progress, track.id, p.slug)} className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>
                            {p.title}
                            {!hasProblemBody(track.id, p.slug) && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-500">soon</span>}
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Interview prep */}
        <section aria-labelledby="interview-heading" className="pb-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="interview-heading" className="text-2xl font-bold mb-1">
                Interview <span className="text-sky-500">preparation</span>
              </h2>
              <p className="text-slate-400 max-w-3xl">
                Attempt each question in your own words, take hints one at a time, then compare with a detailed answer that also explains why
                common answers fall short.
              </p>
            </div>
            <a
              href={`${JAVA_HOME}/interview/tricky`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm font-semibold hover:bg-violet-500/25"
            >
              Java tricky questions <ArrowIcon className="h-4 w-4" />
            </a>
          </div>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {INTERVIEW_TOPICS.map((topic) => (
              <li key={topic.id}>
                <a
                  href={`${JAVA_HOME}/interview/${topic.id}`}
                  className="group block h-full rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 hover:border-sky-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-100 group-hover:text-sky-300">{topic.title}</span>
                    {bank && (
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">
                        {questionsIn(topic.id) > 0 ? `${questionsIn(topic.id)} questions` : 'coming soon'}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500 mt-1">{topic.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Notebook */}
        <section aria-labelledby="notebook-heading" className="pb-14">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <h2 id="notebook-heading" className="text-xl font-bold mb-1">
                My Java Revision Notebook
              </h2>
              <p className="text-sm text-slate-400 max-w-2xl">
                Everything you save while studying lands here: bookmarked lessons and concepts, tricky questions, personal notes, code snippets,
                difficult topics and the quiz questions you got wrong.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip>{savedCount} saved</Chip>
                <Chip>{notesCount} notes</Chip>
                <Chip>{snippetsCount} snippets</Chip>
                <Chip className={toRevise > 0 ? '!bg-amber-500/10 !text-amber-300 !border-amber-500/30' : ''}>{toRevise} to revise</Chip>
              </div>
            </div>
            <a
              href={`${JAVA_HOME}/notebook`}
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-semibold text-sm hover:bg-slate-700 transition-colors"
            >
              Open notebook <ArrowIcon className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* How to study */}
        <section aria-labelledby="study-heading" className="pb-14">
          <h2 id="study-heading" className="text-2xl font-bold mb-6">
            How to <span className="text-sky-500">use</span> this notebook
          </h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STUDY_STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-2">Step {i + 1}</p>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Running Java locally */}
        <section aria-labelledby="run-heading" className="pb-16">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
            <div>
              <h2 id="run-heading" className="text-xl font-bold mb-2">Running the examples</h2>
              <p className="text-sm text-slate-400 mb-3">
                Code runs on your machine, not in the browser. Each runnable example is a single file whose public class matches the file name shown
                on the code block, and carries a badge with the minimum Java version it needs.
              </p>
              <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
                <li>Install JDK 17 or newer (JDK 21 or 25 for examples marked with those versions).</li>
                <li>Copy the example with the <em>Copy</em> button into a file with the name shown on the block.</li>
                <li>Run it directly — no build tool needed.</li>
              </ol>
            </div>
            <pre className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-[13px] font-mono text-slate-300 overflow-x-auto self-center">
              <code>{`# Java 11+ runs a single source file directly
java HashMapDemo.java

# or compile first, then run
javac HashMapDemo.java
java HashMapDemo

# JUnit tests: use your IDE or Maven/Gradle
# with junit-jupiter 5 on the test classpath`}</code>
            </pre>
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-sm text-slate-500">
        Original content written for this site. Java is a trademark of Oracle and/or its affiliates.{' '}
        <a href="#" className="text-sky-400 hover:underline">
          Back to portfolio
        </a>
      </footer>
    </main>
  );
};

export default JavaLanding;
