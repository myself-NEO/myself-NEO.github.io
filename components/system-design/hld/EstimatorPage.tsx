import React from 'react';
import { Track } from '../../../content/shared/types';
import Estimator from '../../learn/widgets/Estimator';
import { lessonHref } from '../../learn/routes';
import { Breadcrumbs } from '../../learn/ui';
import { ROOT_HREF } from '../routes';
import HldSectionNav from './HldSectionNav';

// Rough, round figures for estimation — orders of magnitude, not benchmarks. The
// "Numbers to Know" lesson explains where each comes from and how it varies.
const LATENCIES: [string, string][] = [
  ['L1 cache reference', '~1 ns'],
  ['Main memory reference', '~100 ns'],
  ['Read 1 MB sequentially from memory', '~50 µs'],
  ['Round trip within a datacenter', '~0.5 ms'],
  ['Random read from an NVMe SSD', '~0.1 ms'],
  ['Read 1 MB sequentially from SSD', '~0.5 ms'],
  ['Redis GET over the network (same zone)', '~0.5–1 ms'],
  ['Indexed primary-key lookup in Postgres', '~1–5 ms'],
  ['Round trip between US coasts', '~70 ms'],
  ['Round trip Europe ↔ US West', '~150 ms'],
];

const POWERS: [string, string][] = [
  ['Seconds per day', '86,400 ≈ 10⁵'],
  ['Seconds per month', '~2.6 × 10⁶'],
  ['1 million requests/day', '≈ 12 per second'],
  ['1 billion requests/day', '≈ 12,000 per second'],
  ['1 KB × 1 billion', '1 TB'],
  ['1 MB × 1 million', '1 TB'],
];

/** #system-design/hld/estimator */
const EstimatorPage: React.FC<{ track: Track }> = ({ track }) => (
  <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
    <HldSectionNav active="estimator" />
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Estimator' }]} />
      <header className="mb-6 max-w-3xl">
        <p className="text-sm font-semibold text-sky-400 mb-2">Capacity estimation</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Back-of-the-envelope estimator</h1>
        <p className="text-slate-400">
          Change any assumption and every figure updates, with the working shown. Use it to check your mental maths — in an interview you
          will do this out loud with rounded numbers. The defaults are the classic exercise: 100 million requests a day, 10:1 reads to writes,
          1 KB records kept for five years.{' '}
          <a href={lessonHref(track, 'estimation-basics')} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
            Learn the method
          </a>
          .
        </p>
      </header>
      <h2 className="sr-only">Calculator</h2>
      <Estimator title="Your system" />
      <section aria-labelledby="numbers-heading" className="grid md:grid-cols-2 gap-5 mt-10">
        <h2 id="numbers-heading" className="sr-only">
          Numbers to keep in mind
        </h2>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h3 className="font-bold text-white mb-3">Latency, roughly</h3>
          <dl className="divide-y divide-slate-800 text-sm">
            {LATENCIES.map(([what, value]) => (
              <div key={what} className="flex justify-between gap-3 py-1.5">
                <dt className="text-slate-300">{what}</dt>
                <dd className="text-slate-100 font-mono whitespace-nowrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h3 className="font-bold text-white mb-3">Conversions worth memorising</h3>
          <dl className="divide-y divide-slate-800 text-sm">
            {POWERS.map(([what, value]) => (
              <div key={what} className="flex justify-between gap-3 py-1.5">
                <dt className="text-slate-300">{what}</dt>
                <dd className="text-slate-100 font-mono whitespace-nowrap">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            These are orders of magnitude for estimation, not benchmarks; real numbers vary with hardware, payload and configuration.
          </p>
        </div>
      </section>
    </div>
  </main>
);

export default EstimatorPage;
