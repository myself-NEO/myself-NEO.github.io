import React from 'react';
import { Level, ProblemStatus, Track } from '../../content/shared/types';
import { availableLessons, findProblem, flattenLessons } from '../../content/shared/curriculum';
import { isLessonComplete, isLessonVisited, isQuizPassed, problemStatus, trackAnswers, useProgress } from '../learn/progress';
import { useNotebook } from '../learn/notebook';
import { useInterviews } from '../learn/interviews';
import { lessonHref, problemHref, problemsHref } from '../learn/routes';
import StageProgressList from '../learn/StageProgressList';
import { ArrowIcon, Breadcrumbs, ClockIcon, LEVEL_LABEL, ProgressBar, StatTile, STATUS_LABEL, StatusIcon } from '../learn/ui';
import { ROOT_HREF } from './routes';
import TrackSectionNav, { interviewHref, interviewsHref, notebookHref } from './sections';
import { revisionItems } from './revision';
import { trackConfig } from './trackConfig';
import { formatClock } from './interview/parts';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const STATUSES: ProblemStatus[] = ['not-started', 'in-progress', 'attempted', 'completed'];
const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** #system-design/<track>/progress — every figure comes from what the learner has done in this browser. */
const TrackProgress: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const notebook = useNotebook();
  const interviews = useInterviews();
  const config = trackConfig(track);
  const short = track.shortTitle;

  const ordered = flattenLessons(track).filter((l) => !l.lesson.comingSoon);
  const lessons = ordered.map((l) => l.lesson);
  const unwritten = flattenLessons(track).length - lessons.length;
  const done = lessons.filter((l) => isLessonComplete(progress, track.id, l.slug));
  const inProgress = ordered.filter((l) => isLessonVisited(progress, track.id, l.lesson.slug) && !isLessonComplete(progress, track.id, l.lesson.slug));
  const modules = track.stages.flatMap((s) => s.modules.map((m) => availableLessons(m.lessons))).filter((m) => m.length > 0);
  const modulesDone = modules.filter((m) => m.every((l) => isLessonComplete(progress, track.id, l.slug))).length;
  const answers = trackAnswers(progress, track.id);
  const quizzesAttempted = new Set(answers.map((a) => a.lesson)).size;
  const quizzesPassed = lessons.filter((l) => isQuizPassed(progress, track.id, l.slug)).length;
  const firstTry = answers.filter((a) => a.firstCorrect).length;
  const accuracy = answers.length > 0 ? Math.round((firstTry / answers.length) * 100) : null;
  const statusCount = (s: ProblemStatus) => track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === s).length;
  const attemptsByProblem = Object.entries(interviews.history).filter(([k, v]) => k.startsWith(`${track.id}:`) && v.length > 0);
  const allAttempts = attemptsByProblem.flatMap(([k, v]) => v.map((a) => ({ slug: k.slice(track.id.length + 1), attempt: a }))).sort((a, b) => b.attempt.completedAt - a.attempt.completedAt);
  const latestScores = attemptsByProblem.map(([, v]) => v[v.length - 1].score);
  const avgScore = latestScores.length > 0 ? Math.round(latestScores.reduce((s, x) => s + x, 0) / latestScores.length) : null;
  const inFlight = Object.keys(interviews.sessions).filter((k) => k.startsWith(`${track.id}:`)).length;
  const saved = Object.values(notebook.saved).filter((s) => s.track === track.id);
  const snippets = Object.values(notebook.snippets).filter((s) => s.track === track.id);
  const diagrams = snippets.filter((s) => s.language === 'mermaid').length;
  const code = snippets.length - diagrams;
  const notes = Object.values(notebook.notes).filter((n) => n.track === track.id).length;
  const revision = revisionItems(track, notebook, progress, interviews);
  const due = revision.filter((i) => i.due);
  const remainingMinutes = lessons.filter((l) => !isLessonComplete(progress, track.id, l.slug)).reduce((sum, l) => sum + l.minutes, 0);
  const overall = lessons.length === 0 ? 0 : Math.round((done.length / lessons.length) * 100);
  const weakest = config.rubric.map((r) => ({
    r,
    missed: attemptsByProblem.filter(([, v]) => v[v.length - 1].ratings[r.id] === 'missed').length,
    partial: attemptsByProblem.filter(([, v]) => v[v.length - 1].ratings[r.id] === 'partial').length,
  })).filter((w) => w.missed + w.partial > 0);

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <TrackSectionNav track={track} active="progress" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Progress' }]} />
        <header className="grid md:grid-cols-[minmax(0,1fr)_16rem] gap-6 items-end mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Learning progress</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Your {short} progress</h1>
            <p className="text-slate-400 max-w-2xl">
              Computed from what you have done in this browser: lessons completed and opened, {config.answers} answers, problem statuses, mock
              interviews and what you saved or flagged. {short} is tracked separately from {config.other}.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5">
            <p className="text-sm text-slate-400">Overall completion</p>
            <p className="text-5xl font-semibold text-white mt-1">{overall}%</p>
            <ProgressBar value={done.length} max={lessons.length} label={`${short} lessons completed overall`} className="mt-3" />
            <p className="mt-2 text-xs text-slate-400">
              {done.length} of {lessons.length} {unwritten > 0 ? 'available ' : ''}lessons · about {Math.round(remainingMinutes / 60)} h left
            </p>
          </div>
        </header>

        <section aria-labelledby="kpi-heading" className="mb-12">
          <h2 id="kpi-heading" className="sr-only">
            Summary
          </h2>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <li>
              <StatTile label="Modules completed" value={`${modulesDone} / ${modules.length}`} detail={unwritten > 0 ? `${unwritten} lessons still being written` : `across ${track.stages.length} stages`} />
            </li>
            <li>
              <StatTile label="Lessons completed" value={`${done.length} / ${lessons.length}`} detail={`${inProgress.length} opened but not complete`} />
            </li>
            <li>
              <StatTile label="Quizzes attempted" value={quizzesAttempted} detail={`${quizzesPassed} knowledge checks passed`} />
            </li>
            <li>
              <StatTile label="Quiz accuracy" value={accuracy === null ? '—' : `${accuracy}%`} detail={answers.length > 0 ? `${firstTry} of ${answers.length} right on the first try` : 'Answer a knowledge check to start'} />
            </li>
            <li>
              <StatTile label="Problems completed" value={`${statusCount('completed')} / ${track.problems.length}`} detail={`${statusCount('attempted')} attempted · ${statusCount('in-progress')} in progress`} href={problemsHref(track)} />
            </li>
            <li>
              <StatTile
                label="Mock interviews"
                value={attemptsByProblem.length}
                detail={allAttempts.length > 0 ? `${allAttempts.length} attempts · avg latest score ${avgScore}%${inFlight ? ` · ${inFlight} unfinished` : ''}` : inFlight ? `${inFlight} unfinished` : 'None finished yet'}
                href={interviewsHref(track)}
              />
            </li>
            <li>
              <StatTile
                label="Bookmarked"
                value={saved.length + snippets.length}
                detail={[
                  `${saved.filter((s) => s.kind !== 'question').length} concepts`,
                  `${saved.filter((s) => s.kind === 'question').length} questions`,
                  ...(config.diagrams ? [`${diagrams} diagrams`] : []),
                  `${code} code snippets`,
                  `${notes} notes`,
                ].join(' · ')}
                href={notebookHref(track)}
              />
            </li>
            <li>
              <StatTile label="Topics to revise" value={due.length} detail={revision.length > due.length ? `${revision.length - due.length} already reviewed` : 'Difficult lessons, mistakes, revisits, mock gaps'} href={notebookHref(track)} />
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
          <div className="min-w-0 space-y-10">
            <section aria-labelledby="modules-heading">
              <h2 id="modules-heading" className="text-xl font-bold text-white mb-1">
                Progress by stage and module
              </h2>
              <p className="text-sm text-slate-400 mb-5">A module counts as complete when every available lesson in it is marked complete.</p>
              <StageProgressList track={track} progress={progress} />
            </section>

            <section aria-labelledby="problems-progress-heading">
              <h2 id="problems-progress-heading" className="text-xl font-bold text-white mb-4">
                Problems by difficulty
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-700/80" tabIndex={0}>
                <table className="w-full text-sm min-w-[30rem]">
                  <thead className="bg-slate-900/80">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 text-left font-semibold text-slate-300">Difficulty</th>
                      {STATUSES.map((s) => (
                        <th key={s} scope="col" className="px-3 py-2.5 text-left font-semibold text-slate-300">
                          <span className="inline-flex items-center gap-1.5">
                            <StatusIcon status={s} className="h-3.5 w-3.5" /> {STATUS_LABEL[s]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LEVELS.map((level) => {
                      const ps = track.problems.filter((p) => p.difficulty === level);
                      return (
                        <tr key={level} className="border-t border-slate-800">
                          <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-300">
                            {LEVEL_LABEL[level]} <span className="text-slate-400 font-normal">({ps.length})</span>
                          </th>
                          {STATUSES.map((s) => (
                            <td key={s} className="px-3 py-2.5 text-slate-300">
                              {ps.filter((p) => problemStatus(progress, track.id, p.slug) === s).length}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside aria-label="Activity" className="space-y-6 min-w-0">
            <section aria-labelledby="mocks-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="mocks-heading" className="font-bold text-white mb-3">
                Recent mock interviews
              </h2>
              {allAttempts.length === 0 ? (
                <p className="text-sm text-slate-400">None yet. Finished mock interviews appear here with your self-score.</p>
              ) : (
                <ul className="space-y-2.5">
                  {allAttempts.slice(0, 6).map(({ slug, attempt }) => (
                    <li key={`${slug}-${attempt.completedAt}`} className="text-sm">
                      <a href={interviewHref(track, slug)} className="block text-slate-200 hover:text-sky-300">
                        {findProblem(track, slug)?.title ?? slug}
                      </a>
                      <span className="text-xs text-slate-400">
                        {attempt.score}% · {formatClock(attempt.elapsedMs)} of {attempt.minutes} min · {formatDate(attempt.completedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {weakest.length > 0 && (
              <section aria-labelledby="weak-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <h2 id="weak-heading" className="font-bold text-white mb-3">
                  Rubric areas to work on
                </h2>
                <ul className="space-y-2 text-sm">
                  {weakest
                    .sort((a, b) => b.missed - a.missed || b.partial - a.partial)
                    .map(({ r, missed, partial }) => (
                      <li key={r.id} className="flex justify-between gap-3">
                        <span className="text-slate-200">{r.label}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {missed} missed · {partial} partly
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">From the latest attempt of each problem.</p>
              </section>
            )}

            <section aria-labelledby="revise-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="revise-heading" className="font-bold text-white mb-3">
                Topics requiring revision
              </h2>
              {due.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing due. Flag lessons or problems, miss a quiz question or a rubric area, and it lands here.</p>
              ) : (
                <ul className="space-y-2.5">
                  {due.slice(0, 6).map((item) => (
                    <li key={item.key} className="text-sm">
                      {item.href ? (
                        <a href={item.href} className="block text-slate-200 hover:text-sky-300 line-clamp-2">
                          {item.title}
                        </a>
                      ) : (
                        <span className="block text-slate-200 line-clamp-2">{item.title}</span>
                      )}
                      <span className="text-xs text-slate-400">{item.context}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a href={notebookHref(track)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                Open revision list <ArrowIcon className="h-3.5 w-3.5" />
              </a>
            </section>

            <section aria-labelledby="in-progress-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="in-progress-heading" className="font-bold text-white mb-3">
                Lessons in progress
              </h2>
              {inProgress.length === 0 ? (
                <p className="text-sm text-slate-400">None — lessons you open but haven’t marked complete appear here.</p>
              ) : (
                <ul className="space-y-2.5">
                  {inProgress.slice(0, 6).map(({ lesson, stage }) => (
                    <li key={lesson.slug}>
                      <a href={lessonHref(track, lesson.slug)} className="block text-sm text-slate-200 hover:text-sky-300">
                        {lesson.title}
                      </a>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <ClockIcon className="h-3 w-3" /> Stage {stage.number}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {allAttempts.length === 0 && statusCount('not-started') === track.problems.length && (
              <a href={problemHref(track, track.problems[0].slug)} className="block rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 text-sm text-slate-300 hover:border-sky-500/60">
                Start practising with <span className="font-semibold text-white">{track.problems[0].title}</span> →
              </a>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
};

export default TrackProgress;
