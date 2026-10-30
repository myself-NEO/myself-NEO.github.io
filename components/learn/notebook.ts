import { useSyncExternalStore } from 'react';
import { TrackId } from '../../content/shared/types';
import { createStore } from './store';

// The learner's own revision material: saved concepts, flags, interview-question
// tracking, notes and code snippets. Like progress, it lives in this browser only;
// the notebook page can export it to a file and import it back.

const STORAGE_KEY = 'learning-notebook-v1';

export type SavedKind = 'lesson' | 'section' | 'question';

export interface SavedItem {
  kind: SavedKind;
  track: TrackId;
  /** lesson slug, `${lesson}#${headingId}`, or question id */
  ref: string;
  title: string;
  /** Where it came from: the lesson title for a section, the topic title for a question. */
  context: string;
  /** Stage id (lessons, sections) or interview topic id (questions), for filtering. */
  topic: string;
  at: number;
}

export interface Note {
  id: string;
  track: TrackId;
  title: string;
  body: string;
  topic: string;
  /** Set for the note attached to a lesson page. */
  lesson?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Snippet {
  id: string;
  track: TrackId;
  title: string;
  code: string;
  language: string;
  topic: string;
  lesson?: string;
  createdAt: number;
}

export type SelfRating = 'got-it' | 'partial' | 'missed';

export interface QuestionProgress {
  /** The learner's own attempt, typed before revealing the answer. */
  draft?: string;
  /** Number of hints shown. */
  hints?: number;
  revealedAt?: number;
  rating?: SelfRating;
  ratedAt?: number;
}

export interface NotebookState {
  /** savedKey(...) → item */
  saved: Record<string, SavedItem>;
  /** `${track}:${lesson}` → when it was marked difficult */
  difficult: Record<string, number>;
  /** `${track}:${questionId}` → when it was marked for revision */
  revise: Record<string, number>;
  /** `${track}:${questionId}` → attempt and self-assessment */
  questions: Record<string, QuestionProgress>;
  notes: Record<string, Note>;
  snippets: Record<string, Snippet>;
  /** revision-list item key → when it was last reviewed */
  reviewed: Record<string, number>;
}

const EMPTY: NotebookState = { saved: {}, difficult: {}, revise: {}, questions: {}, notes: {}, snippets: {}, reviewed: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeNotebook = (parsed: unknown): NotebookState => {
  if (!isRecord(parsed)) return EMPTY;
  const field = <T,>(name: keyof NotebookState) => (isRecord(parsed[name]) ? parsed[name] : {}) as Record<string, T>;
  return {
    saved: field('saved'),
    difficult: field('difficult'),
    revise: field('revise'),
    questions: field('questions'),
    notes: field('notes'),
    snippets: field('snippets'),
    reviewed: field('reviewed'),
  };
};

const store = createStore<NotebookState>({ key: STORAGE_KEY, empty: EMPTY, sanitize: sanitizeNotebook });

export const useNotebook = () => useSyncExternalStore(store.subscribe, store.get, store.get);
export const getNotebook = store.get;

export const savedKey = (kind: SavedKind, track: TrackId, ref: string) => `${kind}:${track}:${ref}`;
export const itemKey = (track: TrackId, ref: string) => `${track}:${ref}`;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const without = <T,>(record: Record<string, T>, k: string) => {
  const { [k]: _removed, ...rest } = record;
  return rest;
};

const update = (change: (state: NotebookState) => Partial<NotebookState>) => {
  const state = store.get();
  store.set({ ...state, ...change(state) });
};

const toggleTimestamp = (record: Record<string, number>, k: string, on?: boolean) => {
  const next = on ?? !record[k];
  return next ? { ...record, [k]: Date.now() } : without(record, k);
};

export const notebookActions = {
  toggleSaved(item: Omit<SavedItem, 'at'>, on?: boolean) {
    update((s) => {
      const k = savedKey(item.kind, item.track, item.ref);
      const next = on ?? !s.saved[k];
      return { saved: next ? { ...s.saved, [k]: { ...item, at: Date.now() } } : without(s.saved, k) };
    });
  },
  toggleDifficult(track: TrackId, lesson: string, on?: boolean) {
    update((s) => ({ difficult: toggleTimestamp(s.difficult, itemKey(track, lesson), on) }));
  },
  toggleRevise(track: TrackId, questionId: string, on?: boolean) {
    update((s) => ({ revise: toggleTimestamp(s.revise, itemKey(track, questionId), on) }));
  },
  updateQuestion(track: TrackId, questionId: string, change: Partial<QuestionProgress>) {
    update((s) => {
      const k = itemKey(track, questionId);
      return { questions: { ...s.questions, [k]: { ...s.questions[k], ...change } } };
    });
  },
  rateQuestion(track: TrackId, questionId: string, rating: SelfRating) {
    update((s) => {
      const k = itemKey(track, questionId);
      // A missed question goes on the revision list automatically.
      const revise = rating === 'missed' && !s.revise[k] ? { ...s.revise, [k]: Date.now() } : s.revise;
      return { questions: { ...s.questions, [k]: { ...s.questions[k], rating, ratedAt: Date.now() } }, revise };
    });
  },
  saveNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string {
    const id = note.id ?? newId();
    update((s) => {
      const existing = s.notes[id];
      const now = Date.now();
      return { notes: { ...s.notes, [id]: { ...note, id, createdAt: existing?.createdAt ?? now, updatedAt: now } } };
    });
    return id;
  },
  deleteNote(id: string) {
    update((s) => ({ notes: without(s.notes, id) }));
  },
  addSnippet(snippet: Omit<Snippet, 'id' | 'createdAt'>): string {
    const id = newId();
    update((s) => ({ snippets: { ...s.snippets, [id]: { ...snippet, id, createdAt: Date.now() } } }));
    return id;
  },
  deleteSnippet(id: string) {
    update((s) => ({ snippets: without(s.snippets, id) }));
  },
  markReviewed(itemKeyValue: string, on = true) {
    update((s) => ({ reviewed: on ? { ...s.reviewed, [itemKeyValue]: Date.now() } : without(s.reviewed, itemKeyValue) }));
  },
  replace(next: NotebookState) {
    store.set(next);
  },
  /** Removes everything belonging to one track. */
  resetTrack(track: TrackId) {
    const s = store.get();
    const keep = <T,>(record: Record<string, T>, belongs: (k: string, v: T) => boolean) =>
      Object.fromEntries(Object.entries(record).filter(([k, v]) => !belongs(k, v))) as Record<string, T>;
    const prefixed = (k: string) => k.startsWith(`${track}:`);
    store.set({
      saved: keep(s.saved, (_k, v) => v.track === track),
      difficult: keep(s.difficult, prefixed),
      revise: keep(s.revise, prefixed),
      questions: keep(s.questions, prefixed),
      notes: keep(s.notes, (_k, v) => v.track === track),
      snippets: keep(s.snippets, (_k, v) => v.track === track),
      reviewed: keep(s.reviewed, (k) => k.includes(`${track}:`)),
    });
  },
};

export const isSaved = (n: NotebookState, kind: SavedKind, track: TrackId, ref: string) => Boolean(n.saved[savedKey(kind, track, ref)]);
export const lessonNote = (n: NotebookState, track: TrackId, lesson: string) =>
  Object.values(n.notes).find((note) => note.track === track && note.lesson === lesson);
