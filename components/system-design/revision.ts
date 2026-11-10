import { Track } from '../../content/shared/types';
import { findLesson, findProblem } from '../../content/shared/curriculum';
import { InterviewsState } from '../learn/interviews';
import { NotebookState } from '../learn/notebook';
import { ProgressState } from '../learn/progress';
import { lessonHref, problemHref } from '../learn/routes';
import { interviewHref } from './sections';
import { trackConfig } from './trackConfig';

// Everything the learner flagged or got wrong in a System Design track: difficult lessons, problems marked
// "revisit later", knowledge-check and drill mistakes, and rubric areas rated "Missed" in
// the latest mock interview of each problem.

export type RevisionKind = 'lesson' | 'problem' | 'quiz' | 'mock';

export interface RevisionItem {
  /** Key in notebook.reviewed */
  key: string;
  kind: RevisionKind;
  title: string;
  context: string;
  /** Stage id, or "problems". */
  topic: string;
  href?: string;
  flaggedAt: number;
  reviewedAt?: number;
  due: boolean;
  /** For "remove": the notebook flag behind the item. */
  ref?: string;
}

export const revisionItems = (track: Track, notebook: NotebookState, progress: ProgressState, interviews: InterviewsState): RevisionItem[] => {
  const prefix = `${track.id}:`;
  const items: RevisionItem[] = [];
  const add = (item: Omit<RevisionItem, 'reviewedAt' | 'due'>) => {
    const reviewedAt = notebook.reviewed[item.key];
    items.push({ ...item, reviewedAt, due: !reviewedAt || reviewedAt < item.flaggedAt });
  };

  for (const [k, at] of Object.entries(notebook.difficult)) {
    if (!k.startsWith(prefix)) continue;
    const loc = findLesson(track, k.slice(prefix.length));
    if (!loc) continue;
    add({
      key: `difficult:${k}`,
      kind: 'lesson',
      title: loc.lesson.title,
      context: `Stage ${loc.stage.number} · ${loc.moduleTitle}`,
      topic: loc.stage.id,
      href: lessonHref(track, loc.lesson.slug),
      flaggedAt: at,
      ref: loc.lesson.slug,
    });
  }

  for (const [k, at] of Object.entries(notebook.revise)) {
    if (!k.startsWith(`${prefix}problem:`)) continue;
    const slug = k.slice(`${prefix}problem:`.length);
    const problem = findProblem(track, slug);
    if (!problem) continue;
    add({ key: `revise:${k}`, kind: 'problem', title: problem.title, context: 'Problem to revisit', topic: 'problems', href: problemHref(track, slug), flaggedAt: at, ref: slug });
  }

  for (const [k, answer] of Object.entries(progress.answers)) {
    if (answer.track !== track.id || answer.firstCorrect) continue;
    const loc = findLesson(track, answer.lesson);
    add({
      key: `quiz:${k}`,
      kind: 'quiz',
      title: answer.prompt,
      context: loc ? `Missed in “${loc.lesson.title}”` : 'Knowledge check',
      topic: loc?.stage.id ?? 'general',
      href: loc ? lessonHref(track, loc.lesson.slug) : undefined,
      flaggedAt: answer.at,
    });
  }

  for (const [k, attempts] of Object.entries(interviews.history)) {
    if (!k.startsWith(prefix) || attempts.length === 0) continue;
    const slug = k.slice(prefix.length);
    const problem = findProblem(track, slug);
    const last = attempts[attempts.length - 1];
    if (!problem) continue;
    for (const dim of trackConfig(track).rubric) {
      if (last.ratings[dim.id] !== 'missed') continue;
      add({
        key: `mock:${k}:${dim.id}`,
        kind: 'mock',
        title: `${dim.label} — ${problem.title}`,
        context: `Rated “Missed” in your mock interview on ${new Date(last.completedAt).toLocaleDateString()}`,
        topic: 'problems',
        href: interviewHref(track, slug),
        flaggedAt: last.completedAt,
      });
    }
  }

  return items.sort((a, b) => Number(b.due) - Number(a.due) || b.flaggedAt - a.flaggedAt);
};
