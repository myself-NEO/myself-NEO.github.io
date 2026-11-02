import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../content/shared/types';
import { LEETCODE_PROBLEMS, leetCodeUrl, PRACTICE_TOPICS, practiceTopic, problemRef } from '../../content/learning/problems';
import MarkdownContent from '../learn/MarkdownContent';
import { downloadBackup, restoreBackup } from '../learn/backup';
import { Note, notebookActions, useNotebook } from '../learn/notebook';
import { useProgress } from '../learn/progress';
import { matchesFilter } from '../learn/search';
import { Breadcrumbs, ExternalLinkIcon, NoteIcon, SearchIcon, StatusBadge, focusRing } from '../learn/ui';
import DsaSectionNav, { DSA_HOME, dsaProblemsHref } from './DsaSectionNav';
import { DSA, DifficultyBadge, PRACTICE_STATUS_LABEL, statusOf } from './practice';

type Kind = 'all' | 'mine' | 'problems';

const buttonClass = `inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`;
const inputClass =
  'w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500';

const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const topicLabel = (id: string) => practiceTopic(id)?.title ?? 'General';
const problemFor = (note: Note) => (note.problem ? LEETCODE_PROBLEMS.find((p) => problemRef(p) === note.problem) : undefined);

const TopicSelect: React.FC<{ id: string; value: string; onChange: (v: string) => void; label: string; includeAll?: boolean }> = ({
  id,
  value,
  onChange,
  label,
  includeAll,
}) => (
  <>
    <label htmlFor={id} className="sr-only">
      {label}
    </label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} sm:w-auto`}>
      {includeAll && <option value="all">All topics</option>}
      {PRACTICE_TOPICS.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
      <option value="general">General</option>
    </select>
  </>
);

/** Writes a free-form note, or edits any note. A problem note keeps its title and topic. */
const NoteEditor: React.FC<{ note?: Note; onDone: () => void }> = ({ note, onDone }) => {
  const forProblem = Boolean(note?.problem);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [topic, setTopic] = useState(note?.topic || 'general');
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => firstField.current?.focus(), []);
  const idBase = note?.id ?? 'new';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (forProblem && note) {
          // An emptied problem note is removed, as it is from the coding-questions list.
          if (body.trim()) notebookActions.saveNote({ ...note, body });
          else notebookActions.deleteNote(note.id);
        } else {
          if (!title.trim() && !body.trim()) return;
          notebookActions.saveNote({ id: note?.id, track: DSA, title: title.trim() || 'Untitled note', body, topic });
        }
        onDone();
      }}
      className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3"
    >
      {forProblem ? (
        <p className="text-sm font-semibold text-white">{note?.title}</p>
      ) : (
        <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div>
            <label htmlFor={`note-title-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
              Title
            </label>
            <input
              id={`note-title-${idBase}`}
              ref={firstField}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="e.g. When to reach for a monotonic stack"
            />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 mb-1" aria-hidden="true">
              Topic
            </span>
            <TopicSelect id={`note-topic-${idBase}`} value={topic} onChange={setTopic} label="Note topic" />
          </div>
        </div>
      )}
      <div>
        <label htmlFor={`note-body-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
          Note (Markdown supported, including ```java code blocks)
        </label>
        <textarea
          id={`note-body-${idBase}`}
          ref={forProblem ? firstField : undefined}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          className={`${inputClass} font-mono`}
        />
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

