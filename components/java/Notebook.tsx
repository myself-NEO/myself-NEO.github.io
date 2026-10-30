import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Track } from '../../content/shared/types';
import { findLesson } from '../../content/shared/curriculum';
import { INTERVIEW_TOPICS, InterviewQuestion, loadInterviewBank, topicTitle } from '../../content/java/interview';
import { JAVA_HOME } from '../../content/java';
import CodeBlock from '../learn/CodeBlock';
import MarkdownContent from '../learn/MarkdownContent';
import { getNotebook, Note, notebookActions, sanitizeNotebook, SavedItem, useNotebook } from '../learn/notebook';
import { getProgress, progressActions, sanitizeProgress, useProgress } from '../learn/progress';
import { lessonHref } from '../learn/routes';
import { matchesFilter } from '../learn/search';
import { setJumpTarget } from '../learn/jump';
import { BookmarkIcon, Breadcrumbs, Chip, FlagIcon, NoteIcon, SearchIcon, focusRing } from '../learn/ui';
import JavaSectionNav from './JavaSectionNav';
import QuestionCard, { MarkdownInline } from './QuestionCard';
import { RevisionItem, revisionItems } from './revision';

type Tab = 'revision' | 'saved' | 'questions' | 'notes' | 'snippets' | 'mistakes';
const TAB_KEY = 'java-notebook-tab';

const readTab = (): Tab => {
  try {
    const t = window.localStorage.getItem(TAB_KEY);
    return t === 'saved' || t === 'questions' || t === 'notes' || t === 'snippets' || t === 'mistakes' ? t : 'revision';
  } catch {
    return 'revision';
  }
};

const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const buttonClass = `inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`;
const inputClass =
  'w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500';

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-400">{children}</div>
);

const KIND_LABEL: Record<RevisionItem['kind'], string> = { lesson: 'Difficult lesson', question: 'Interview question', quiz: 'Quiz mistake' };

/** The topic options shared by every tab: curriculum stages, interview topics and "general". */
const useTopics = (track: Track) =>
  useMemo(
    () => [
      ...track.stages.map((s) => ({ id: s.id, label: `Stage ${s.number}: ${s.title}`, group: 'Curriculum' })),
      ...INTERVIEW_TOPICS.map((t) => ({ id: t.id, label: t.title, group: 'Interview topics' })),
      { id: 'general', label: 'General', group: 'Other' },
    ],
    [track],
  );

const TopicSelect: React.FC<{ track: Track; value: string; onChange: (v: string) => void; id: string; includeAll?: boolean; label: string }> = ({
  track,
  value,
  onChange,
  id,
  includeAll,
  label,
}) => {
  const topics = useTopics(track);
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

const topicLabel = (track: Track, id: string) => {
  const stage = track.stages.find((s) => s.id === id);
  if (stage) return `Stage ${stage.number}: ${stage.title}`;
  if (id === 'general' || !id) return 'General';
  return topicTitle(id);
};

const openQuestion = (track: Track, id: string) => setJumpTarget(`question:${track.id}:${id}`);

// ── Notes ──────────────────────────────────────────────────

const NoteEditor: React.FC<{ track: Track; note?: Note; onDone: () => void }> = ({ track, note, onDone }) => {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [topic, setTopic] = useState(note?.topic || 'general');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const idBase = note?.id ?? 'new';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() && !body.trim()) return;
        notebookActions.saveNote({ id: note?.id, track: track.id, title: title.trim() || 'Untitled note', body, topic, lesson: note?.lesson });
        onDone();
      }}
      className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div>
          <label htmlFor={`note-title-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
            Title
          </label>
          <input id={`note-title-${idBase}`} ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. HashMap resize in one paragraph" />
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-1" aria-hidden="true">
            Topic
          </span>
          <TopicSelect track={track} id={`note-topic-${idBase}`} value={topic} onChange={setTopic} label="Note topic" />
        </div>
      </div>
      <div>
        <label htmlFor={`note-body-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
          Note (Markdown supported, including ```java code blocks)
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

const NoteCard: React.FC<{ track: Track; note: Note }> = ({ track, note }) => {
  const [editing, setEditing] = useState(false);
  const lesson = note.lesson ? findLesson(track, note.lesson)?.lesson : undefined;
  if (editing) return <NoteEditor track={track} note={note} onDone={() => setEditing(false)} />;
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{note.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {topicLabel(track, note.topic)} · edited {formatDate(note.updatedAt)}
            {lesson && (
              <>
                {' · '}
                <a href={lessonHref(track, lesson.slug)} className="text-sky-400 hover:underline">
                  lesson note: {lesson.title}
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

// ── Snippets ───────────────────────────────────────────────

const SnippetForm: React.FC<{ track: Track; onDone: () => void }> = ({ track, onDone }) => {
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('java');
  const [topic, setTopic] = useState('general');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        notebookActions.addSnippet({ track: track.id, title: title.trim() || 'Untitled snippet', code, language, topic });
        onDone();
      }}
      className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-end">
        <div>
          <label htmlFor="snippet-title" className="block text-xs font-semibold text-slate-400 mb-1">
            Title
          </label>
          <input id="snippet-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Double-checked locking done right" autoFocus />
        </div>
        <div>
          <label htmlFor="snippet-language" className="block text-xs font-semibold text-slate-400 mb-1">
            Language
          </label>
          <select id="snippet-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
            <option value="java">Java</option>
            <option value="text">Text</option>
            <option value="bash">Shell</option>
            <option value="xml">XML</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-1" aria-hidden="true">
            Topic
          </span>
          <TopicSelect track={track} id="snippet-topic" value={topic} onChange={setTopic} label="Snippet topic" />
        </div>
      </div>
      <div>
        <label htmlFor="snippet-code" className="block text-xs font-semibold text-slate-400 mb-1">
          Code
        </label>
        <textarea id="snippet-code" value={code} onChange={(e) => setCode(e.target.value)} rows={8} className={`${inputClass} font-mono`} spellCheck={false} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-white ${focusRing}`}>
          Save snippet
        </button>
        <button type="button" onClick={onDone} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
};

