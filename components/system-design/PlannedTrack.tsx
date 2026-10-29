import React from 'react';
import { Track } from '../../content/shared/types';
import { ROOT_HREF } from './routes';
import { trackHref } from '../learn/routes';
import { ArrowIcon, Breadcrumbs } from '../learn/ui';

/** Shown for a track whose curriculum has not been built yet (currently HLD). */
const PlannedTrack: React.FC<{ track: Track; activeTrack: Track }> = ({ track, activeTrack }) => (
  <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title }]} />
      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 mb-4">
        Planned · coming soon
      </span>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{track.title}</h1>
      <p className="text-lg text-slate-400 mb-8">{track.description}</p>

      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 mb-8">
        <h2 className="font-bold text-white mb-1">What this track will cover</h2>
        <p className="text-sm text-slate-500 mb-5">The outline below is a plan, not published content yet.</p>
        <ol className="grid sm:grid-cols-2 gap-4">
          {track.plannedTopics?.map((topic, i) => (
            <li key={topic.title} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">Module {i + 1}</p>
              <p className="font-semibold text-slate-300">{topic.title}</p>
              <p className="text-sm text-slate-500 mt-1">{topic.description}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-white">Start with {activeTrack.title}</p>
          <p className="text-sm text-slate-400">LLD is fully available and is the natural foundation for HLD.</p>
        </div>
        <a href={trackHref(activeTrack)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm">
          Go to the {activeTrack.shortTitle} roadmap <ArrowIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  </main>
);

export default PlannedTrack;
