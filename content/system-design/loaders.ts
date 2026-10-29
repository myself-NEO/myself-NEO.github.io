import { TrackId } from './types';

// Lesson and problem bodies are code-split: each markdown file becomes its own
// chunk and is only downloaded when the learner opens that page.
const lessonFiles = import.meta.glob<string>('./*/lessons/*.md', { query: '?raw', import: 'default' });
const problemFiles = import.meta.glob<string>('./*/problems/*.md', { query: '?raw', import: 'default' });

const load = (files: Record<string, () => Promise<string>>, path: string): Promise<string> => {
  const loader = files[path];
  return loader ? loader() : Promise.reject(new Error(`Content not found: ${path}`));
};

export const loadLessonBody = (track: TrackId, slug: string) => load(lessonFiles, `./${track}/lessons/${slug}.md`);

export const loadProblemBody = (track: TrackId, slug: string) => load(problemFiles, `./${track}/problems/${slug}.md`);

export const hasLessonBody = (track: TrackId, slug: string) => `./${track}/lessons/${slug}.md` in lessonFiles;

export const hasProblemBody = (track: TrackId, slug: string) => `./${track}/problems/${slug}.md` in problemFiles;