// ── Page ───────────────────────────────────────────────────

const Notebook: React.FC<{ track: Track }> = ({ track }) => {
  const notebook = useNotebook();
  const progress = useProgress();
  const [tab, setTabState] = useState<Tab>(readTab);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [showReviewed, setShowReviewed] = useState(false);
  const [composing, setComposing] = useState<'note' | 'snippet' | null>(null);
  const [bank, setBank] = useState<InterviewQuestion[]>([]);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInterviewBank()
      .then(setBank)
      .catch(() => setBank([]));
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    setComposing(null);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      // Tab choice just won't be remembered.
    }
  };

  const topicOk = (t: string) => topic === 'all' || t === topic || (topic === 'general' && !t);

  const revision = revisionItems(track, notebook, progress, bank).filter((i) => topicOk(i.topic) && matchesFilter(query, i.title, i.context));
  const visibleRevision = revision.filter((i) => showReviewed || i.due);
  const saved = Object.values(notebook.saved)
    .filter((s): s is SavedItem => s.track === track.id && s.kind !== 'question')
    .filter((s) => topicOk(s.topic) && matchesFilter(query, s.title, s.context))
    .sort((a, b) => b.at - a.at);
  const bookmarkedIds = new Set(
    Object.values(notebook.saved)
      .filter((s) => s.track === track.id && s.kind === 'question')
      .map((s) => s.ref),
  );
  const questions = bank.filter((q) => bookmarkedIds.has(q.id) && topicOk(q.topic) && matchesFilter(query, q.title, q.body, q.answer));
  const missingQuestions = Array.from(bookmarkedIds).filter((id) => bank.length > 0 && !bank.some((q) => q.id === id));
  const notes = Object.values(notebook.notes)
    .filter((n) => n.track === track.id && topicOk(n.topic) && matchesFilter(query, n.title, n.body))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const snippets = Object.values(notebook.snippets)
    .filter((s) => s.track === track.id && topicOk(s.topic) && matchesFilter(query, s.title, s.code))
    .sort((a, b) => b.createdAt - a.createdAt);
  const mistakes = Object.entries(progress.answers)
    .filter(([, a]) => a.track === track.id && !a.firstCorrect)
    .map(([k, a]) => ({ key: k, answer: a, loc: findLesson(track, a.lesson) }))
    .filter((m) => topicOk(m.loc?.stage.id ?? '') && matchesFilter(query, m.answer.prompt, m.answer.correct, m.answer.explanation))
    .sort((a, b) => b.answer.at - a.answer.at);
  const mistakesDue = mistakes.filter((m) => !notebook.reviewed[`quiz:${m.key}`]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'revision', label: 'Revision list', count: revision.filter((i) => i.due).length },
    { id: 'saved', label: 'Saved concepts', count: saved.length },
    { id: 'questions', label: 'Questions', count: questions.length },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'snippets', label: 'Snippets', count: snippets.length },
    { id: 'mistakes', label: 'Quiz mistakes', count: mistakesDue.length },
  ];

  const exportBackup = () => {
    const data = { app: 'keshav.dev learning notebook', version: 1, exportedAt: new Date().toISOString(), progress: getProgress(), notebook: getNotebook() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learning-notebook-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded.');
  };

  const importBackup = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const record = parsed as { progress?: unknown; notebook?: unknown };
      if (typeof parsed !== 'object' || parsed === null || (!record.progress && !record.notebook)) throw new Error('not a backup');
      if (!window.confirm('Replace your current progress and notebook in this browser with the backup?')) return;
      if (record.progress) progressActions.replace(sanitizeProgress(record.progress));
      if (record.notebook) notebookActions.replace(sanitizeNotebook(record.notebook));
      setMessage('Backup restored.');
    } catch {
      setMessage('That file is not a notebook backup.');
    }
  };

  const reviewControls = (item: RevisionItem) => (
    <div className="flex flex-wrap gap-2">
      {item.kind === 'question' ? (
        <a href={`${JAVA_HOME}/interview`} onClick={() => openQuestion(track, item.ref)} className={buttonClass}>
          Practise
        </a>
      ) : (
        item.href && (
          <a href={item.href} className={buttonClass}>
            Open lesson
          </a>
        )
      )}
      {item.due ? (
        <button type="button" onClick={() => notebookActions.markReviewed(item.key)} className={`${buttonClass} !text-emerald-300 hover:!border-emerald-500/50`}>
          ✓ Mark reviewed
        </button>
      ) : (
        <button type="button" onClick={() => notebookActions.markReviewed(item.key, false)} className={buttonClass}>
          Reviewed {item.reviewedAt ? formatDate(item.reviewedAt) : ''} · undo
        </button>
      )}
      {item.kind !== 'quiz' && (
        <button
          type="button"
          onClick={() => (item.kind === 'lesson' ? notebookActions.toggleDifficult(track.id, item.ref, false) : notebookActions.toggleRevise(track.id, item.ref, false))}
          className={buttonClass}
        >
          Remove
        </button>
      )}
    </div>
  );

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <JavaSectionNav active="notebook" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'Java', href: JAVA_HOME }, { label: 'Revision notebook' }]} />
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Revision notebook</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">My Java Revision Notebook</h1>
            <p className="text-slate-400 max-w-2xl">
              Your own revision material. Bookmark lessons and section headings, mark lessons as difficult, save code from any example, flag
              interview questions and write notes; missed quiz questions are collected automatically. Everything is stored in this browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportBackup} className={buttonClass}>
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
            <span className="sr-only">Search your notebook</span>
            <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved concepts, notes, snippets and questions"
              className={`${inputClass} pl-9`}
            />
          </label>
          <TopicSelect track={track} id="notebook-topic" value={topic} onChange={setTopic} includeAll label="Filter by topic" />
        </div>

        <div role="tablist" aria-label="Notebook sections" className="flex gap-1 overflow-x-auto border-b border-slate-800 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 ${
                tab === t.id ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? 'bg-sky-500/20 text-sky-200' : 'bg-slate-800 text-slate-400'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'revision' && (
            <section aria-label="Revision list" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">
                  Difficult lessons, interview questions marked for revision (or rated “missed”), and quiz questions you got wrong on the first
                  try. Mark each one reviewed when you have gone over it again.
                </p>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} className="accent-sky-500" />
                  Show reviewed
                </label>
              </div>
              {visibleRevision.length === 0 ? (
                <Empty>
                  {revision.length > 0
                    ? 'Everything here has been reviewed. Tick “Show reviewed” to see it again.'
                    : 'Nothing to revise yet. Use “Mark as difficult” on a lesson or “Mark for revision” on an interview question.'}
                </Empty>
              ) : (
                <ul className="space-y-3">
                  {visibleRevision.map((item) => (
                    <li key={item.key} className={`rounded-xl border p-4 ${item.due ? 'border-slate-700/80 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40 opacity-80'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Chip className={item.kind === 'lesson' ? '!text-amber-300 !border-amber-500/30 !bg-amber-500/10' : item.kind === 'quiz' ? '!text-rose-300 !border-rose-500/30 !bg-rose-500/10' : '!text-violet-300 !border-violet-500/30 !bg-violet-500/10'}>
                              {KIND_LABEL[item.kind]}
                            </Chip>
                            <span className="text-xs text-slate-500">{item.context}</span>
                          </div>
                          <p className="font-semibold text-slate-100">
                            <MarkdownInline text={item.title} />
                          </p>
                        </div>
                        {reviewControls(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'saved' && (
            <section aria-label="Saved concepts">
              <p className="text-sm text-slate-400 mb-3">
                Lessons you bookmarked, and section headings you saved with the bookmark icon next to each heading in a lesson.
              </p>
              {saved.length === 0 ? (
                <Empty>No saved concepts{query || topic !== 'all' ? ' match these filters' : ' yet'}. Use “Bookmark lesson”, or hover a section heading and click its bookmark.</Empty>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-3">
                  {saved.map((item) => {
                    const [slug, heading] = item.ref.split('#');
                    return (
                      <li key={`${item.kind}-${item.ref}`} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <BookmarkIcon filled className="h-4 w-4 text-sky-300 flex-shrink-0" />
                          <span className="text-xs text-slate-500">{item.kind === 'lesson' ? 'Lesson' : `Section of ${item.context}`}</span>
                        </div>
                        <p className="font-semibold text-slate-100 flex-1">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.kind === 'lesson' ? item.context : topicLabel(track, item.topic)} · saved {formatDate(item.at)}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <a
                            href={lessonHref(track, slug)}
                            onClick={() => heading && setJumpTarget(`lesson:${track.id}:${slug}#${heading}`)}
                            className={buttonClass}
                          >
                            {heading ? 'Open section' : 'Open lesson'}
                          </a>
                          <button type="button" onClick={() => notebookActions.toggleSaved(item, false)} className={buttonClass}>
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === 'questions' && (
            <section aria-label="Bookmarked questions" className="space-y-3">
              <p className="text-sm text-slate-400">
                Interview questions you bookmarked. Open one to practise it again right here, or browse the{' '}
                <a href={`${JAVA_HOME}/interview/tricky`} className="text-sky-400 hover:underline">
                  tricky questions
                </a>
                .
              </p>
              {questions.length === 0 ? (
                <Empty>No bookmarked questions{query || topic !== 'all' ? ' match these filters' : ' yet'}. Use “Bookmark” on any question in Interview prep.</Empty>
              ) : (
                questions.map((q) => <QuestionCard key={q.id} track={track} question={q} />)
              )}
              {missingQuestions.length > 0 && <p className="text-xs text-slate-500">{missingQuestions.length} bookmarked question(s) no longer exist in the bank.</p>}
            </section>
          )}

          {tab === 'notes' && (
            <section aria-label="Notes" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Free-form notes and the notes you wrote at the bottom of lessons.</p>
                {composing !== 'note' && (
                  <button type="button" onClick={() => setComposing('note')} className={`${buttonClass} !text-sky-300 !border-sky-500/40`}>
                    <NoteIcon className="h-3.5 w-3.5" /> New note
                  </button>
                )}
              </div>
              {composing === 'note' && <NoteEditor track={track} onDone={() => setComposing(null)} />}
              {notes.length === 0 && composing !== 'note' ? (
                <Empty>No notes{query || topic !== 'all' ? ' match these filters' : ' yet'}. Write one here, or use “My notes” at the end of any lesson.</Empty>
              ) : (
                notes.map((n) => <NoteCard key={n.id} track={track} note={n} />)
              )}
            </section>
          )}

          {tab === 'snippets' && (
            <section aria-label="Code snippets" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Code you saved with the “Save” button on lesson examples, or added yourself.</p>
                {composing !== 'snippet' && (
                  <button type="button" onClick={() => setComposing('snippet')} className={`${buttonClass} !text-sky-300 !border-sky-500/40`}>
                    + Add snippet
                  </button>
                )}
              </div>
              {composing === 'snippet' && <SnippetForm track={track} onDone={() => setComposing(null)} />}
              {snippets.length === 0 && composing !== 'snippet' ? (
                <Empty>No snippets{query || topic !== 'all' ? ' match these filters' : ' yet'}. Click “Save” on any code block in a lesson.</Empty>
              ) : (
                snippets.map((s) => {
                  const lesson = s.lesson ? findLesson(track, s.lesson)?.lesson : undefined;
                  return (
                    <article key={s.id} className="rounded-xl border border-slate-700/80 bg-slate-800/30 px-4 pt-3 pb-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-100">{s.title}</h3>
                          <p className="text-xs text-slate-500">
                            {topicLabel(track, s.topic)} · saved {formatDate(s.createdAt)}
                            {lesson && (
                              <>
                                {' · '}
                                <a href={lessonHref(track, lesson.slug)} className="text-sky-400 hover:underline">
                                  from {lesson.title}
                                </a>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete the snippet “${s.title}”?`)) notebookActions.deleteSnippet(s.id);
                          }}
                          className={`${buttonClass} hover:!text-rose-300 hover:!border-rose-500/50`}
                        >
                          Delete
                        </button>
                      </div>
                      <CodeBlock code={s.code} language={s.language} title={s.language === 'java' ? 'Java' : undefined} />
                    </article>
                  );
                })
              )}
            </section>
          )}

          {tab === 'mistakes' && (
            <section aria-label="Quiz mistakes" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Knowledge-check questions you answered wrongly on your first try, with the right answer and why.</p>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} className="accent-sky-500" />
                  Show reviewed
                </label>
              </div>
              {mistakes.filter((m) => showReviewed || !notebook.reviewed[`quiz:${m.key}`]).length === 0 ? (
                <Empty>{mistakes.length > 0 ? 'All mistakes reviewed. Tick “Show reviewed” to see them again.' : 'No quiz mistakes recorded. Nice — or take a knowledge check.'}</Empty>
              ) : (
                mistakes
                  .filter((m) => showReviewed || !notebook.reviewed[`quiz:${m.key}`])
                  .map(({ key, answer, loc }) => {
                    const reviewedAt = notebook.reviewed[`quiz:${key}`];
                    return (
                      <article key={key} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 sm:p-5">
                        <p className="text-xs text-slate-500 mb-1">
                          {loc ? (
                            <a href={lessonHref(track, loc.lesson.slug)} className="text-sky-400 hover:underline">
                              {loc.lesson.title}
                            </a>
                          ) : (
                            'Knowledge check'
                          )}{' '}
                          · {answer.attempts} attempt{answer.attempts === 1 ? '' : 's'}
                          {answer.solved ? ' · solved later' : ''}
                        </p>
                        <h3 className="font-semibold text-slate-100 mb-3">
                          <MarkdownInline text={answer.prompt} />
                        </h3>
                        <dl className="grid gap-2 text-sm">
                          {answer.lastWrong && (
                            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                              <dt className="text-xs font-semibold text-rose-300">✗ Your answer</dt>
                              <dd className="text-slate-200">
                                <MarkdownInline text={answer.lastWrong} />
                              </dd>
                            </div>
                          )}
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                            <dt className="text-xs font-semibold text-emerald-300">✓ Correct answer</dt>
                            <dd className="text-slate-200">
                              <MarkdownInline text={answer.correct} />
                            </dd>
                          </div>
                          {answer.explanation && (
                            <div className="px-3 py-1">
                              <dt className="text-xs font-semibold text-slate-400">Why</dt>
                              <dd className="text-slate-300">
                                <MarkdownInline text={answer.explanation} />
                              </dd>
                            </div>
                          )}
                        </dl>
                        <div className="mt-3">
                          {reviewedAt ? (
                            <button type="button" onClick={() => notebookActions.markReviewed(`quiz:${key}`, false)} className={buttonClass}>
                              Reviewed {formatDate(reviewedAt)} · undo
                            </button>
                          ) : (
                            <button type="button" onClick={() => notebookActions.markReviewed(`quiz:${key}`)} className={`${buttonClass} !text-emerald-300`}>
                              ✓ Mark reviewed
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
              )}
            </section>
          )}
        </div>

        <p className="mt-10 text-xs text-slate-500 flex items-center gap-1.5">
          <FlagIcon className="h-3.5 w-3.5" /> Stored in this browser only (no account needed). Use “Export backup” to move it to another browser.
        </p>
      </div>
    </main>
  );
};

export default Notebook;
