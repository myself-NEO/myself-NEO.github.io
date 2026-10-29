import React, { useEffect, useMemo, useState } from 'react';
import { Level, Track } from '../../content/system-design/types';
import { stageLessons } from '../../content/system-design';
import { hasProblemBody } from '../../content/system-design/loaders';
import { isLessonComplete, problemStatus, useProgress } from './progress';
import { lessonHref, problemHref, problemsHref, ROOT_HREF } from './routes';
import { matchesFilter } from './search';
import { ArrowIcon, CheckCircleIcon, ChevronIcon, LEVEL_LABEL, ProgressBar, SearchIcon, StatusIcon } from './ui';

export interface SidebarCurrent {
  type: 'lesson' | 'problem';
  slug: string;
}

interface SidebarProps {
  track: Track;
  current?: SidebarCurrent;
}

const PROBLEMS_GROUP = 'problems';
const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

const Sidebar: React.FC<SidebarProps> = ({ track, current }) => {
  const progress = useProgress();
  const [filter, setFilter] = useState('');

  const currentGroup = useMemo(() => {
    if (current?.type === 'problem') return PROBLEMS_GROUP;
    return track.stages.find((s) => stageLessons(s).some((l) => l.slug === current?.slug))?.id ?? track.stages[0]?.id;
  }, [track, current]);

  const [open, setOpen] = useState<Set<string>>(() => new Set(currentGroup ? [currentGroup] : []));

  useEffect(() => {
    if (currentGroup) setOpen((prev) => (prev.has(currentGroup) ? prev : new Set(prev).add(currentGroup)));
  }, [currentGroup]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allLessons = track.stages.flatMap(stageLessons);
  const completed = allLessons.filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
  const filtering = filter.trim().length > 0;

  const visibleProblems = track.problems.filter(
    (p) => !filtering || matchesFilter(filter, p.title, p.summary, ...p.patterns, ...p.tags),
  );
  const stageViews = track.stages.map((stage) => ({
    stage,
    lessons: stage.modules.flatMap((m) =>
      m.lessons
        .filter((l) => !filtering || matchesFilter(filter, l.title, l.summary, m.title, ...(l.tags ?? [])))
        .map((l) => ({ lesson: l, module: m.title })),
    ),
  }));
  const visibleCount = visibleProblems.length + stageViews.reduce((n, v) => n + v.lessons.length, 0);

  const itemClass = (active: boolean) =>
    `flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
      active ? 'bg-sky-500/10 text-sky-300 font-medium' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
    }`;

  return (
    <nav aria-label={`${track.title} curriculum`} className="flex flex-col gap-4 p-4">
      <a href={ROOT_HREF} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-sky-400 transition-colors">
        <ArrowIcon direction="left" className="h-3.5 w-3.5" />
        System Design home
      </a>

      <div>
        <p className="text-sm font-bold text-white">
          {track.title} <span className="text-slate-500 font-medium">· Java</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={completed} max={allLessons.length} label="Lessons completed" />
          <span className="text-[11px] text-slate-400 whitespace-nowrap">
            {completed}/{allLessons.length}
          </span>
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">Filter lessons and problems</span>
        <SearchIcon className="h-4 w-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter lessons & problems"
          className="w-full rounded-lg bg-slate-950/60 border border-slate-700 pl-8 pr-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </label>

      <div className="flex flex-col gap-1">
        {stageViews.map(({ stage, lessons }) => {
          if (filtering && lessons.length === 0) return null;
          const done = stageLessons(stage).filter((l) => isLessonComplete(progress, track.id, l.slug)).length;
          const isOpen = filtering || open.has(stage.id);
          const panelId = `sidebar-stage-${stage.id}`;
          let lastModule = '';

          return (
            <div key={stage.id}>
              <button
                type="button"
                onClick={() => toggle(stage.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-800/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stage {stage.number}</span>
                  <span className="block text-[13px] font-semibold text-slate-200 truncate">{stage.title}</span>
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] text-slate-500">
                    {done}/{stageLessons(stage).length}
                  </span>
                  <ChevronIcon direction={isOpen ? 'down' : 'right'} className="h-4 w-4 text-slate-500" />
                </span>
              </button>
              {isOpen && (
                <ul id={panelId} className="mt-1 mb-2 ml-1 border-l border-slate-800 pl-2 space-y-0.5">
                  {lessons.map(({ lesson, module }) => {
                    const showModule = module !== lastModule;
                    lastModule = module;
                    const active = current?.type === 'lesson' && current.slug === lesson.slug;
                    const isDone = isLessonComplete(progress, track.id, lesson.slug);
                    return (
                      <li key={lesson.slug}>
                        {showModule && <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{module}</p>}
                        <a href={lessonHref(track.id, lesson.slug)} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                          <CheckCircleIcon filled={isDone} className={`h-4 w-4 mt-px flex-shrink-0 ${isDone ? 'text-emerald-400' : 'text-slate-600'}`} />
                          <span>
                            {lesson.title}
                            {isDone && <span className="sr-only"> (completed)</span>}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {(!filtering || visibleProblems.length > 0) && (
          <div>
            <button
              type="button"
              onClick={() => toggle(PROBLEMS_GROUP)}
              aria-expanded={filtering || open.has(PROBLEMS_GROUP)}
              aria-controls="sidebar-problems"
              className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-800/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stage {track.stages.length + 1}</span>
                <span className="block text-[13px] font-semibold text-slate-200">Practice Problems</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">
                  {track.problems.filter((p) => problemStatus(progress, track.id, p.slug) === 'completed').length}/{track.problems.length}
                </span>
                <ChevronIcon direction={filtering || open.has(PROBLEMS_GROUP) ? 'down' : 'right'} className="h-4 w-4 text-slate-500" />
              </span>
            </button>
            {(filtering || open.has(PROBLEMS_GROUP)) && (
              <div id="sidebar-problems" className="mt-1 mb-2 ml-1 border-l border-slate-800 pl-2">
                {LEVELS.map((level) => {
                  const items = visibleProblems.filter((p) => p.difficulty === level);
                  if (items.length === 0) return null;
                  return (
                    <div key={level}>
                      <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{LEVEL_LABEL[level]}</p>
                      <ul className="space-y-0.5">
                        {items.map((p) => {
                          const active = current?.type === 'problem' && current.slug === p.slug;
                          const status = problemStatus(progress, track.id, p.slug);
                          return (
                            <li key={p.slug}>
                              <a href={problemHref(track.id, p.slug)} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                                <StatusIcon status={status} className="h-4 w-4 mt-px flex-shrink-0" />
                                <span>
                                  {p.title}
                                  {!hasProblemBody(track.id, p.slug) && (
                                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-600">soon</span>
                                  )}
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                <a href={problemsHref(track.id)} className="mt-2 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-sky-400 hover:text-sky-300">
                  Browse all problems <ArrowIcon className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {filtering && visibleCount === 0 && (
          <p className="px-2 py-4 text-[13px] text-slate-500" role="status">
            No lessons or problems match “{filter}”.
          </p>
        )}
      </div>
    </nav>
  );
};

export default Sidebar;