const NoteCard: React.FC<{ track: Track; note: Note }> = ({ track, note }) => {
  const progress = useProgress();
  const [editing, setEditing] = useState(false);
  if (editing) return <NoteEditor note={note} onDone={() => setEditing(false)} />;
  const problem = problemFor(note);
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 sm:p-5" data-note={note.problem ? 'problem' : 'mine'}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          {problem ? (
            <a
              href={leetCodeUrl(problem)}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-baseline gap-1.5 font-semibold text-white hover:text-sky-300"
            >
              {note.title}
              <ExternalLinkIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500 group-hover:text-sky-300" />
              <span className="sr-only">(opens LeetCode in a new tab)</span>
            </a>
          ) : (
            <h3 className="font-semibold text-white">{note.title}</h3>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {problem && (
              <>
                <DifficultyBadge difficulty={problem.difficulty} />
                <StatusBadge status={statusOf(progress, problem)} label={PRACTICE_STATUS_LABEL[statusOf(progress, problem)]} />
              </>
            )}
            <span>
              {topicLabel(note.topic)} · edited {formatDate(note.updatedAt)}
            </span>
            {problem && (
              <a href={dsaProblemsHref(problem.topic)} className="text-sky-400 hover:underline">
                in coding questions
              </a>
            )}
          </div>
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

/** #dsa/notes — the learner's own interview notes, plus every note written on a coding question. */
const InterviewNotes: React.FC<{ track: Track }> = ({ track }) => {
  const notebook = useNotebook();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [kind, setKind] = useState<Kind>('all');
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const all = Object.values(notebook.notes).filter((n) => n.track === DSA);
  const topicOk = (t: string) => topic === 'all' || t === topic || (topic === 'general' && !practiceTopic(t));
  const matching = all.filter((n) => topicOk(n.topic) && matchesFilter(query, n.title, n.body));
  const mine = matching.filter((n) => !n.problem);
  const problems = matching.filter((n) => n.problem);
  const shown = (kind === 'mine' ? mine : kind === 'problems' ? problems : matching).sort((a, b) => b.updatedAt - a.updatedAt);

  const kinds: { id: Kind; label: string; count: number }[] = [
    { id: 'all', label: 'All notes', count: matching.length },
    { id: 'mine', label: 'My notes', count: mine.length },
    { id: 'problems', label: 'Problem notes', count: problems.length },
  ];

  const importBackup = async (file: File) => {
    const result = await restoreBackup(file);
    if (result === 'restored') setMessage('Backup restored.');
    else if (result === 'invalid') setMessage('That file is not a notebook backup.');
  };

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <DsaSectionNav active="notes" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'DSA', href: DSA_HOME }, { label: 'Interview notes' }]} />
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Interview notes</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">My DSA interview notes</h1>
            <p className="text-slate-400 max-w-2xl">
              Your own notes for interview day: patterns in your words, templates you keep re-deriving, mistakes not to repeat. Notes you write on
              a coding question are collected here too. Everything is stored in this browser; export a backup to keep it safe.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                downloadBackup();
                setMessage('Backup downloaded.');
              }}
              className={buttonClass}
            >
              Export backup
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass}>
              Import backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a notebook backup file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = '';
              }}
            />
          </div>
        </header>
        <p role="status" aria-live="polite" className={message ? 'mb-4 text-sm text-emerald-300' : 'sr-only'}>
          {message}
        </p>

        <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 mb-6 flex flex-col sm:flex-row gap-3">
          <label className="relative block flex-1">
            <span className="sr-only">Search your notes</span>
            <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" className={`${inputClass} pl-9`} />
          </label>
          <TopicSelect id="notes-topic" value={topic} onChange={setTopic} includeAll label="Filter by topic" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div role="group" aria-label="Which notes" className="flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${focusRing} ${
                  kind === k.id ? 'bg-sky-500/15 border-sky-500/50 text-sky-200' : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
              >
                {k.label} <span className="text-slate-500">{k.count}</span>
              </button>
            ))}
          </div>
          {!composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 px-3.5 py-2 text-sm font-semibold text-white ${focusRing}`}
            >
              <NoteIcon className="h-4 w-4" /> New note
            </button>
          )}
        </div>

        {composing && (
          <div className="mb-6">
            <NoteEditor onDone={() => setComposing(false)} />
          </div>
        )}

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-400">
            {all.length === 0 ? (
              <>
                No notes yet. Write one with <strong className="text-slate-200">New note</strong>, or open{' '}
                <strong className="text-slate-200">Notes</strong> on any of the{' '}
                <a href={dsaProblemsHref()} className="text-sky-400 hover:underline">
                  coding questions
                </a>
                .
              </>
            ) : (
              'No notes match the search or topic.'
            )}
          </div>
        ) : (
          <ul className="space-y-4">
            {shown.map((n) => (
              <li key={n.id}>
                <NoteCard track={track} note={n} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default InterviewNotes;
