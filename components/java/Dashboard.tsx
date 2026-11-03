import React from 'react';
import { Track } from '../../content/shared/types';
import { availableLessons, findLesson, flattenLessons } from '../../content/shared/curriculum';
import { JAVA_HOME } from '../../content/java';
import { hasProblemBody } from '../../content/shared/loaders';
import { isLessonComplete, isLessonVisited, isQuizPassed, problemStatus, trackAnswers, useProgress } from '../learn/progress';
import { useNotebook } from '../learn/notebook';
import { lessonHref, problemsHref } from '../learn/routes';
import { ArrowIcon, Breadcrumbs, ClockIcon, ProgressBar, StatTile } from '../learn/ui';
import StageProgressList from '../learn/StageProgressList';
import JavaSectionNav from './JavaSectionNav';
import { revisionItems } from './revision';

const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** #java/progress — everything here is computed from the learner's recorded activity. */
const Dashboard: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const notebook = useNotebook();

  const ordered = flattenLessons(track).filter((l) => !l.lesson.comingSoon);
  const lessons = ordered.map((l) => l.lesson);
  const done = lessons.filter((l) => isLessonComplete(progress, track.id, l.slug));
  const inProgress = ordered
    .filter((l) => isLessonVisited(progress, track.id, l.lesson.slug) && !isLessonComplete(progress, track.id, l.lesson.slug))
    .sort((a, b) => (progress.visited[`${track.id}:${b.lesson.slug}`] ?? 0) - (progress.visited[`${track.id}:${a.lesson.slug}`] ?? 0));
  const quizzesPassed = lessons.filter((l) => isQuizPassed(progress, track.id, l.slug)).length;
  const modules = track.stages
    .flatMap((s) => s.modules.map((m) => ({ stage: s, module: m, lessons: availableLessons(m.lessons) })))
    .filter((m) => m.lessons.length > 0);
  const plannedLessons = flattenLessons(track).length - lessons.length;
  const modulesDone = modules.filter((m) => m.lessons.length > 0 && m.lessons.every((l) => isLessonComplete(progress, track.id, l.slug))).length;
  const writtenExercises = track.problems.filter((p) => hasProblemBody(track.id, p.slug)).length;
  const exercisesDone = track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'completed').length;
  const exercisesStarted = track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'in-progress').length;
  const answers = trackAnswers(progress, track.id);
  const firstTry = answers.filter((a) => a.firstCorrect).length;
  const accuracy = answers.length > 0 ? Math.round((firstTry / answers.length) * 100) : null;
  const saved = Object.values(notebook.saved).filter((s) => s.track === track.id);
  const savedConcepts = saved.filter((s) => s.kind !== 'question').length;
  const savedQuestions = saved.filter((s) => s.kind === 'question').length;
  const questionStates = Object.entries(notebook.questions).filter(([k]) => k.startsWith(`${track.id}:`)).map(([, v]) => v);
  const ratings = {
    gotIt: questionStates.filter((q) => q.rating === 'got-it').length,
    partial: questionStates.filter((q) => q.rating === 'partial').length,
    missed: questionStates.filter((q) => q.rating === 'missed').length,
  };
  const practised = questionStates.filter((q) => q.revealedAt || q.draft?.trim()).length;
  const revision = revisionItems(track, notebook, progress);
  const due = revision.filter((i) => i.due);
  const remainingMinutes = lessons.filter((l) => !isLessonComplete(progress, track.id, l.slug)).reduce((sum, l) => sum + l.minutes, 0);
  const overall = lessons.length === 0 ? 0 : Math.round((done.length / lessons.length) * 100);
  const recent = Object.entries(progress.lessons)
    .filter(([k]) => k.startsWith(`${track.id}:`))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k, at]) => ({ loc: findLesson(track, k.slice(track.id.length + 1)), at }))
    .filter((r): r is { loc: NonNullable<typeof r.loc>; at: number } => Boolean(r.loc));

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <JavaSectionNav active="progress" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'Java', href: JAVA_HOME }, { label: 'Progress' }]} />

        <header className="grid md:grid-cols-[minmax(0,1fr)_16rem] gap-6 items-end mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Learning progress</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Your Java progress</h1>
            <p className="text-slate-400 max-w-2xl">
              Every figure on this page comes from what you have actually done in this browser: lessons marked complete, lessons opened,
              knowledge-check answers, exercise status, and what you saved or flagged in your notebook.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5">
            <p className="text-sm text-slate-400">Overall completion</p>
            <p className="text-5xl font-semibold text-white mt-1">{overall}%</p>
            <ProgressBar value={done.length} max={lessons.length} label="Lessons completed overall" className="mt-3" />
            <p className="mt-2 text-xs text-slate-500">
              {done.length} of {lessons.length} lessons · about {Math.round(remainingMinutes / 60)} h left
            </p>
          </div>
        </header>

        <section aria-labelledby="kpi-heading" className="mb-12">
          <h2 id="kpi-heading" className="sr-only">
            Summary
          </h2>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <li>
              <StatTile
                label="Modules completed"
                value={`${modulesDone} / ${modules.length}`}
                detail={plannedLessons > 0 ? `Modules with lessons so far; ${plannedLessons} lessons coming soon` : `${track.stages.length} stages`}
              />
            </li>
            <li>
              <StatTile label="Lessons completed" value={`${done.length} / ${lessons.length}`} detail={`${quizzesPassed} knowledge checks passed`} />
            </li>
            <li>
              <StatTile label="Lessons in progress" value={inProgress.length} detail="Opened but not marked complete" />
            </li>
            <li>
              <StatTile
                label="Exercises completed"
                value={`${exercisesDone} / ${writtenExercises}`}
                detail={writtenExercises < track.problems.length ? `${exercisesStarted} in progress · ${track.problems.length - writtenExercises} coming soon` : `${exercisesStarted} in progress`}
                href={problemsHref(track)}
              />
            </li>
            <li>
              <StatTile
                label="Quiz accuracy"
                value={accuracy === null ? '—' : `${accuracy}%`}
                detail={answers.length > 0 ? `${firstTry} of ${answers.length} right on the first try` : 'Answer a knowledge check to start'}
              />
            </li>
            <li>
              <StatTile
                label="Interview questions practised"
                value={practised}
                detail={`${ratings.gotIt} got it · ${ratings.partial} partly · ${ratings.missed} missed`}
                href={`${JAVA_HOME}/interview`}
              />
            </li>
            <li>
              <StatTile
                label="Bookmarked"
                value={savedConcepts + savedQuestions}
                detail={`${savedConcepts} concepts · ${savedQuestions} questions`}
                href={`${JAVA_HOME}/notebook`}
              />
            </li>
            <li>
              <StatTile
                label="Topics to revise"
                value={due.length}
                detail={revision.length > due.length ? `${revision.length - due.length} already reviewed` : 'Difficult lessons, flagged questions, quiz mistakes'}
                href={`${JAVA_HOME}/notebook`}
              />
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
          <section aria-labelledby="modules-heading" className="min-w-0">
            <h2 id="modules-heading" className="text-xl font-bold text-white mb-1">
              Progress by stage and module
            </h2>
            <p className="text-sm text-slate-400 mb-5">A module counts as complete when every lesson in it is marked complete.</p>
            <StageProgressList track={track} progress={progress} />
          </section>

          <aside className="space-y-6 min-w-0">
            <section aria-labelledby="in-progress-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="in-progress-heading" className="font-bold text-white mb-3">
                Lessons in progress
              </h2>
              {inProgress.length === 0 ? (
                <p className="text-sm text-slate-400">None — lessons you open but haven’t marked complete appear here.</p>
              ) : (
                <ul className="space-y-2.5">
                  {inProgress.slice(0, 8).map(({ lesson, stage }) => (
                    <li key={lesson.slug}>
                      <a href={lessonHref(track, lesson.slug)} className="block text-sm text-slate-200 hover:text-sky-300">
                        {lesson.title}
                      </a>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <ClockIcon className="h-3 w-3" /> Stage {stage.number} · opened {formatDate(progress.visited[`${track.id}:${lesson.slug}`])}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="revise-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="revise-heading" className="font-bold text-white mb-3">
                Topics requiring revision
              </h2>
              {due.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing due. Mark lessons as difficult, flag interview questions, or miss a quiz question and it lands here.</p>
              ) : (
                <ul className="space-y-2.5">
                  {due.slice(0, 6).map((item) => (
                    <li key={item.key} className="text-sm">
                      <span className="block text-slate-200 line-clamp-2">{item.title}</span>
                      <span className="text-xs text-slate-500">{item.context}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a href={`${JAVA_HOME}/notebook`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                Open revision list <ArrowIcon className="h-3.5 w-3.5" />
              </a>
            </section>

            <section aria-labelledby="recent-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="recent-heading" className="font-bold text-white mb-3">
                Recently completed
              </h2>
              {recent.length === 0 ? (
                <p className="text-sm text-slate-400">No lessons completed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map(({ loc, at }) => (
                    <li key={loc.lesson.slug} className="flex items-start justify-between gap-3 text-sm">
                      <a href={lessonHref(track, loc.lesson.slug)} className="text-slate-200 hover:text-sky-300">
                        {loc.lesson.title}
                      </a>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
