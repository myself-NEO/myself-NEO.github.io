import { TrackId } from './types';

// Lesson and problem bodies are code-split: each markdown file becomes its own
// chunk and is only downloaded when the learner opens that page.
const systemDesignLessons = import.meta.glob<string>('../system-design/*/lessons/*.md', { query: '?raw', import: 'default' });
const systemDesignProblems = import.meta.glob<string>('../system-design/*/problems/*.md', { query: '?raw', import: 'default' });
const dsaLessons = import.meta.glob<string>('../learning/*.md', { query: '?raw', import: 'default' });
const javaLessons = import.meta.glob<string>('../java/lessons/*.md', { query: '?raw', import: 'default' });
const javaProblems = import.meta.glob<string>('../java/problems/*.md', { query: '?raw', import: 'default' });

type Files = Record<string, () => Promise<string>>;

const lessonFiles = (track: TrackId): Files => {
  if (track === 'dsa') return dsaLessons;
  if (track === 'java') return javaLessons;
  return systemDesignLessons;
};

const lessonPath = (track: TrackId, slug: string) => {
  if (track === 'dsa') return `../learning/${slug}.md`;
  if (track === 'java') return `../java/lessons/${slug}.md`;
  return `../system-design/${track}/lessons/${slug}.md`;
};

const problemFiles = (track: TrackId): Files => (track === 'java' ? javaProblems : systemDesignProblems);

const problemPath = (track: TrackId, slug: string) =>
  track === 'java' ? `../java/problems/${slug}.md` : `../system-design/${track}/problems/${slug}.md`;

const load = (files: Files, path: string): Promise<string> => {
  const loader = files[path];
  return loader ? loader() : Promise.reject(new Error(`Content not found: ${path}`));
};

export const loadLessonBody = (track: TrackId, slug: string) => load(lessonFiles(track), lessonPath(track, slug));

export const loadProblemBody = (track: TrackId, slug: string) => load(problemFiles(track), problemPath(track, slug));

export const hasLessonBody = (track: TrackId, slug: string) => lessonPath(track, slug) in lessonFiles(track);

export const hasProblemBody = (track: TrackId, slug: string) => problemPath(track, slug) in problemFiles(track);
