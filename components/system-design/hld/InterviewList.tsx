import React from 'react';
import { Level, Track } from '../../../content/shared/types';
import { problemStatus, useProgress } from '../../learn/progress';
import { sessionKey, useInterviews } from '../../learn/interviews';
import { problemHref } from '../../learn/routes';
import { Breadcrumbs, Chip, ClockIcon, LEVEL_LABEL, LevelBadge, StatusBadge } from '../../learn/ui';
import { ROOT_HREF } from '../routes';
import HldSectionNav, { interviewHref } from './HldSectionNav';
import { hasBreakdown } from './sequence';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

/** #system-design/hld/interview — every problem as a mock interview. */
const InterviewList: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const interviews = useInterviews();
  const available = track.problems.filter((p) => hasBreakdown(track, p.slug)).length;

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <HldSectionNav active="interview" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Mock interviews' }]} />
        <header className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold text-sky-400 mb-2">Guided practice</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Mock interviews</h1>
          <p className="text-slate-400">
            Each mock interview walks you through the nine steps against the clock: ask the interviewer clarifying questions, write requirements
            and APIs, estimate with the calculator, draw your design in Mermaid, pick deep dives, then compare with the reference and rate
            yourself. Answers are scripted per problem and matched to your questions by keywords; scores are your own self-assessment.{' '}
            {available === track.problems.length
              ? `All ${track.problems.length} problems are available, grouped by difficulty.`
              : `${available} of ${track.problems.length} are available now — the rest open as their breakdowns are published.`}
          </p>
        </header>

        {LEVELS.map((level) => {
          const items = track.problems.filter((p) => p.difficulty === level);
          return (
            <section key={level} aria-labelledby={`mock-${level}`} className="mb-10">
              <h2 id={`mock-${level}`} className="text-xl font-bold text-white mb-4">
                {LEVEL_LABEL[level]}
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((p) => {
                  const k = sessionKey(track.id, p.slug);
                  const session = interviews.sessions[k];
                  const attempts = interviews.history[k] ?? [];
                  const best = attempts.reduce((m, a) => Math.max(m, a.score), -1);
                  const ready = hasBreakdown(track, p.slug);
                  return (
                    <li key={p.slug} className={`rounded-xl border p-4 flex flex-col ${ready ? 'border-slate-700/80 bg-slate-800/40' : 'border-dashed border-slate-700 bg-slate-900/30'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className={`font-semibold ${ready ? 'text-slate-100' : 'text-slate-400'}`}>{p.title}</h3>
                        <StatusBadge status={problemStatus(progress, track.id, p.slug)} />
                      </div>
                      <p className="text-sm text-slate-400 mb-3 flex-1">{p.summary}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <LevelBadge level={p.difficulty} />
                        <Chip className="gap-1">
                          <ClockIcon /> {p.minutes} min
                        </Chip>
                        {attempts.length > 0 && <Chip>{attempts.length} attempt{attempts.length === 1 ? '' : 's'} · best {best}%</Chip>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm font-semibold">
                        {ready ? (
                          <a href={interviewHref(p.slug)} className="text-sky-400 hover:text-sky-300">
                            {session ? 'Resume interview →' : attempts.length > 0 ? 'Try again →' : 'Start interview →'}
                          </a>
                        ) : (
                          <span className="text-[11px] uppercase tracking-wider text-amber-300/90">Coming soon</span>
                        )}
                        <a href={problemHref(track, p.slug)} className="text-slate-400 hover:text-white">
                          {ready ? 'Breakdown' : 'Problem page'}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
};

export default InterviewList;
