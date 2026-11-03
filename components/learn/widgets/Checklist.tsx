import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { questionHash } from '../progress';
import { interviewActions, useInterviews } from '../interviews';
import { ProgressBar } from '../ui';

// Interactive checklist. In markdown:
//
//   ```checklist title="Evaluation checklist"
//   - Clarified the read/write ratio before choosing a database
//   - [ ] Explained how short codes stay unique
//   ```
//
// Ticks are saved per page when a page key is available, otherwise kept for the visit.

export const parseChecklist = (source: string) =>
  source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^- (\[[ xX]\] )?/, '').trim())
    .filter(Boolean);

const Inline: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown components={{ p: ({ children }) => <>{children}</>, code: ({ children }) => <code className="font-mono text-[0.9em] text-sky-300 bg-slate-800/80 px-1 py-0.5 rounded">{children}</code> }}>
    {text}
  </ReactMarkdown>
);

const Checklist: React.FC<{ source: string; title?: string; pageKey?: string }> = ({ source, title, pageKey }) => {
  const items = useMemo(() => parseChecklist(source), [source]);
  const interviews = useInterviews();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const stored = pageKey ? interviews.checklists[pageKey] ?? {} : undefined;
  const isOn = (id: string) => (stored ? Boolean(stored[id]) : Boolean(local[id]));
  const toggle = (id: string, on: boolean) => {
    if (pageKey) interviewActions.toggleChecklistItem(pageKey, id, on);
    else setLocal((s) => ({ ...s, [id]: on }));
  };
  const ids = items.map((text) => questionHash(text));
  const done = ids.filter(isOn).length;
  if (items.length === 0) return null;

  return (
    <section className="not-prose my-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] p-4 sm:p-5" aria-label={title ?? 'Checklist'} data-widget="checklist">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-emerald-200">☑️ {title ?? 'Checklist'}</p>
        <span className="text-xs text-slate-400">
          {done} / {items.length} covered{pageKey ? ' · saved in this browser' : ''}
        </span>
      </div>
      <ProgressBar value={done} max={items.length} label={`${title ?? 'Checklist'} items covered`} className="mb-3" />
      <ul className="space-y-1.5">
        {items.map((text, i) => {
          const id = ids[i];
          const on = isOn(id);
          return (
            <li key={id}>
              <label className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800/40 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
                <input type="checkbox" checked={on} onChange={(e) => toggle(id, e.target.checked)} className="mt-0.5 accent-emerald-500" />
                <span className={`[overflow-wrap:anywhere] ${on ? 'text-slate-400 line-through decoration-slate-600' : ''}`}>
                  <Inline text={text} />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default Checklist;
