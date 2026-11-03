import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../../content/shared/types';
import { findProblem } from '../../../content/shared/curriculum';
import { itemKey, notebookActions, problemNote, useNotebook } from '../../learn/notebook';
import { useInterviews, sessionKey } from '../../learn/interviews';
import { ArrowIcon, FlagIcon, NoteIcon, ToggleChip } from '../../learn/ui';
import { HLD_NOTEBOOK_HREF, interviewHref } from './HldSectionNav';
import { hasBreakdown } from './sequence';

const SAVE_DELAY_MS = 600;

/** Notebook key of "revisit this problem". */
export const revisitRef = (slug: string) => `problem:${slug}`;

const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Under the status control: mock interview, revisit flag and the last attempt. */
export const ProblemHeaderExtras: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const notebook = useNotebook();
  const interviews = useInterviews();
  const k = sessionKey(track.id, slug);
  const session = interviews.sessions[k];
  const attempts = interviews.history[k] ?? [];
  const last = attempts[attempts.length - 1];
  const revisit = Boolean(notebook.revise[itemKey(track.id, revisitRef(slug))]);
  const canInterview = hasBreakdown(track, slug);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canInterview && (
        <a
          href={interviewHref(slug)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 border border-violet-500/40 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          🎙️ {session ? 'Resume mock interview' : attempts.length > 0 ? 'Mock interview again' : 'Practise as a mock interview'}
          <ArrowIcon className="h-3.5 w-3.5" />
        </a>
      )}
      <ToggleChip
        pressed={revisit}
        onClick={() => notebookActions.toggleRevise(track.id, revisitRef(slug))}
        icon={<FlagIcon filled={revisit} className="h-3.5 w-3.5" />}
        label="Revisit later"
        pressedLabel="On your revisit list"
        tone="amber"
      />
      {last && (
        <span className="text-xs text-slate-400">
          Last mock: {last.score}% self-score on {formatDate(last.completedAt)} · {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
};

/** A personal note on the problem, autosaved to the notebook. */
export const ProblemNotes: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const notebook = useNotebook();
  const problem = findProblem(track, slug);
  const existing = problemNote(notebook, track.id, slug);
  const [text, setText] = useState(existing?.body ?? '');
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle');
  const noteId = useRef(existing?.id);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setText(value);
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (value.trim() === '') {
        if (noteId.current) notebookActions.deleteNote(noteId.current);
        noteId.current = undefined;
      } else {
        noteId.current = notebookActions.saveNote({
          id: noteId.current,
          track: track.id,
          title: `${problem?.title ?? slug} — my notes`,
          body: value,
          topic: 'problems',
          problem: slug,
        });
      }
      setStatus('saved');
    }, SAVE_DELAY_MS);
  };

  const id = `problem-note-${slug}`;
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-14 rounded-xl border border-slate-700/80 bg-slate-800/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-bold text-white">
          <NoteIcon className="h-5 w-5 text-sky-400" />
          My notes on this problem
        </h2>
        <span className="text-xs text-slate-500" aria-live="polite">
          {status === 'pending' ? 'Saving…' : status === 'saved' ? (text.trim() ? 'Saved to your notebook' : 'Note removed') : existing ? `Last edited ${new Date(existing.updatedAt).toLocaleDateString()}` : ''}
        </span>
      </div>
      <label htmlFor={id} className="block text-sm text-slate-400 mb-2">
        What tripped you up, the trade-off you want to remember, what you would say differently next time. Collected in your{' '}
        <a href={HLD_NOTEBOOK_HREF} className="text-sky-400 hover:underline">
          revision notebook
        </a>
        .
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="e.g. Forgot to ask about custom aliases; 301 vs 302 matters for analytics…"
        className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
      />
    </section>
  );
};
