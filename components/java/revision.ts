import { Track } from '../../content/shared/types';
import { findLesson } from '../../content/shared/curriculum';
import { InterviewQuestion, topicTitle } from '../../content/java/interview';
import { NotebookState } from '../learn/notebook';
import { ProgressState } from '../learn/progress';
import { lessonHref } from '../learn/routes';

// The revision list gathers everything the learner flagged or got wrong:
// lessons marked difficult, interview questions marked for revision (or rated "missed"),
// and knowledge-check questions answered incorrectly on the first attempt.

export type RevisionKind = 'lesson' | 'question' | 'quiz';

export interface RevisionItem {
  /** Key in notebook.reviewed */
  key: string;
  kind: RevisionKind;
  /** lesson slug, question id, or quiz answer key */
  ref: string;
  title: string;
  context: string;
  /** stage id or interview topic id */
  topic: string;
  href?: string;
  flaggedAt: number;
  reviewedAt?: number;
  /** true when it has not been reviewed since it was (last) flagged */
  due: boolean;
}

export const revisionItems = (
  track: Track,
  notebook: NotebookState,
  progress: ProgressState,
  questions: InterviewQuestion[] = [],
): RevisionItem[] => {
  const prefix = `${track.id}:`;
  const items: RevisionItem[] = [];
  const add = (item: Omit<RevisionItem, 'reviewedAt' | 'due'>) => {
    const reviewedAt = notebook.reviewed[item.key];
    items.push({ ...item, reviewedAt, due: !reviewedAt || reviewedAt < item.flaggedAt });
  };

  for (const [k, at] of Object.entries(notebook.difficult)) {
    if (!k.startsWith(prefix)) continue;
    const slug = k.slice(prefix.length);
    const loc = findLesson(track, slug);
    if (!loc) continue;
    add({
      key: `difficult:${k}`,
      kind: 'lesson',
      ref: slug,
      title: loc.lesson.title,
      context: `Stage ${loc.stage.number} · ${loc.moduleTitle}`,
      topic: loc.stage.id,
      href: lessonHref(track, slug),
      flaggedAt: at,
    });
  }

  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const [k, at] of Object.entries(notebook.revise)) {
    if (!k.startsWith(prefix)) continue;
    const id = k.slice(prefix.length);
    const question = byId.get(id);
    const saved = notebook.saved[`question:${k}`];
    add({
      key: `revise:${k}`,
      kind: 'question',
      ref: id,
      title: question?.title ?? saved?.title ?? id,
      context: question ? `Interview · ${topicTitle(question.topic)}` : 'Interview question',
      topic: question?.topic ?? saved?.topic ?? '',
      flaggedAt: at,
    });
  }

  for (const [k, answer] of Object.entries(progress.answers)) {
    if (answer.track !== track.id || answer.firstCorrect) continue;
    const loc = findLesson(track, answer.lesson);
    add({
      key: `quiz:${k}`,
      kind: 'quiz',
      ref: k,
      title: answer.prompt,
      context: loc ? `Knowledge check · ${loc.lesson.title}` : 'Knowledge check',
      topic: loc?.stage.id ?? '',
      href: lessonHref(track, answer.lesson),
      flaggedAt: answer.at,
    });
  }

  return items.sort((a, b) => Number(b.due) - Number(a.due) || b.flaggedAt - a.flaggedAt);
};

/** Number of revision items not yet reviewed. */
export const revisionCount = (track: Track, notebook: NotebookState, progress: ProgressState) =>
  revisionItems(track, notebook, progress).filter((i) => i.due).length;
