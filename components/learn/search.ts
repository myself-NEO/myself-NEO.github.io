import { Level, Track } from '../../content/shared/types';
import { flattenLessons } from '../../content/shared/curriculum';
import { hasProblemBody } from '../../content/shared/loaders';
import { lessonHref, problemHref } from './routes';

export interface SearchResult {
  type: 'lesson' | 'problem';
  slug: string;
  title: string;
  subtitle: string;
  href: string;
  level: Level;
}

const tokenize = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** Case-insensitive search over lesson and problem metadata; every query word must match. */
export const searchTrack = (track: Track, query: string, limit = 20): SearchResult[] => {
  const words = tokenize(query);
  if (words.length === 0) return [];

  const scored: { result: SearchResult; score: number }[] = [];
  const consider = (result: SearchResult, haystack: string) => {
    const text = haystack.toLowerCase();
    if (!words.every((w) => text.includes(w))) return;
    const title = result.title.toLowerCase();
    const score = words.reduce((s, w) => s + (title.includes(w) ? 2 : 0) + (title.startsWith(w) ? 1 : 0), 0);
    scored.push({ result, score });
  };

  for (const { lesson, stage, moduleTitle } of flattenLessons(track)) {
    consider(
      {
        type: 'lesson',
        slug: lesson.slug,
        title: lesson.title,
        subtitle: `Stage ${stage.number} · ${moduleTitle}${lesson.comingSoon ? ' · coming soon' : ''}`,
        href: lessonHref(track, lesson.slug),
        level: lesson.level,
      },
      [lesson.title, lesson.summary, moduleTitle, stage.title, ...(lesson.tags ?? [])].join(' '),
    );
  }
  for (const problem of track.problems) {
    consider(
      {
        type: 'problem',
        slug: problem.slug,
        title: problem.title,
        subtitle: `Practice · ${problem.patterns.join(', ')}${hasProblemBody(track.id, problem.slug) ? '' : ' · coming soon'}`,
        href: problemHref(track, problem.slug),
        level: problem.difficulty,
      },
      [problem.title, problem.summary, ...problem.patterns, ...problem.tags].join(' '),
    );
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.result);
};

export const matchesFilter = (query: string, ...fields: (string | undefined)[]) => {
  const words = tokenize(query);
  const text = fields.join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
};
