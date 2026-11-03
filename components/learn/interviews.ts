import { useSyncExternalStore } from 'react';
import { TrackId } from '../../content/shared/types';
import { createStore } from './store';
import type { SelfRating } from './notebook';

// Mock-interview sessions and the ticks of interactive checklists. Like progress and
// the notebook, this lives in this browser only and travels in the notebook backup.

const STORAGE_KEY = 'learning-interviews-v1';

export type PhaseId =
  | 'brief'
  | 'clarify'
  | 'requirements'
  | 'estimation'
  | 'api'
  | 'data-model'
  | 'architecture'
  | 'deep-dives'
  | 'bottlenecks'
  | 'tradeoffs'
  | 'evaluation';

export type RubricId = 'requirements' | 'api' | 'data-model' | 'architecture' | 'scalability' | 'reliability' | 'tradeoffs' | 'communication';

export interface AskedQuestion {
  text: string;
  /** Index of the scripted clarifying question it matched, or null when nothing matched. */
  matched: number | null;
  at: number;
}

export interface InterviewSession {
  startedAt: number;
  updatedAt: number;
  minutes: 45 | 60;
  phase: PhaseId;
  /** Milliseconds the timer ran while each phase was open. */
  timeInPhase: Partial<Record<PhaseId, number>>;
  /** Set while the timer is running: when the current stretch started. */
  runningSince?: number;
  asked: AskedQuestion[];
  /** The learner's own answers, keyed by phase id (or `deep:<n>` for a deep dive). */
  drafts: Record<string, string>;
  /** Hints shown per key. */
  hints: Record<string, number>;
  /** Reference answers opened, key → when. */
  revealed: Record<string, number>;
  /** Coverage items the learner confirmed they included, `${list}:${index}` → true. */
  checks: Record<string, boolean>;
  /** Capacity-estimation inputs as the learner left them. */
  estimate?: Record<string, number | string>;
  /** Mermaid source of the learner's architecture diagram. */
  diagram?: string;
  /** Deep dives the learner chose to work on (indexes into the script's list). */
  deepDives?: number[];
  ratings: Partial<Record<RubricId, SelfRating>>;
}

export interface InterviewAttempt {
  completedAt: number;
  minutes: 45 | 60;
  elapsedMs: number;
  /** Rubric score 0-100: got it = 1, partially = 0.5, missed = 0. */
  score: number;
  ratings: Partial<Record<RubricId, SelfRating>>;
  /** Share of the scripted clarifying questions the learner asked about (0-1). */
  clarifyCoverage: number;
  hintsUsed: number;
}

export interface InterviewsState {
  /** `${track}:${problem}` → the attempt in progress */
  sessions: Record<string, InterviewSession>;
  /** `${track}:${problem}` → finished attempts, oldest first */
  history: Record<string, InterviewAttempt[]>;
  /** page key → checklist item id → when it was ticked */
  checklists: Record<string, Record<string, number>>;
}

