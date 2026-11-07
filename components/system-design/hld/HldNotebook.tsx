import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Track } from '../../../content/shared/types';
import { findLesson } from '../../../content/shared/curriculum';
import MarkdownContent from '../../learn/MarkdownContent';
import { downloadBackup, restoreBackup } from '../../learn/backup';
import { itemKey, NoteKind, notebookActions, SavedItem, Snippet, useNotebook } from '../../learn/notebook';
import { buttonClass, Empty, formatDate, inputClass, NoteCard, NoteEditor, NoteKindOption, TopicOption, TopicSelect } from '../../learn/notebookParts';
import { problemStatus, useProgress } from '../../learn/progress';
import { sessionKey, useInterviews } from '../../learn/interviews';
import { lessonHref, problemHref } from '../../learn/routes';
import { matchesFilter } from '../../learn/search';
import { setJumpTarget } from '../../learn/jump';
import { BookmarkIcon, Breadcrumbs, Chip, FlagIcon, NoteIcon, SearchIcon, StatusBadge, focusRing } from '../../learn/ui';
import { STARTER_DIAGRAM } from '../../learn/widgets/DiagramEditor';
import { ROOT_HREF } from '../routes';
import HldSectionNav from './HldSectionNav';
import { revisitRef } from './ProblemExtras';
import { HldRevisionItem, hldRevisionItems } from './revision';

const MermaidDiagram = lazy(() => import('../../learn/widgets/MermaidDiagram'));
const DiagramEditor = lazy(() => import('../../learn/widgets/DiagramEditor'));

type Tab = 'revision' | 'saved' | 'diagrams' | 'questions' | 'notes' | 'problems' | 'mistakes';
const TABS: Tab[] = ['revision', 'saved', 'diagrams', 'questions', 'notes', 'problems', 'mistakes'];
const TAB_KEY = 'hld-notebook-tab';

const readTab = (): Tab => {
  try {
    const t = window.localStorage.getItem(TAB_KEY) as Tab | null;
    return t && TABS.includes(t) ? t : 'revision';
  } catch {
    return 'revision';
  }
};

export const NOTE_KINDS: NoteKindOption[] = [
  { id: 'note', label: 'Note' },
  {
    id: 'tradeoff',
    label: 'Trade-off',
    template: '**Decision:** …\n\n**Option A:** … — choose it when …\n\n**Option B:** … — choose it when …\n\n**What I’d say in the interview:** …',
  },
  {
    id: 'formula',
    label: 'Formula',
    template: '**Formula:** `requests per day ÷ 86,400 ≈ requests per second`\n\n**Worked example:** …\n\n**Watch out for:** …',
  },
  {
    id: 'mistake',
    label: 'Common mistake',
    template: '**What I did:** …\n\n**Why it’s wrong:** …\n\n**Do this instead:** …',
  },
];

const KIND_CHIP: Record<NoteKind, string> = {
  note: '!text-slate-300',
  tradeoff: '!text-sky-300 !border-sky-500/30 !bg-sky-500/10',
  formula: '!text-emerald-300 !border-emerald-500/30 !bg-emerald-500/10',
  mistake: '!text-rose-300 !border-rose-500/30 !bg-rose-500/10',
};

const REVISION_LABEL: Record<HldRevisionItem['kind'], { label: string; classes: string }> = {
  lesson: { label: 'Difficult lesson', classes: '!text-amber-300 !border-amber-500/30 !bg-amber-500/10' },
  problem: { label: 'Problem to revisit', classes: '!text-violet-300 !border-violet-500/30 !bg-violet-500/10' },
  quiz: { label: 'Quiz mistake', classes: '!text-rose-300 !border-rose-500/30 !bg-rose-500/10' },
  mock: { label: 'Mock interview gap', classes: '!text-sky-300 !border-sky-500/30 !bg-sky-500/10' },
};

