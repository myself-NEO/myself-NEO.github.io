import React from 'react';
import { Track } from '../../content/shared/types';
import { availableLessons, stageLessons } from '../../content/shared/curriculum';
import { isLessonComplete, ProgressState } from './progress';
import { lessonHref } from './routes';
import { CheckCircleIcon, HalfCircleIcon, ProgressBar } from './ui';

/** Dashboard list of stages with per-module progress and the next lesson in each module. */
const StageProgressList: React.FC<{ track: Track; progress: ProgressState }> = ({ track, progress }) => (
  <ol className="space-y-4">
    {track.stages.map((stage) => {
      const all = availableLessons(stageLessons(stage));
      const stageDone = all.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
      if (all.length === 0) {
        return (
          <li key={stage.id} className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-slate-300">
              <span className="text-slate-500 font-semibold mr-1.5">Stage {stage.number}</span>
              {stage.title}
            </h3>
            <span className="text-sm text-slate-500">Coming soon · {stageLessons(stage).length} lessons planned</span>
          </li>
        );
      }
      return (
        <li key={stage.id} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h3 className="font-bold text-white">
              <span className="text-slate-500 font-semibold mr-1.5">Stage {stage.number}</span>
              {stage.title}
            </h3>
            <span className="text-sm text-slate-400">
              {stageDone}/{all.length} lessons
            </span>
          </div>
          <ProgressBar value={stageDone} max={all.length} label={`Stage ${stage.number} lessons completed`} />
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {stage.modules.map((m) => {
              const ml = availableLessons(m.lessons);
              const md = ml.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
              const next = ml.find((l) => !isLessonComplete(progress, track.id, l.slug));
              const complete = ml.length > 0 && md === ml.length;
              return (
                <li key={m.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 text-slate-300 min-w-0">
                      {complete ? (
                        <CheckCircleIcon filled className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      ) : md > 0 ? (
                        <HalfCircleIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-slate-600 flex-shrink-0" />
                      )}
                      <span className="truncate">{m.title}</span>
                      <span className="sr-only">{complete ? '(complete)' : md > 0 ? '(in progress)' : '(not started)'}</span>
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {md}/{ml.length}
                    </span>
                  </div>
                  <ProgressBar value={md} max={ml.length} label={`${m.title} lessons completed`} className="mt-1.5" />
                  {next && (
                    <a href={lessonHref(track, next.slug)} className="mt-1 block text-xs text-sky-400 hover:text-sky-300 truncate">
                      Next: {next.title}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      );
    })}
  </ol>
);

export default StageProgressList;
