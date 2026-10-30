import { useSyncExternalStore } from 'react';
import { ProblemStatus, TrackId } from '../../content/shared/types';
import { createStore } from './store';

// Learner progress is kept in this browser only (localStorage). Every read and
// write is guarded so the pages still work when storage is unavailable
// (private windows, blocked site data) — progress simply won't persist.

// Shared by every learning section; entries are namespaced by track id.
const STORAGE_KEY = 'learning-progress-v1';
/** Key used before DSA joined the shared store; read once as a fallback so progress isn't lost. */
const LEGACY_KEY = 'system-design-progress-v1';

/** One knowledge-check question, as the learner has answered it so far. */
export interface QuizAnswerRecord {
  track: TrackId;
  lesson: string;
  prompt: string;
  /** Text of the correct option and the explanation, kept so mistakes can be reviewed later. */
  correct: string;
  explanation: string;
  attempts: number;
  /** Whether the very first choice was right: the basis of quiz accuracy. */
  firstCorrect: boolean;
  solved: boolean;
  /** The most recent wrong choice, if any. */
  lastWrong?: string;
  at: number;
}

export interface ResumePoint {
  slug: string;
  /** id of the section heading the learner last read */
  heading?: string;
  at: number;
}

export interface ProgressState {
  /** `${track}:${slug}` → completion timestamp */
  lessons: Record<string, number>;
  /** `${track}:${slug}` → timestamp the lesson's knowledge check was passed */
  quizzes: Record<string, number>;
  /** `${track}:${slug}` → status (absent means not started) */
  problems: Record<string, ProblemStatus>;
  /** `${track}:${slug}` → last time the lesson was opened (opened but not completed = in progress) */
  visited: Record<string, number>;
  /** track id → the lesson and section the learner was last reading */
  resume: Record<string, ResumePoint>;
  /** `${track}:${lesson}:${question hash}` → answer record */
  answers: Record<string, QuizAnswerRecord>;
}

const EMPTY: ProgressState = { lessons: {}, quizzes: {}, problems: {}, visited: {}, resume: {}, answers: {} };

const key = (track: TrackId, slug: string) => `${track}:${slug}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordField = <T,>(parsed: Record<string, unknown>, field: string) =>
  (isRecord(parsed[field]) ? parsed[field] : {}) as Record<string, T>;

/** Accepts anything JSON-parsed (stored state or an imported backup) and keeps only well-formed parts. */
export const sanitizeProgress = (parsed: unknown): ProgressState => {
  if (!isRecord(parsed)) return EMPTY;
  return {
    lessons: recordField(parsed, 'lessons'),
    quizzes: recordField(parsed, 'quizzes'),
    problems: recordField(parsed, 'problems'),
    visited: recordField(parsed, 'visited'),
    resume: recordField(parsed, 'resume'),
    answers: recordField(parsed, 'answers'),
  };
};

const store = createStore<ProgressState>({
  key: STORAGE_KEY,
  legacyKeys: [LEGACY_KEY],
  empty: EMPTY,
  sanitize: sanitizeProgress,
});

export const useProgress = () => useSyncExternalStore(store.subscribe, store.get, store.get);
export const getProgress = store.get;

const without = <T,>(record: Record<string, T>, k: string) => {
  const { [k]: _removed, ...rest } = record;
  return rest;
};

const withoutTrack = <T,>(record: Record<string, T>, track: TrackId) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith(`${track}:`))) as Record<string, T>;

/** Short stable id for a quiz question, derived from its prompt. */
export const questionHash = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export interface QuizAnswer {
  prompt: string;
  correct: boolean;
  chosen: string;
  correctText: string;
  explanation: string;
}

export const progressActions = {
  setLessonComplete(track: TrackId, slug: string, done: boolean) {
    const state = store.get();
    const k = key(track, slug);
    store.set({ ...state, lessons: done ? { ...state.lessons, [k]: Date.now() } : without(state.lessons, k) });
  },
  markQuizPassed(track: TrackId, slug: string) {
    const state = store.get();
    const k = key(track, slug);
    if (state.quizzes[k]) return;
    store.set({ ...state, quizzes: { ...state.quizzes, [k]: Date.now() } });
  },
  setProblemStatus(track: TrackId, slug: string, status: ProblemStatus) {
    const state = store.get();
    const k = key(track, slug);
    store.set({
      ...state,
      problems: status === 'not-started' ? without(state.problems, k) : { ...state.problems, [k]: status },
    });
  },
  /** Moves a problem from "not started" to "in progress" (used when a hint or solution is opened). */
  markProblemStarted(track: TrackId, slug: string) {
    if (!store.get().problems[key(track, slug)]) this.setProblemStatus(track, slug, 'in-progress');
  },
  /** Records that a lesson was opened, and makes it the track's resume point. */
  markLessonVisited(track: TrackId, slug: string) {
    const state = store.get();
    const now = Date.now();
    const previous = state.resume[track];
    store.set({
      ...state,
      visited: { ...state.visited, [key(track, slug)]: now },
      // Keep the saved section when the learner comes back to the same lesson.
      resume: { ...state.resume, [track]: { slug, heading: previous?.slug === slug ? previous.heading : undefined, at: now } },
    });
  },
  setResumeHeading(track: TrackId, slug: string, heading: string | undefined) {
    const state = store.get();
    const current = state.resume[track];
    if (current?.slug === slug && current.heading === heading) return;
    store.set({ ...state, resume: { ...state.resume, [track]: { slug, heading, at: Date.now() } } });
  },
  recordQuizAnswer(track: TrackId, lesson: string, answer: QuizAnswer) {
    const state = store.get();
    const k = `${key(track, lesson)}:${questionHash(answer.prompt)}`;
    const previous = state.answers[k];
    const record: QuizAnswerRecord = {
      track,
      lesson,
      prompt: answer.prompt,
      correct: answer.correctText,
      explanation: answer.explanation,
      attempts: (previous?.attempts ?? 0) + 1,
      firstCorrect: previous ? previous.firstCorrect : answer.correct,
      solved: Boolean(previous?.solved) || answer.correct,
      lastWrong: answer.correct ? previous?.lastWrong : answer.chosen,
      at: Date.now(),
    };
    store.set({ ...state, answers: { ...state.answers, [k]: record } });
  },
  reset() {
    store.set(EMPTY);
  },
  /** Clears one section's progress and leaves the others alone. */
  resetTrack(track: TrackId) {
    const state = store.get();
    store.set({
      lessons: withoutTrack(state.lessons, track),
      quizzes: withoutTrack(state.quizzes, track),
      problems: withoutTrack(state.problems, track),
      visited: withoutTrack(state.visited, track),
      resume: without(state.resume, track),
      answers: withoutTrack(state.answers, track),
    });
  },
  /** Replaces the stored progress with an imported backup. */
  replace(next: ProgressState) {
    store.set(next);
  },
};

export const isLessonComplete = (p: ProgressState, track: TrackId, slug: string) => Boolean(p.lessons[key(track, slug)]);
export const isQuizPassed = (p: ProgressState, track: TrackId, slug: string) => Boolean(p.quizzes[key(track, slug)]);
export const isLessonVisited = (p: ProgressState, track: TrackId, slug: string) => Boolean(p.visited[key(track, slug)]);
export const problemStatus = (p: ProgressState, track: TrackId, slug: string): ProblemStatus =>
  p.problems[key(track, slug)] ?? 'not-started';

/** Quiz answers of one track, optionally of one lesson. */
export const trackAnswers = (p: ProgressState, track: TrackId) => Object.values(p.answers).filter((a) => a.track === track);