const useTopics = (track: Track): TopicOption[] =>
  useMemo(
    () => [
      ...track.stages.map((s) => ({ id: s.id, label: `Stage ${s.number}: ${s.title}`, group: 'Curriculum' })),
      { id: 'problems', label: 'Practice problems', group: 'Practice' },
      { id: 'general', label: 'General', group: 'Other' },
    ],
    [track],
  );

const topicLabel = (track: Track, id: string) => {
  const stage = track.stages.find((s) => s.id === id);
  if (stage) return `Stage ${stage.number}: ${stage.title}`;
  if (id === 'problems') return 'Practice problems';
  return 'General';
};

const Inline: React.FC<{ track: Track; text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <>{children}</>,
      code: ({ children }) => <code className="font-mono text-[0.9em] text-sky-300 bg-slate-800/80 px-1 py-0.5 rounded">{children}</code>,
    }}
  >
    {text}
  </ReactMarkdown>
);

// ── Diagrams ───────────────────────────────────────────────

const DiagramForm: React.FC<{ track: Track; topics: TopicOption[]; snippet?: Snippet; onDone: () => void }> = ({ track, topics, snippet, onDone }) => {
  const [title, setTitle] = useState(snippet?.title ?? '');
  const [code, setCode] = useState(snippet?.code ?? STARTER_DIAGRAM);
  const [topic, setTopic] = useState(snippet?.topic ?? 'general');
  const idBase = snippet?.id ?? 'new';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        if (snippet) notebookActions.updateSnippet(snippet.id, { title: title.trim() || 'Untitled diagram', code, topic });
        else notebookActions.addSnippet({ track: track.id, title: title.trim() || 'Untitled diagram', code, language: 'mermaid', topic });
        onDone();
      }}
      className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div>
          <label htmlFor={`diagram-title-${idBase}`} className="block text-xs font-semibold text-slate-400 mb-1">
            Title
          </label>
          <input id={`diagram-title-${idBase}`} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Cache-aside read path" autoFocus />
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-1" aria-hidden="true">
            Topic
          </span>
          <TopicSelect topics={topics} id={`diagram-topic-${idBase}`} value={topic} onChange={setTopic} label="Diagram topic" />
        </div>
      </div>
      <Suspense fallback={<div className="min-h-[12rem]" />}>
        <DiagramEditor value={code} onChange={setCode} label="Diagram (Mermaid)" rows={10} />
      </Suspense>
      <div className="flex gap-2">
        <button type="submit" className={`rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-white ${focusRing}`}>
          Save diagram
        </button>
        <button type="button" onClick={onDone} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
};

const DiagramCard: React.FC<{ track: Track; topics: TopicOption[]; snippet: Snippet }> = ({ track, topics, snippet }) => {
  const [editing, setEditing] = useState(false);
  const lesson = snippet.lesson ? findLesson(track, snippet.lesson)?.lesson : undefined;
  if (editing) return <DiagramForm track={track} topics={topics} snippet={snippet} onDone={() => setEditing(false)} />;
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-100">{snippet.title}</h3>
          <p className="text-xs text-slate-400">
            {topicLabel(track, snippet.topic)} · saved {formatDate(snippet.createdAt)}
            {(snippet.href || lesson) && (
              <>
                {' · '}
                <a href={snippet.href ?? lessonHref(track, lesson!.slug)} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
                  open source page
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
              if (window.confirm(`Delete the diagram “${snippet.title}”?`)) notebookActions.deleteSnippet(snippet.id);
            }}
            className={`${buttonClass} hover:!text-rose-300 hover:!border-rose-500/50`}
          >
            Delete
          </button>
        </div>
      </div>
      <Suspense fallback={<div className="min-h-[8rem]" />}>
        <MermaidDiagram source={snippet.code} title={snippet.title} />
      </Suspense>
    </article>
  );
};

// ── Page ───────────────────────────────────────────────────

