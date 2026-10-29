import { useSyncExternalStore } from 'react';
import { ProblemStatus, TrackId } from '../../content/system-design/types';

// Learner progress is kept in this browser only (localStorage). Every read and
// write is guarded so the pages still work when storage is unavailable
// (private windows, blocked site data) — progress simply won't persist.

const STORAGE_KEY = 'system-design-progress-v1';

export interface ProgressState {
  /** `${track}:${slug}` → completion timestamp */
  lessons: Record<string, number>;
  /** `${track}:${slug}` → timestamp the lesson's knowledge check was passed */
  quizzes: Record<string, number>;
  /** `${track}:${slug}` → status (absent means not started) */
  problems: Record<string, ProblemStatus>;
}

const EMPTY: ProgressState = { lessons: {}, quizzes: {}, problems: {} };

const key = (track: TrackId, slug: string) => `${track}:${slug}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const read = (): ProgressState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY;
    return {
      lessons: isRecord(parsed.lessons) ? (parsed.lessons as ProgressState['lessons']) : {},
      quizzes: isRecord(parsed.quizzes) ? (parsed.quizzes as ProgressState['quizzes']) : {},
      problems: isRecord(parsed.problems) ? (parsed.problems as ProgressState['problems']) : {},
    };
  } catch {
    return EMPTY;
  }
};

let state: ProgressState = read();
const listeners = new Set<() => void>();

const commit = (next: ProgressState) => {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: keep progress for this session only.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      state = read();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

const getSnapshot = () => state;

export const useProgress = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const without = <T,>(record: Record<string, T>, k: string) => {
  const { [k]: _removed, ...rest } = record;
  return rest;
};

export const progressActions = {
  setLessonComplete(track: TrackId, slug: string, done: boolean) {
    const k = key(track, slug);
    commit({ ...state, lessons: done ? { ...state.lessons, [k]: Date.now() } : without(state.lessons, k) });
  },
  markQuizPassed(track: TrackId, slug: string) {
    const k = key(track, slug);
    if (state.quizzes[k]) return;
    commit({ ...state, quizzes: { ...state.quizzes, [k]: Date.now() } });
  },
  setProblemStatus(track: TrackId, slug: string, status: ProblemStatus) {
    const k = key(track, slug);
    commit({
      ...state,
      problems: status === 'not-started' ? without(state.problems, k) : { ...state.problems, [k]: status },
    });
  },
  /** Moves a problem from "not started" to "in progress" (used when a hint or solution is opened). */
  markProblemStarted(track: TrackId, slug: string) {
    if (!state.problems[key(track, slug)]) this.setProblemStatus(track, slug, 'in-progress');
  },
  reset() {
    commit(EMPTY);
  },
};

export const isLessonComplete = (p: ProgressState, track: TrackId, slug: string) => Boolean(p.lessons[key(track, slug)]);
export const isQuizPassed = (p: ProgressState, track: TrackId, slug: string) => Boolean(p.quizzes[key(track, slug)]);
export const problemStatus = (p: ProgressState, track: TrackId, slug: string): ProblemStatus =>
  p.problems[key(track, slug)] ?? 'not-started';
