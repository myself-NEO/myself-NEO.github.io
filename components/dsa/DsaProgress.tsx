import React from 'react';
import { Track } from '../../content/shared/types';
import { availableLessons, flattenLessons, stageLessons } from '../../content/shared/curriculum';
import { LEETCODE_DIFFICULTIES, LEETCODE_PROBLEMS, leetCodeUrl, PRACTICE_TOPICS } from '../../content/learning/problems';
import { useNotebook } from '../learn/notebook';
import { isLessonComplete, useProgress } from '../learn/progress';
import { lessonHref } from '../learn/routes';
import { ArrowIcon, Breadcrumbs, CheckCircleIcon, ExternalLinkIcon, HalfCircleIcon, ProgressBar, StatTile, StatusBadge } from '../learn/ui';
import DsaSectionNav, { DSA_HOME, DSA_NOTES, dsaProblemsHref } from './DsaSectionNav';
import { DSA, DifficultyBadge, formatDate, isRevisit, PRACTICE_STATUS_LABEL, statusChangedAt, statusOf } from './practice';

const percent = (value: number, max: number) => (max === 0 ? 0 : Math.round((value / max) * 100));

/** #dsa/progress — computed entirely from what the learner recorded in this browser. */
const DsaProgress: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const notebook = useNotebook();

  const problems = LEETCODE_PROBLEMS.map((p) => ({ problem: p, status: statusOf(progress, p) }));
  const solved = problems.filter((p) => p.status === 'completed');
  const attempted = problems.filter((p) => p.status === 'in-progress');
  const revisit = LEETCODE_PROBLEMS.filter((p) => isRevisit(notebook, p));
  const notes = Object.values(notebook.notes).filter((n) => n.track === DSA);
  const byDifficulty = LEETCODE_DIFFICULTIES.map((d) => ({
    difficulty: d,
    total: problems.filter((p) => p.problem.difficulty === d).length,
    done: solved.filter((p) => p.problem.difficulty === d).length,
  }));
  const topics = PRACTICE_TOPICS.map((t) => {
    const items = problems.filter((p) => p.problem.topic === t.id);
    return {
      topic: t,
      total: items.length,
      done: items.filter((p) => p.status === 'completed').length,
      next: items.find((p) => p.status !== 'completed')?.problem,
    };
  });
  const topicsDone = topics.filter((t) => t.total > 0 && t.done === t.total).length;

  const guides = availableLessons(flattenLessons(track).map((l) => l.lesson));
  const guidesDone = guides.filter((l) => isLessonComplete(progress, track.id, l.slug));
  const readingLeft = guides.filter((l) => !isLessonComplete(progress, track.id, l.slug)).reduce((sum, l) => sum + l.minutes, 0);

  const recentlySolved = solved
    .map((p) => ({ ...p, at: statusChangedAt(progress, p.problem) ?? 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
  const recentNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <DsaSectionNav active="progress" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'DSA', href: DSA_HOME }, { label: 'Progress' }]} />

        <header className="grid md:grid-cols-[minmax(0,1fr)_16rem] gap-6 items-end mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Learning progress</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Your DSA progress</h1>
            <p className="text-slate-400 max-w-2xl">
              Every figure here comes from what you recorded in this browser: guides marked complete, the status you set on each coding question,
              the questions you flagged to revisit, and your notes.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5" data-stat="headline">
            <p className="text-sm text-slate-400">Coding questions solved</p>
            <p className="text-5xl font-semibold text-white mt-1">{percent(solved.length, problems.length)}%</p>
            <ProgressBar value={solved.length} max={problems.length} label="Coding questions solved overall" className="mt-3" />
            <p className="mt-2 text-xs text-slate-500">
              {solved.length} of {problems.length} questions · {guidesDone.length} of {guides.length} guides read
            </p>
          </div>
        </header>

        <section aria-labelledby="kpi-heading" className="mb-12">
          <h2 id="kpi-heading" className="sr-only">
            Summary
          </h2>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <li data-stat="solved">
              <StatTile label="Questions solved" value={`${solved.length} / ${problems.length}`} detail={`${attempted.length} attempted, not solved yet`} href={dsaProblemsHref()} />
            </li>
            {byDifficulty.map((d) => (
              <li key={d.difficulty} data-stat={d.difficulty.toLowerCase()}>
                <StatTile label={`${d.difficulty} solved`} value={`${d.done} / ${d.total}`} detail={`${percent(d.done, d.total)}% of the ${d.difficulty.toLowerCase()} questions`} />
              </li>
            ))}
            <li data-stat="guides">
              <StatTile
                label="Guides completed"
                value={`${guidesDone.length} / ${guides.length}`}
                detail={readingLeft > 0 ? `About ${Math.round(readingLeft / 60)} h of reading left` : 'Every guide is complete'}
                href={DSA_HOME}
              />
            </li>
            <li data-stat="topics">
              <StatTile label="Topics completed" value={`${topicsDone} / ${topics.length}`} detail="Every question in the topic solved" />
            </li>
            <li data-stat="revisit">
              <StatTile label="Marked to revisit" value={revisit.length} detail="Questions you flagged to try again" href={dsaProblemsHref()} />
            </li>
            <li data-stat="notes">
              <StatTile label="Notes written" value={notes.length} detail={`${notes.filter((n) => n.problem).length} on coding questions`} href={DSA_NOTES} />
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8">
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="topics-heading">
              <h2 id="topics-heading" className="text-xl font-bold text-white mb-1">
                Coding questions by topic
              </h2>
              <p className="text-sm text-slate-400 mb-5">Each topic is a ladder from easy to hard; “next” is the first question you haven’t solved.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                {topics.map(({ topic, total, done, next }) => {
                  const complete = total > 0 && done === total;
                  return (
                    <li key={topic.id} className="min-w-0" data-topic={topic.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <a href={dsaProblemsHref(topic.id)} className="flex items-center gap-1.5 min-w-0 text-slate-200 hover:text-sky-300">
                          {complete ? (
                            <CheckCircleIcon filled className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          ) : done > 0 ? (
                            <HalfCircleIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4 text-slate-600 flex-shrink-0" />
                          )}
                          <span className="truncate">{topic.title}</span>
                          <span className="sr-only">{complete ? '(complete)' : done > 0 ? '(in progress)' : '(not started)'}</span>
                        </a>
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {done}/{total}
                        </span>
                      </div>
                      <ProgressBar value={done} max={total} label={`${topic.title} questions solved`} className="mt-1.5" />
                      {next && (
                        <a
                          href={leetCodeUrl(next)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 min-w-0"
                        >
                          <span className="truncate">
                            Next: {next.id}. {next.title}
                          </span>
                          <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
                          <span className="sr-only">(opens LeetCode in a new tab)</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="guides-heading">
              <h2 id="guides-heading" className="text-xl font-bold text-white mb-1">
                Guides by stage
              </h2>
              <p className="text-sm text-slate-400 mb-5">A guide counts once you mark it complete at the end of its page.</p>
              <ol className="space-y-3">
                {track.stages.map((stage) => {
                  const all = availableLessons(stageLessons(stage));
                  const done = all.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
                  const next = all.find((l) => !isLessonComplete(progress, track.id, l.slug));
                  return (
                    <li key={stage.id} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-white">
                          <span className="text-slate-500 mr-1.5">Stage {stage.number}</span>
                          {stage.title}
                        </h3>
                        <span className="text-sm text-slate-400">
                          {done}/{all.length} guides
                        </span>
                      </div>
                      <ProgressBar value={done} max={all.length} label={`Stage ${stage.number} guides completed`} />
                      {next && (
                        <a href={lessonHref(track, next.slug)} className="mt-1.5 block text-xs text-sky-400 hover:text-sky-300 truncate">
                          Next: {next.title}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <aside className="space-y-6 min-w-0">
            <section aria-labelledby="difficulty-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="difficulty-heading" className="font-bold text-white mb-3">
                Solved by difficulty
              </h2>
              <ul className="space-y-3">
                {byDifficulty.map((d) => (
                  <li key={d.difficulty}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <DifficultyBadge difficulty={d.difficulty} />
                      <span className="text-xs text-slate-400">
                        {d.done}/{d.total}
                      </span>
                    </div>
                    <ProgressBar value={d.done} max={d.total} label={`${d.difficulty} questions solved`} />
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="revisit-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="revisit-heading" className="font-bold text-white mb-3">
                Marked to revisit
              </h2>
              {revisit.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing flagged. Use “Revisit” on a coding question you want to try again later.</p>
              ) : (
                <ul className="space-y-2.5">
                  {revisit.slice(0, 8).map((p) => (
                    <li key={p.id} className="text-sm">
                      <a href={leetCodeUrl(p)} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-sky-300">
                        {p.id}. {p.title}
                        <span className="sr-only"> (opens LeetCode in a new tab)</span>
                      </a>
                      <span className="mt-1 flex items-center gap-1.5">
                        <DifficultyBadge difficulty={p.difficulty} />
                        <StatusBadge status={statusOf(progress, p)} label={PRACTICE_STATUS_LABEL[statusOf(progress, p)]} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {revisit.length > 8 && <p className="mt-3 text-xs text-slate-500">and {revisit.length - 8} more</p>}
            </section>

            <section aria-labelledby="recent-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="recent-heading" className="font-bold text-white mb-3">
                Recently solved
              </h2>
              {recentlySolved.length === 0 ? (
                <p className="text-sm text-slate-400">No questions marked solved yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentlySolved.map(({ problem, at }) => (
                    <li key={problem.id} className="flex items-start justify-between gap-3 text-sm">
                      <a href={leetCodeUrl(problem)} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-sky-300 min-w-0">
                        {problem.id}. {problem.title}
                        <span className="sr-only"> (opens LeetCode in a new tab)</span>
                      </a>
                      {at > 0 && <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(at)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="notes-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <h2 id="notes-heading" className="font-bold text-white mb-3">
                Recent notes
              </h2>
              {recentNotes.length === 0 ? (
                <p className="text-sm text-slate-400">No notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentNotes.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-200 min-w-0 line-clamp-2">{n.title}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(n.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a href={DSA_NOTES} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                Open interview notes <ArrowIcon className="h-3.5 w-3.5" />
              </a>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default DsaProgress;
