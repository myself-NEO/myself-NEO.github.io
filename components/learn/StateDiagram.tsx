import React, { useMemo } from 'react';

// Renders a state machine from a text block:
//
//   [*] --> Idle
//   Idle --> HasMoney : insertCoin()
//   HasMoney --> Dispensing : select(item) [in stock]
//   Dispensing --> [*]
//
// "[*]" marks the initial state (on the left) or a final state (on the right).

interface Transition {
  from: string;
  to: string;
  trigger?: string;
}

const LINE_RE = /^(\[\*\]|[\w-]+)\s*-{1,2}>\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/;

const parseStates = (source: string) => {
  const transitions: Transition[] = [];
  const states: string[] = [];
  const initial = new Set<string>();
  const finals = new Set<string>();
  const addState = (s: string) => {
    if (s !== '[*]' && !states.includes(s)) states.push(s);
  };

  for (const raw of source.split('\n')) {
    const match = raw.trim().match(LINE_RE);
    if (!match) continue;
    const [, from, to, trigger] = match;
    addState(from);
    addState(to);
    if (from === '[*]') initial.add(to);
    else if (to === '[*]') finals.add(from);
    else transitions.push({ from, to, trigger });
  }
  return { states, transitions, initial, finals };
};

const StateDiagram: React.FC<{ source: string; title?: string }> = ({ source, title }) => {
  const { states, transitions, initial, finals } = useMemo(() => parseStates(source), [source]);

  return (
    <figure className="not-prose my-6 rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 sm:p-5">
      <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">{title ?? 'State machine'}</figcaption>

      <ol className="flex flex-wrap gap-2 mb-5" aria-label="States">
        {states.map((s) => (
          <li
            key={s}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${
              initial.has(s)
                ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                : finals.has(s)
                ? 'bg-slate-800 border-slate-500 text-slate-200 ring-2 ring-slate-600 ring-offset-2 ring-offset-slate-900'
                : 'bg-slate-950/60 border-slate-700 text-slate-200'
            }`}
          >
            {initial.has(s) && <span className="sr-only">Initial state: </span>}
            {finals.has(s) && <span className="sr-only">Final state: </span>}
            {s}
            {initial.has(s) && <span className="ml-1.5 text-[10px] font-sans text-sky-300">start</span>}
            {finals.has(s) && <span className="ml-1.5 text-[10px] font-sans text-slate-400">end</span>}
          </li>
        ))}
      </ol>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th scope="col" className="py-2 pr-3 font-semibold">From</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Event / guard</th>
              <th scope="col" className="py-2 font-semibold">To</th>
            </tr>
          </thead>
          <tbody>
            {transitions.map((t, i) => (
              <tr key={i} className="border-b border-slate-800/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-slate-200 whitespace-nowrap">{t.from}</td>
                <td className="py-2 pr-3 font-mono text-amber-200">{t.trigger ?? '—'}</td>
                <td className="py-2 font-mono text-slate-200 whitespace-nowrap">
                  <span className="text-sky-400 mr-1" aria-hidden="true">→</span>
                  {t.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

export default StateDiagram;
