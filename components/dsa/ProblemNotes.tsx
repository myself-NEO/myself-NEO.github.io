import React, { useEffect, useRef, useState } from 'react';
import { LeetCodeProblem, problemRef } from '../../content/learning/problems';
import { notebookActions, useNotebook } from '../learn/notebook';
import { DSA, noteOf } from './practice';
import { DSA_NOTES } from './DsaSectionNav';

const SAVE_DELAY_MS = 600;

/** The learner's note on one coding question, autosaved to their interview notes. */
const ProblemNotes: React.FC<{ problem: LeetCodeProblem; id: string }> = ({ problem, id }) => {
  const notebook = useNotebook();
  const existing = noteOf(notebook, problem);
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
          track: DSA,
          title: `${problem.id}. ${problem.title}`,
          body: value,
          topic: problem.topic,
          problem: problemRef(problem),
        });
      }
      setStatus('saved');
    }, SAVE_DELAY_MS);
  };

  return (
    <div id={id} className="mt-3 border-t border-slate-700/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <label htmlFor={`${id}-text`} className="text-xs font-semibold text-slate-400">
          My notes · approach, complexity, the bug that got you
        </label>
        <span className="text-xs text-slate-500" aria-live="polite">
          {status === 'pending'
            ? 'Saving…'
            : status === 'saved'
              ? text.trim()
                ? 'Saved'
                : 'Note removed'
              : existing
                ? `Last edited ${new Date(existing.updatedAt).toLocaleDateString()}`
                : ''}
        </span>
      </div>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="e.g. Sort + two pointers, skip duplicates on both pointers. O(n²) time, O(1) extra space."
        className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
      />
      <p className="mt-1 text-xs text-slate-500">
        Saved in this browser and collected in your{' '}
        <a href={DSA_NOTES} className="text-sky-400 hover:underline">
          interview notes
        </a>
        . Markdown is supported.
      </p>
    </div>
  );
};

export default ProblemNotes;
