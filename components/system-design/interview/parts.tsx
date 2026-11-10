import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../../content/shared/types';
import type { CoverageItem, Matcher } from '../../../content/system-design/interviewScript';
import MarkdownContent from '../../learn/MarkdownContent';
import { interviewActions, InterviewSession } from '../../learn/interviews';
import { useSaveTools } from '../../learn/saveTools';
import { focusRing } from '../../learn/ui';

// Building blocks of the mock-interview phases, shared by the HLD and LLD kits.

export const useAutosave = (value: string | undefined, save: (text: string) => void, delay = 500) => {
  const [text, setText] = useState(value ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(save);
  latest.current = save;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const onChange = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(next), delay);
  };
  const flush = () => {
    clearTimeout(timer.current);
    latest.current(text);
  };
  return { text, onChange, flush };
};

export const buttonClass = `inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`;
export const primaryButton = `inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white ${focusRing}`;

interface DraftProps {
  track: Track;
  slug: string;
  session: InterviewSession;
  draftKey: string;
  label: string;
  placeholder: string;
  rows?: number;
}

/** The learner's own answer for a phase, autosaved into the session. */
export const Draft: React.FC<DraftProps> = ({ track, slug, session, draftKey, label, placeholder, rows = 8 }) => {
  const { text, onChange } = useAutosave(session.drafts[draftKey], (t) => interviewActions.setDraft(track.id, slug, draftKey, t));
  const id = `draft-${draftKey.replace(/[^\w-]/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-200 mb-1.5">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <p className="mt-1 text-[11px] text-slate-400">Saved as you type, in this browser.</p>
    </div>
  );
};

/** Progressive hints for one key: the breakdown's own hints when it has them, generic ones otherwise. */
export const Hints: React.FC<{ track: Track; slug: string; session: InterviewSession; hintKey: string; hints: string[] }> = ({ track, slug, session, hintKey, hints }) => {
  const shown = Math.min(session.hints[hintKey] ?? 0, hints.length);
  if (hints.length === 0) return null;
  return (
    <div className="space-y-2">
      {hints.slice(0, shown).map((hint, i) => (
        <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-sm text-slate-200">
          <p className="text-xs font-semibold text-amber-300 mb-1">
            Hint {i + 1} of {hints.length}
          </p>
          <MarkdownContent markdown={hint} basePath={track.basePath} />
        </div>
      ))}
      {shown < hints.length && (
        <button
          type="button"
          onClick={() => interviewActions.showHint(track.id, slug, hintKey)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 ${focusRing}`}
        >
          💡 Show hint {shown + 1} of {hints.length}
        </button>
      )}
    </div>
  );
};

/** Drops a ````solution wrapper so a revealed reference doesn't need a second click. */
export const unwrapSolution = (markdown: string) => markdown.replace(/^(`{4,})solution[^\n]*\n([\s\S]*?)\n\1[ \t]*$/m, '$2');

export interface RevealProps {
  track: Track;
  slug: string;
  session: InterviewSession;
  revealKey: string;
  label: string;
  /** Markdown shown once revealed. */
  markdown: string;
  /** Extra content under the reference (e.g. coverage checks). */
  after?: React.ReactNode;
  markdownEnv?: Partial<React.ComponentProps<typeof MarkdownContent>>;
}

/** A reference answer that stays hidden until the learner asks for it. */
export const Reference: React.FC<RevealProps> = ({ track, slug, session, revealKey, label, markdown, after, markdownEnv }) => {
  const revealed = Boolean(session.revealed[revealKey]);
  const ref = useRef<HTMLDivElement>(null);
  if (!markdown.trim()) return null;
  return revealed ? (
    <section ref={ref} tabIndex={-1} aria-label={label} className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] px-4 sm:px-5 py-4 focus:outline-none">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">Reference · {label}</p>
      <MarkdownContent markdown={unwrapSolution(markdown)} basePath={track.basePath} {...markdownEnv} />
      {after}
    </section>
  ) : (
    <button
      type="button"
      onClick={() => {
        interviewActions.reveal(track.id, slug, revealKey);
        requestAnimationFrame(() => ref.current?.focus());
      }}
      className={`inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 ${focusRing}`}
    >
      🔍 Reveal reference: {label}
    </button>
  );
};

/** Breakdown sections joined into one markdown document, each under its own `###` heading. */
export const joinSections = (sections: Record<string, string>, titles: string[]) =>
  titles
    .filter((title) => sections[title]?.trim())
    // Inner ### headings drop a level so each section title stays above its own subsections.
    .map((title) => `### ${title}\n\n${sections[title].replace(/^(#{3,5}) /gm, '#$1 ')}`)
    .join('\n\n');

export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const WidgetFallback = () => <div className="min-h-[10rem] rounded-xl border border-slate-800 bg-slate-900/40" role="status" aria-label="Loading" />;

/** Reference items the learner's draft should cover, with a keyword check and manual ticks. */
export const CoverageList: React.FC<{
  track: Track;
  slug: string;
  session: InterviewSession;
  title: string;
  prefix: string;
  items: CoverageItem[];
  text: string;
  mentions: Matcher['mentions'];
}> = ({ track, slug, session, title, prefix, items, text, mentions }) => {
  if (items.length === 0) return null;
  const covered = items.filter((item, i) => session.checks[`${prefix}:${i}`] || mentions(text, item)).length;
  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <p className="text-sm font-semibold text-slate-200 mb-1">
        {title}: {covered} / {items.length} covered
      </p>
      <p className="text-xs text-slate-400 mb-2">“Looks mentioned” is a keyword check of your draft. Tick the ones you covered in other words.</p>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const auto = mentions(text, item);
          const key = `${prefix}:${i}`;
          return (
            <li key={key}>
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={auto || Boolean(session.checks[key])} disabled={auto} onChange={(e) => interviewActions.setCheck(track.id, slug, key, e.target.checked)} className="mt-1 accent-emerald-500" />
                <span className="[overflow-wrap:anywhere]">
                  <MarkdownContent markdown={item.text} basePath={track.basePath} />
                  {auto && <span className="ml-1 text-[11px] text-emerald-300">looks mentioned</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** A phase answered in writing: the learner's draft, hints, then the reference. */
export const DraftPhase: React.FC<{
  track: Track;
  slug: string;
  session: InterviewSession;
  tools: ReturnType<typeof useSaveTools>;
  draftKey: string;
  label: string;
  placeholder: string;
  rows?: number;
  hints: string[];
  reference: { label: string; markdown: string };
  children?: React.ReactNode;
  after?: React.ReactNode;
}> = ({ track, slug, session, tools, draftKey, label, placeholder, rows, hints, reference, children, after }) => (
  <div className="space-y-5">
    {children}
    <Draft track={track} slug={slug} session={session} draftKey={draftKey} label={label} placeholder={placeholder} rows={rows} />
    <Hints track={track} slug={slug} session={session} hintKey={draftKey} hints={hints} />
    <Reference
      track={track}
      slug={slug}
      session={session}
      revealKey={draftKey}
      label={reference.label}
      markdown={reference.markdown}
      after={after}
      markdownEnv={{ onSaveDiagram: tools.onSaveDiagram, onToggleQuestion: tools.onToggleQuestion, savedQuestions: tools.savedQuestions }}
    />
  </div>
);
