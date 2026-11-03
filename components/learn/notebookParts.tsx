import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../content/shared/types';
import { findLesson, findProblem } from '../../content/shared/curriculum';
import MarkdownContent from './MarkdownContent';
import { Note, NoteKind, notebookActions } from './notebook';
import { lessonHref, problemHref } from './routes';
import { focusRing } from './ui';

// Pieces shared by the revision notebooks of the learning sections.

export interface TopicOption {
  id: string;
  label: string;
  group: string;
}

export const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const buttonClass = `inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`;
export const inputClass =
  'w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500';

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-400">{children}</div>
);

export const TopicSelect: React.FC<{
  topics: TopicOption[];
  value: string;
  onChange: (v: string) => void;
  id: string;
  includeAll?: boolean;
  label: string;
}> = ({ topics, value, onChange, id, includeAll, label }) => {
  const groups = Array.from(new Set(topics.map((t) => t.group)));
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} sm:w-auto`}>
        {includeAll && <option value="all">All topics</option>}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {topics
              .filter((t) => t.group === g)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </>
  );
};

export interface NoteKindOption {
  id: NoteKind;
  label: string;
  /** Starting text for a new note of this kind. */
  template?: string;
}

interface NoteEditorProps {
  track: Track;
  topics: TopicOption[];
  note?: Note;
  onDone: () => void;
  /** Offer a "kind" choice (trade-off, formula, …); omitted = plain notes. */
  kinds?: NoteKindOption[];
  initialKind?: NoteKind;
  titlePlaceholder?: string;
  bodyLabel?: string;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  track,
  topics,
  note,
  onDone,
  kinds,
  initialKind,
  titlePlaceholder = 'e.g. HashMap resize in one paragraph',
  bodyLabel = 'Note (Markdown supported, including ```java code blocks)',
}) => {
  const startKind = note?.kind ?? initialKind ?? kinds?.[0]?.id;
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? (note ? '' : kinds?.find((k) => k.id === startKind)?.template ?? ''));
  const [topic, setTopic] = useState(note?.topic || 'general');
  const [kind, setKind] = useState<NoteKind | undefined>(startKind);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const idBase = note?.id ?? 'new';

  const changeKind = (next: NoteKind) => {
    // Swap the template only while the body is still an untouched template.
    const oldTemplate = kinds?.find((k) => k.id === kind)?.template ?? '';
    if (!note && (body.trim() === '' || body === oldTemplate)) setBody(kinds?.find((k) => k.id === next)?.template ?? '');
    setKind(next);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() && !body.trim()) return;
        notebookActions.saveNote({
          id: note?.id,
          track: track.id,
          title: title.trim() || 'Untitled note',
          body,
          topic,
          lesson: note?.lesson,
          problem: note?.problem,
          kind: kinds ? kind : note?.kind,
        });
        onDone();
      }}
      className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3"
    >
      <div className={`grid gap-3 ${kinds ? 'sm:grid-cols-[minmax(0,1fr)_auto_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
        <div>
          <label htmlFor={`note-title-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
            Title
          </label>
          <input id={`note-title-${idBase}`} ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={titlePlaceholder} />
        </div>
        {kinds && (
          <div>
            <label htmlFor={`note-kind-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
              Kind
            </label>
            <select id={`note-kind-${idBase}`} value={kind} onChange={(e) => changeKind(e.target.value as NoteKind)} className={`${inputClass} sm:w-auto`}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-1" aria-hidden="true">
            Topic
          </span>
          <TopicSelect topics={topics} id={`note-topic-${idBase}`} value={topic} onChange={setTopic} label="Note topic" />
        </div>
      </div>
      <div>
        <label htmlFor={`note-body-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
          {bodyLabel}
        </label>
        <textarea id={`note-body-${idBase}`} value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={`${inputClass} font-mono`} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-white ${focusRing}`}>
          Save note
        </button>
        <button type="button" onClick={onDone} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export const NoteCard: React.FC<{
  track: Track;
  topics: TopicOption[];
  note: Note;
  topicLabel: (id: string) => string;
  kinds?: NoteKindOption[];
  /** A chip shown before the title (e.g. the note's kind). */
  badge?: React.ReactNode;
}> = ({ track, topics, note, topicLabel, kinds, badge }) => {
  const [editing, setEditing] = useState(false);
  const lesson = note.lesson ? findLesson(track, note.lesson)?.lesson : undefined;
  const problem = note.problem ? findProblem(track, note.problem) : undefined;
  if (editing) return <NoteEditor track={track} topics={topics} note={note} kinds={kinds} onDone={() => setEditing(false)} />;
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">
            {badge}
            {note.title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {topicLabel(note.topic)} · edited {formatDate(note.updatedAt)}
            {lesson && (
              <>
                {' · '}
                <a href={lessonHref(track, lesson.slug)} className="text-sky-400 hover:underline">
                  lesson note: {lesson.title}
                </a>
              </>
            )}
            {problem && (
              <>
                {' · '}
                <a href={problemHref(track, problem.slug)} className="text-sky-400 hover:underline">
                  problem note: {problem.title}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={buttonClass}>
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete the note “${note.title}”?`)) notebookActions.deleteNote(note.id);
            }}
            className={`${buttonClass} hover:!text-rose-300 hover:!border-rose-500/50`}
          >
            Delete
          </button>
        </div>
      </div>
      <MarkdownContent markdown={note.body || '_Empty note_'} basePath={track.basePath} />
    </article>
  );
};
