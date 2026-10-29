import { TrackId } from './types';

// Lesson and problem bodies are code-split: each markdown file becomes its own
// chunk and is only downloaded when the learner opens that page.
const systemDesignLessons = import.meta.glob<string>('../system-design/*/lessons/*.md', { query: '?raw', import: 'default' });
const systemDesignProblems = import.meta.glob<string>('../system-design/*/problems/*.md', { query: '?raw', import: 'default' });
const dsaLessons = import.meta.glob<string>('../learning/*.md', { query: '?raw', import: 'default' });

const lessonPath = (track: TrackId, slug: string) =>
  track === 'dsa' ? `../learning/${slug}.md` : `../system-design/${track}/lessons/${slug}.md`;

const lessonFiles = (track: TrackId) => (track === 'dsa' ? dsaLessons : systemDesignLessons);

const load = (files: Record<string, () => Promise<string>>, path: string): Promise<string> => {
  const loader = files[path];
  return loader ? loader() : Promise.reject(new Error(`Content not found: ${path}`));
};

export const loadLessonBody = (track: TrackId, slug: string) => load(lessonFiles(track), lessonPath(track, slug));

export const loadProblemBody = (track: TrackId, slug: string) =>
  load(systemDesignProblems, `../system-design/${track}/problems/${slug}.md`);

export const hasLessonBody = (track: TrackId, slug: string) => lessonPath(track, slug) in lessonFiles(track);

export const hasProblemBody = (track: TrackId, slug: string) => `../system-design/${track}/problems/${slug}.md` in systemDesignProblems;
