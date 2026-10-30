import React, { useEffect, useRef, useState } from 'react';
import { LessonMeta, Track } from '../../content/shared/types';
import { lessonNote, notebookActions, useNotebook } from './notebook';
import { NoteIcon } from './ui';

const SAVE_DELAY_MS = 600;

/** A personal note attached to a lesson, autosaved to the revision notebook. */
const LessonNotes: React.FC<{ track: Track; lesson: LessonMeta; topic: string; notebookHref?: string }> = ({
  track,
  lesson,
  topic,
  notebookHref,
}) => {
  const notebook = useNotebook();
  const existing = lessonNote(notebook, track.id, lesson.slug);
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
          title: lesson.title,
          body: value,
          topic,
          lesson: lesson.slug,
        });
      }
      setStatus('saved');
    }, SAVE_DELAY_MS);
  };

  const textareaId = `lesson-note-${lesson.slug}`;

  return (
    <section aria-labelledby={`${textareaId}-heading`} className="mt-14 rounded-xl border border-slate-700/80 bg-slate-800/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id={`${textareaId}-heading`} className="flex items-center gap-2 text-lg font-bold text-white">
          <NoteIcon className="h-5 w-5 text-sky-400" />
          My notes
        </h2>
        <span className="text-xs text-slate-500" aria-live="polite">
          {status === 'pending' ? 'Saving…' : status === 'saved' ? (text.trim() ? 'Saved to your notebook' : 'Note removed') : existing ? `Last edited ${new Date(existing.updatedAt).toLocaleDateString()}` : ''}
        </span>
      </div>
      <label htmlFor={textareaId} className="block text-sm text-slate-400 mb-2">
        Write the idea in your own words, or the detail you keep forgetting. Notes are saved in this browser
        {notebookHref ? (
          <>
            {' '}and collected in your{' '}
            <a href={notebookHref} className="text-sky-400 hover:underline">
              revision notebook
            </a>
          </>
        ) : null}
        .
      </label>
      <textarea
        id={textareaId}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="e.g. HashMap treeifies a bucket at 8 entries only when the table has at least 64 buckets…"
        className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
      />
    </section>
  );
};

export default LessonNotes;