const HldNotebook: React.FC<{ track: Track }> = ({ track }) => {
  const notebook = useNotebook();
  const progress = useProgress();
  const interviews = useInterviews();
  const topics = useTopics(track);
  const [tab, setTabState] = useState<Tab>(readTab);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [kind, setKind] = useState<NoteKind | 'all'>('all');
  const [showReviewed, setShowReviewed] = useState(false);
  const [composing, setComposing] = useState<'note' | 'diagram' | null>(null);
  const [newKind, setNewKind] = useState<NoteKind>('note');
  const [message, setMessage] = useState('');
  const [addProblem, setAddProblem] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

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
  const mine = <T extends { track: string }>(values: T[]) => values.filter((v) => v.track === track.id);

  const revision = hldRevisionItems(track, notebook, progress, interviews).filter((i) => topicOk(i.topic) && matchesFilter(query, i.title, i.context));
  const visibleRevision = revision.filter((i) => showReviewed || i.due);
  const saved = mine(Object.values(notebook.saved))
    .filter((s): s is SavedItem => s.kind !== 'question')
    .filter((s) => topicOk(s.topic) && matchesFilter(query, s.title, s.context))
    .sort((a, b) => b.at - a.at);
  const questions = mine(Object.values(notebook.saved))
    .filter((s) => s.kind === 'question')
    .filter((s) => topicOk(s.topic) && matchesFilter(query, s.title, s.context, s.body))
    .sort((a, b) => b.at - a.at);
  const diagrams = mine(Object.values(notebook.snippets))
    .filter((s) => s.language === 'mermaid' && topicOk(s.topic) && matchesFilter(query, s.title, s.code))
    .sort((a, b) => b.createdAt - a.createdAt);
  const notes = mine(Object.values(notebook.notes))
    .filter((n) => topicOk(n.topic) && (kind === 'all' || (n.kind ?? 'note') === kind) && matchesFilter(query, n.title, n.body))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const revisit = track.problems.filter((p) => notebook.revise[itemKey(track.id, revisitRef(p.slug))] && matchesFilter(query, p.title, p.summary, ...p.tags));
  const mistakes = Object.entries(progress.answers)
    .filter(([, a]) => a.track === track.id && !a.firstCorrect)
    .map(([k, a]) => ({ key: k, answer: a, loc: findLesson(track, a.lesson) }))
    .filter((m) => topicOk(m.loc?.stage.id ?? '') && matchesFilter(query, m.answer.prompt, m.answer.correct, m.answer.explanation))
    .sort((a, b) => b.answer.at - a.answer.at);
  const visibleMistakes = mistakes.filter((m) => showReviewed || !notebook.reviewed[`quiz:${m.key}`]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'revision', label: 'Revision list', count: revision.filter((i) => i.due).length },
    { id: 'saved', label: 'Saved concepts', count: saved.length },
    { id: 'diagrams', label: 'Diagrams', count: diagrams.length },
    { id: 'questions', label: 'Questions', count: questions.length },
    { id: 'notes', label: 'Notes & trade-offs', count: notes.length },
    { id: 'problems', label: 'Problems to revisit', count: revisit.length },
    { id: 'mistakes', label: 'Quiz mistakes', count: mistakes.filter((m) => !notebook.reviewed[`quiz:${m.key}`]).length },
  ];

  /** Arrow keys, Home and End move between tabs (ARIA tabs pattern); only the selected tab is a tab stop. */
  const onTabKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number | undefined>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const importBackup = async (file: File) => {
    const result = await restoreBackup(file);
    if (result === 'restored') setMessage('Backup restored.');
    else if (result === 'invalid') setMessage('That file is not a notebook backup.');
  };
  const filtered = query !== '' || topic !== 'all';

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <HldSectionNav active="notebook" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Revision notebook' }]} />
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold text-sky-400 mb-2">Revision notebook</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">My HLD Revision Notebook</h1>
            <p className="text-slate-400 max-w-2xl">
              Bookmarked lessons and sections, saved diagrams and interview questions, your notes, trade-offs, formulas and mistakes, and the
              problems you want to revisit. Difficult lessons, missed quiz answers and weak mock-interview areas are collected automatically.
              Everything is stored in this browser.
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
            <span className="sr-only">Search your notebook</span>
            <SearchIcon className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search everything you saved" className={`${inputClass} pl-9`} />
          </label>
          <TopicSelect topics={topics} id="hld-notebook-topic" value={topic} onChange={setTopic} includeAll label="Filter by topic" />
        </div>

        <div role="tablist" aria-label="Notebook sections" onKeyDown={onTabKeys} className="flex gap-1 overflow-x-auto border-b border-slate-800 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
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
          <h2 className="sr-only">{tabs.find((t) => t.id === tab)?.label}</h2>
          {tab === 'revision' && (
            <section aria-label="Revision list" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Difficult lessons, problems to revisit, quiz mistakes and mock-interview gaps. Mark each reviewed when you have gone over it.</p>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} className="accent-sky-500" />
                  Show reviewed
                </label>
              </div>
              {visibleRevision.length === 0 ? (
                <Empty>
                  {revision.length > 0
                    ? 'Everything here has been reviewed. Tick “Show reviewed” to see it again.'
                    : 'Nothing to revise yet. Mark a lesson as difficult, flag a problem to revisit, or finish a mock interview.'}
                </Empty>
              ) : (
                <ul className="space-y-3">
                  {visibleRevision.map((item) => (
                    <li key={item.key} className={`rounded-xl border p-4 ${item.due ? 'border-slate-700/80 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40 opacity-80'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Chip className={REVISION_LABEL[item.kind].classes}>{REVISION_LABEL[item.kind].label}</Chip>
                            <span className="text-xs text-slate-400">{item.context}</span>
                          </div>
                          <p className="font-semibold text-slate-100">
                            <Inline track={track} text={item.title} />
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.href && (
                            <a href={item.href} className={buttonClass}>
                              Open
                            </a>
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
                          {item.kind === 'lesson' && item.ref && (
                            <button type="button" onClick={() => notebookActions.toggleDifficult(track.id, item.ref!, false)} className={buttonClass}>
                              Remove
                            </button>
                          )}
                          {item.kind === 'problem' && item.ref && (
                            <button type="button" onClick={() => notebookActions.toggleRevise(track.id, revisitRef(item.ref!), false)} className={buttonClass}>
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'saved' && (
            <section aria-label="Saved concepts">
              <p className="text-sm text-slate-400 mb-3">Lessons you bookmarked, and section headings saved with the bookmark next to each heading.</p>
              {saved.length === 0 ? (
                <Empty>No saved concepts{filtered ? ' match these filters' : ' yet'}. Use “Bookmark lesson”, or hover a section heading and click its bookmark.</Empty>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-3">
                  {saved.map((item) => {
                    const [slug, heading] = item.ref.split('#');
                    return (
                      <li key={`${item.kind}-${item.ref}`} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <BookmarkIcon filled className="h-4 w-4 text-sky-300 flex-shrink-0" />
                          <span className="text-xs text-slate-400">{item.kind === 'lesson' ? 'Lesson' : `Section of ${item.context}`}</span>
                        </div>
                        <p className="font-semibold text-slate-100 flex-1">{item.title}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {item.kind === 'lesson' ? item.context : topicLabel(track, item.topic)} · saved {formatDate(item.at)}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <a href={lessonHref(track, slug)} onClick={() => heading && setJumpTarget(`lesson:${track.id}:${slug}#${heading}`)} className={buttonClass}>
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

          {tab === 'diagrams' && (
            <section aria-label="Diagrams" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Diagrams saved from lessons and problems, and ones you drew yourself.</p>
                {composing !== 'diagram' && (
                  <button type="button" onClick={() => setComposing('diagram')} className={`${buttonClass} !text-sky-300 !border-sky-500/40`}>
                    + New diagram
                  </button>
                )}
              </div>
              {composing === 'diagram' && <DiagramForm track={track} topics={topics} onDone={() => setComposing(null)} />}
              {diagrams.length === 0 && composing !== 'diagram' ? (
                <Empty>No diagrams{filtered ? ' match these filters' : ' yet'}. Click “Save” on any diagram in a lesson, or draw one here.</Empty>
              ) : (
                diagrams.map((s) => <DiagramCard key={s.id} track={track} topics={topics} snippet={s} />)
              )}
            </section>
          )}

          {tab === 'questions' && (
            <section aria-label="Saved interview questions" className="space-y-3">
              <p className="text-sm text-slate-400">Interview questions saved with the bookmark on any question in a lesson, problem or mock interview. Answer before opening.</p>
              {questions.length === 0 ? (
                <Empty>No saved questions{filtered ? ' match these filters' : ' yet'}.</Empty>
              ) : (
                questions.map((q) => (
                  <article key={q.ref} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        {q.context} · saved {formatDate(q.at)}
                        {q.href && (
                          <>
                            {' · '}
                            <a href={q.href} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
                              open source page
                            </a>
                          </>
                        )}
                      </p>
                      <button type="button" onClick={() => notebookActions.toggleSaved(q, false)} className={buttonClass}>
                        Remove
                      </button>
                    </div>
                    <MarkdownContent markdown={`\`\`\`\`reveal title="${q.title.replace(/"/g, "'")}"\n${q.body ?? ''}\n\`\`\`\``} basePath={track.basePath} />
                  </article>
                ))
              )}
            </section>
          )}

          {tab === 'notes' && (
            <section aria-label="Notes" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter notes by kind">
                  {(['all', ...NOTE_KINDS.map((k) => k.id)] as (NoteKind | 'all')[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${focusRing} ${kind === k ? 'bg-sky-500/15 border-sky-500/50 text-sky-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      {k === 'all' ? 'All' : NOTE_KINDS.find((n) => n.id === k)?.label}
                    </button>
                  ))}
                </div>
                {composing !== 'note' && (
                  <span className="flex flex-wrap gap-1.5">
                    {NOTE_KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => {
                          setNewKind(k.id);
                          setComposing('note');
                        }}
                        className={`${buttonClass} !text-sky-300 !border-sky-500/40`}
                      >
                        <NoteIcon className="h-3.5 w-3.5" /> New {k.label.toLowerCase()}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              {composing === 'note' && (
                <NoteEditor
                  key={newKind}
                  track={track}
                  topics={topics}
                  kinds={NOTE_KINDS}
                  initialKind={newKind}
                  onDone={() => setComposing(null)}
                  titlePlaceholder="e.g. Fan-out on write vs read"
                  bodyLabel="Note (Markdown supported, including ```mermaid diagrams)"
                />
              )}
              {notes.length === 0 && composing !== 'note' ? (
                <Empty>No notes{filtered || kind !== 'all' ? ' match these filters' : ' yet'}. Record a trade-off, a formula or a mistake you don’t want to repeat.</Empty>
              ) : (
                notes.map((n) => (
                  <NoteCard
                    key={n.id}
                    track={track}
                    topics={topics}
                    note={n}
                    kinds={NOTE_KINDS}
                    topicLabel={(id) => topicLabel(track, id)}
                    badge={<Chip className={`mr-2 align-middle ${KIND_CHIP[n.kind ?? 'note']}`}>{NOTE_KINDS.find((k) => k.id === (n.kind ?? 'note'))?.label}</Chip>}
                  />
                ))
              )}
            </section>
          )}

          {tab === 'problems' && (
            <section aria-label="Problems to revisit" className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Problems you flagged with “Revisit later”. Redo them as mock interviews until they feel routine.</p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (addProblem) notebookActions.toggleRevise(track.id, revisitRef(addProblem), true);
                    setAddProblem('');
                  }}
                >
                  <label htmlFor="add-revisit" className="sr-only">
                    Add a problem to revisit
                  </label>
                  <select id="add-revisit" value={addProblem} onChange={(e) => setAddProblem(e.target.value)} className={`${inputClass} sm:w-56`}>
                    <option value="">Add a problem…</option>
                    {track.problems
                      .filter((p) => !notebook.revise[itemKey(track.id, revisitRef(p.slug))])
                      .map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.title}
                        </option>
                      ))}
                  </select>
                  <button type="submit" disabled={!addProblem} className={buttonClass}>
                    Add
                  </button>
                </form>
              </div>
              {revisit.length === 0 ? (
                <Empty>No problems flagged{query ? ' match this search' : ' yet'}. Use “Revisit later” on a problem page, or add one above.</Empty>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-3">
                  {revisit.map((p) => {
                    const attempts = interviews.history[sessionKey(track.id, p.slug)] ?? [];
                    const last = attempts[attempts.length - 1];
                    return (
                      <li key={p.slug} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <a href={problemHref(track, p.slug)} className="font-semibold text-slate-100 hover:text-sky-300">
                            {p.title}
                          </a>
                          <StatusBadge status={problemStatus(progress, track.id, p.slug)} />
                        </div>
                        <p className="text-xs text-slate-400 flex-1">{last ? `Last mock: ${last.score}% on ${formatDate(last.completedAt)}` : 'No mock interview yet'}</p>
                        <div className="mt-3 flex gap-2">
                          <a href={problemHref(track, p.slug)} className={buttonClass}>
                            Open
                          </a>
                          <button type="button" onClick={() => notebookActions.toggleRevise(track.id, revisitRef(p.slug), false)} className={buttonClass}>
                            <FlagIcon className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === 'mistakes' && (
            <section aria-label="Quiz mistakes" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-400">Knowledge-check and drill questions you got wrong on the first try, with the right answer and why.</p>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} className="accent-sky-500" />
                  Show reviewed
                </label>
              </div>
              {visibleMistakes.length === 0 ? (
                <Empty>{mistakes.length > 0 ? 'All mistakes reviewed. Tick “Show reviewed” to see them again.' : 'No quiz mistakes recorded yet.'}</Empty>
              ) : (
                visibleMistakes.map(({ key, answer, loc }) => {
                  const reviewedAt = notebook.reviewed[`quiz:${key}`];
                  return (
                    <article key={key} className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-4 sm:p-5">
                      <p className="text-xs text-slate-400 mb-1">
                        {loc ? (
                          <a href={lessonHref(track, loc.lesson.slug)} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
                            {loc.lesson.title}
                          </a>
                        ) : (
                          'Knowledge check'
                        )}{' '}
                        · {answer.attempts} attempt{answer.attempts === 1 ? '' : 's'}
                        {answer.solved ? ' · solved later' : ''}
                      </p>
                      <h3 className="font-semibold text-slate-100 mb-3">
                        <Inline track={track} text={answer.prompt} />
                      </h3>
                      <dl className="grid gap-2 text-sm">
                        {answer.lastWrong && (
                          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                            <dt className="text-xs font-semibold text-rose-300">✗ Your answer</dt>
                            <dd className="text-slate-200">
                              <Inline track={track} text={answer.lastWrong} />
                            </dd>
                          </div>
                        )}
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                          <dt className="text-xs font-semibold text-emerald-300">✓ Correct answer</dt>
                          <dd className="text-slate-200">
                            <Inline track={track} text={answer.correct} />
                          </dd>
                        </div>
                        {answer.explanation && (
                          <div className="px-3 py-1">
                            <dt className="text-xs font-semibold text-slate-400">Why</dt>
                            <dd className="text-slate-300">
                              <Inline track={track} text={answer.explanation} />
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

        <p className="mt-10 text-xs text-slate-400 flex items-center gap-1.5">
          <FlagIcon className="h-3.5 w-3.5" /> Stored in this browser only (no account needed). The backup file includes every section of the site.
        </p>
      </div>
    </main>
  );
};

export default HldNotebook;