const EMPTY: InterviewsState = { sessions: {}, history: {}, checklists: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeInterviews = (parsed: unknown): InterviewsState => {
  if (!isRecord(parsed)) return EMPTY;
  const field = <T,>(name: keyof InterviewsState) => (isRecord(parsed[name]) ? parsed[name] : {}) as Record<string, T>;
  return { sessions: field('sessions'), history: field('history'), checklists: field('checklists') };
};

const store = createStore<InterviewsState>({ key: STORAGE_KEY, empty: EMPTY, sanitize: sanitizeInterviews });

export const useInterviews = () => useSyncExternalStore(store.subscribe, store.get, store.get);
export const getInterviews = store.get;

export const sessionKey = (track: TrackId, problem: string) => `${track}:${problem}`;

const without = <T,>(record: Record<string, T>, k: string) => {
  const { [k]: _removed, ...rest } = record;
  return rest;
};

/** Time spent so far, including the stretch that is still running. */
export const elapsedMs = (session: InterviewSession, now = Date.now()) =>
  Object.values(session.timeInPhase).reduce((sum, ms) => sum + (ms ?? 0), 0) + (session.runningSince ? now - session.runningSince : 0);

export const phaseElapsedMs = (session: InterviewSession, phase: PhaseId, now = Date.now()) =>
  (session.timeInPhase[phase] ?? 0) + (session.phase === phase && session.runningSince ? now - session.runningSince : 0);

/** Banks the running stretch into the current phase. */
const bank = (session: InterviewSession, now: number): InterviewSession =>
  session.runningSince
    ? {
        ...session,
        timeInPhase: { ...session.timeInPhase, [session.phase]: (session.timeInPhase[session.phase] ?? 0) + (now - session.runningSince) },
        runningSince: now,
      }
    : session;

const RATING_SCORE: Record<SelfRating, number> = { 'got-it': 1, partial: 0.5, missed: 0 };

export const rubricScore = (ratings: Partial<Record<RubricId, SelfRating>>, dimensions: number) => {
  const values = Object.values(ratings).filter((r): r is SelfRating => Boolean(r));
  return dimensions === 0 ? 0 : Math.round((values.reduce((sum, r) => sum + RATING_SCORE[r], 0) / dimensions) * 100);
};

const updateSession = (k: string, change: (s: InterviewSession) => InterviewSession) => {
  const state = store.get();
  const current = state.sessions[k];
  if (!current) return;
  store.set({ ...state, sessions: { ...state.sessions, [k]: { ...change(current), updatedAt: Date.now() } } });
};

export const interviewActions = {
  start(track: TrackId, problem: string, minutes: 45 | 60) {
    const state = store.get();
    const now = Date.now();
    const session: InterviewSession = {
      startedAt: now,
      updatedAt: now,
      minutes,
      phase: 'clarify',
      timeInPhase: {},
      runningSince: now,
      asked: [],
      drafts: {},
      hints: {},
      revealed: {},
      checks: {},
      ratings: {},
    };
    store.set({ ...state, sessions: { ...state.sessions, [sessionKey(track, problem)]: session } });
  },
  setPhase(track: TrackId, problem: string, phase: PhaseId) {
    updateSession(sessionKey(track, problem), (s) => ({ ...bank(s, Date.now()), phase }));
  },
  setTimerRunning(track: TrackId, problem: string, running: boolean) {
    updateSession(sessionKey(track, problem), (s) => {
      const now = Date.now();
      if (running) return s.runningSince ? s : { ...s, runningSince: now };
      const banked = bank(s, now);
      return { ...banked, runningSince: undefined };
    });
  },
  ask(track: TrackId, problem: string, text: string, matched: number | null) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, asked: [...s.asked, { text, matched, at: Date.now() }] }));
  },
  setDraft(track: TrackId, problem: string, key: string, text: string) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, drafts: { ...s.drafts, [key]: text } }));
  },
  showHint(track: TrackId, problem: string, key: string) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, hints: { ...s.hints, [key]: (s.hints[key] ?? 0) + 1 } }));
  },
  reveal(track: TrackId, problem: string, key: string) {
    updateSession(sessionKey(track, problem), (s) => (s.revealed[key] ? s : { ...s, revealed: { ...s.revealed, [key]: Date.now() } }));
  },
  setCheck(track: TrackId, problem: string, key: string, on: boolean) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, checks: on ? { ...s.checks, [key]: true } : without(s.checks, key) }));
  },
  setEstimate(track: TrackId, problem: string, values: Record<string, number | string>) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, estimate: values }));
  },
  setDiagram(track: TrackId, problem: string, source: string) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, diagram: source }));
  },
  setDeepDives(track: TrackId, problem: string, chosen: number[]) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, deepDives: chosen }));
  },
  rate(track: TrackId, problem: string, id: RubricId, rating: SelfRating) {
    updateSession(sessionKey(track, problem), (s) => ({ ...s, ratings: { ...s.ratings, [id]: rating } }));
  },
  /** Ends the attempt: it moves into the history and the session is cleared. */
  finish(track: TrackId, problem: string, summary: Omit<InterviewAttempt, 'completedAt' | 'elapsedMs' | 'minutes' | 'ratings'>) {
    const state = store.get();
    const k = sessionKey(track, problem);
    const session = state.sessions[k];
    if (!session) return;
    const now = Date.now();
    const attempt: InterviewAttempt = {
      ...summary,
      completedAt: now,
      minutes: session.minutes,
      elapsedMs: elapsedMs(session, now),
      ratings: session.ratings,
    };
    store.set({
      ...state,
      sessions: without(state.sessions, k),
      history: { ...state.history, [k]: [...(state.history[k] ?? []), attempt] },
    });
  },
  discard(track: TrackId, problem: string) {
    const state = store.get();
    store.set({ ...state, sessions: without(state.sessions, sessionKey(track, problem)) });
  },
  toggleChecklistItem(pageKey: string, item: string, on: boolean) {
    const state = store.get();
    const list = state.checklists[pageKey] ?? {};
    const next = on ? { ...list, [item]: Date.now() } : without(list, item);
    store.set({ ...state, checklists: { ...state.checklists, [pageKey]: next } });
  },
  replace(next: InterviewsState) {
    store.set(next);
  },
  /** Removes everything belonging to one track (page keys start with the track id). */
  resetTrack(track: TrackId) {
    const s = store.get();
    const keep = <T,>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith(`${track}:`))) as Record<string, T>;
    store.set({ sessions: keep(s.sessions), history: keep(s.history), checklists: keep(s.checklists) });
  },
};
