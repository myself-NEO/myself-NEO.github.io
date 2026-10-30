import React, { useState } from 'react';
import { Track } from '../../content/shared/types';
import { availableLessons, flattenLessons, stageLessons } from '../../content/shared/curriculum';
import { isLessonComplete, isQuizPassed, problemStatus, useProgress } from './progress';
import { lessonHref } from './routes';
import { searchTrack } from './search';
import { ArrowIcon, CheckCircleIcon, ChevronIcon, Chip, ClockIcon, LevelBadge, ProgressBar, SearchIcon } from './ui';

// Building blocks shared by the landing pages of every learning section.

/** Progress figures for a track's landing page (coming-soon lessons are excluded from totals). */
export const useTrackProgress = (track: Track) => {
  const progress = useProgress();
  const lessons = availableLessons(flattenLessons(track).map((l) => l.lesson));
  const lessonsDone = lessons.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
  const quizzesPassed = lessons.filter((l) => isQuizPassed(progress, track.id, l.slug)).length;
  const problemsDone = track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'completed').length;
  const problemsStarted = track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'in-progress').length;
  const nextLesson = lessons.find((l) => !isLessonComplete(progress, track.id, l.slug));
  return {
    lessons,
    lessonsDone,
    quizzesPassed,
    problemsDone,
    problemsStarted,
    nextLesson,
    hasProgress: lessonsDone + quizzesPassed + problemsDone + problemsStarted > 0,
  };
};

export const ProgressStat: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="text-sm text-slate-400">
        <span className="font-bold text-white">{value}</span> / {max}
      </span>
    </div>
    <ProgressBar value={value} max={max} label={label} />
  </div>
);

export const SearchPanel: React.FC<{ track: Track; placeholder: string }> = ({ track, placeholder }) => {
  const [query, setQuery] = useState('');
  const results = searchTrack(track, query, 10);
  const searching = query.trim().length > 0;
  const resultsId = `${track.id}-search-results`;
  const what = track.problems.length > 0 ? 'lessons or problems' : 'topics';

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Search {what}</span>
        <SearchIcon className="h-5 w-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
          placeholder={placeholder}
          aria-controls={resultsId}
          className="w-full rounded-xl bg-slate-900/80 border border-slate-700 pl-12 pr-4 py-3.5 text-sm sm:text-base text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </label>
      {searching && (
        <div id={resultsId} className="mt-2 rounded-xl border border-slate-700 bg-slate-900 overflow-hidden" role="region" aria-live="polite" aria-label="Search results">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">
              No {what} match “{query}”.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.type}-${r.slug}`}>
                  <a href={r.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/70 focus:bg-slate-800/70 focus:outline-none">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-100 truncate">{r.title}</span>
                      <span className="block text-xs text-slate-500 truncate">{r.subtitle}</span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <Chip>{r.type === 'lesson' ? 'Lesson' : 'Problem'}</Chip>
                      <LevelBadge level={r.level} className="hidden sm:inline-flex" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/** The numbered stage list with per-stage progress and expandable lesson lists. `after` renders extra stages (e.g. a practice library). */
export const StageRoadmap: React.FC<{ track: Track; after?: React.ReactNode }> = ({ track, after }) => {
  const progress = useProgress();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleStage = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ol className="relative space-y-4 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
      {track.stages.map((stage) => {
        const listed = stageLessons(stage);
        const all = availableLessons(listed);
        const done = all.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
        const complete = all.length > 0 && done === all.length;
        const isOpen = expanded.has(stage.id);
        const first = all.find((l) => !isLessonComplete(progress, track.id, l.slug)) ?? all[0] ?? listed[0];
        const minutes = all.reduce((sum, l) => sum + l.minutes, 0);
        const planned = all.length === 0;
        return (
          <li key={stage.id} className="relative pl-14">
            <span
              className={`absolute left-0 top-4 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                complete
                  ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                  : planned
                  ? 'bg-slate-900 border-slate-700 text-slate-500'
                  : 'bg-slate-900 border-sky-500/60 text-sky-300'
              }`}
              aria-hidden="true"
            >
              {complete ? '✓' : stage.number}
            </span>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Stage {stage.number} · {stage.levelLabel}
                  </p>
                  <h3 className="text-lg font-bold text-white">{stage.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{stage.description}</p>
                </div>
                {planned ? (
                  <span className="flex-shrink-0 self-start px-3 py-1.5 rounded-lg border border-dashed border-slate-600 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Coming soon
                  </span>
                ) : (
                  <a
                    href={lessonHref(track, first.slug)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 self-start px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors"
                  >
                    {done === 0 ? 'Start' : complete ? 'Review' : 'Continue'}
                    <ArrowIcon className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {planned ? (
                  <span className="text-xs text-slate-500">
                    {listed.length} lesson{listed.length === 1 ? '' : 's'} planned · ~{Math.round(listed.reduce((sum, l) => sum + l.minutes, 0) / 6) / 10} h
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-2 w-full sm:w-64">
                      <ProgressBar value={done} max={all.length} label={`Stage ${stage.number} lessons completed`} />
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {done}/{all.length}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <ClockIcon /> ~{Math.round(minutes / 6) / 10} h
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => toggleStage(stage.id)}
                  aria-expanded={isOpen}
                  aria-controls={`roadmap-${stage.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
                >
                  {isOpen ? 'Hide lessons' : `Show ${listed.length} lesson${listed.length === 1 ? '' : 's'}`}
                  <ChevronIcon direction={isOpen ? 'down' : 'right'} className="h-3.5 w-3.5" />
                </button>
              </div>
              {isOpen && (
                <div id={`roadmap-${stage.id}`} className="mt-4 grid md:grid-cols-2 gap-x-6 gap-y-4">
                  {stage.modules.map((module) => {
                    const moduleLessons = availableLessons(module.lessons);
                    const moduleDone = moduleLessons.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
                    return (
                    <div key={module.id}>
                      <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        <span>{module.title}</span>
                        <span className={`normal-case tracking-normal font-medium ${moduleLessons.length > 0 && moduleDone === moduleLessons.length ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {moduleLessons.length === 0 ? 'soon' : `${moduleDone}/${moduleLessons.length}`}
                        </span>
                      </p>
                      <ul className="space-y-1">
                        {module.lessons.map((l) => {
                          const isDone = isLessonComplete(progress, track.id, l.slug);
                          return (
                            <li key={l.slug}>
                              <a href={lessonHref(track, l.slug)} className="flex items-start gap-2 text-sm text-slate-300 hover:text-sky-300">
                                <CheckCircleIcon filled={isDone} className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isDone ? 'text-emerald-400' : 'text-slate-600'}`} />
                                <span>
                                  {l.title}
                                  {!l.essential && <span className="ml-1.5 text-[10px] text-indigo-300/80">deep dive</span>}
                                  {l.comingSoon && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-500">soon</span>}
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
      {after}
    </ol>
  );
};
