import React from 'react';
import { Track } from '../../content/shared/types';
import { problemStatus, useProgress } from '../learn/progress';
import { problemHref } from '../learn/routes';
import { ClockIcon, StatusIcon } from '../learn/ui';
import { hasBreakdown, hours, learningSequence } from './sequence';

/** "Recommended learning sequence": stages in order, with the problems to practise as soon as their lessons are done. */
const LearningSequence: React.FC<{ track: Track; byModule?: boolean; intro: React.ReactNode }> = ({ track, byModule, intro }) => {
  const progress = useProgress();
  const sequence = learningSequence(track, { byModule });
  return (
    <section aria-labelledby="sequence-heading" className="pb-14">
      <h2 id="sequence-heading" className="text-2xl font-bold mb-2">
        Recommended <span className="text-sky-500">learning sequence</span>
      </h2>
      <p className="text-slate-400 mb-6 max-w-3xl">{intro}</p>
      <ol className="space-y-2">
        {sequence.map((step) => (
          <li key={step.stage.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold text-slate-100">
                <span className="text-slate-400 mr-1.5">Stage {step.stage.number}</span>
                {step.stage.title}
              </p>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <ClockIcon /> ~{hours(step.minutes)} h · {step.lessons} lessons{step.written < step.lessons ? ` (${step.written} available)` : ''}
              </span>
            </div>
            {step.groups.map((group) => (
              <div key={group.afterModule ?? 'end'} className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-violet-300">{group.afterModule ? `After ${group.afterModule}, practise:` : 'Then practise:'}</span>
                {group.problems.map((p) => (
                  <a
                    key={p.slug}
                    href={problemHref(track, p.slug)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-300"
                  >
                    <StatusIcon status={problemStatus(progress, track.id, p.slug)} className="h-3.5 w-3.5" />
                    {p.title}
                    {!hasBreakdown(track, p.slug) && <span className="text-[10px] uppercase tracking-wider text-slate-400">soon</span>}
                  </a>
                ))}
              </div>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
};

export default LearningSequence;
