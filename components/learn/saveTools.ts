import { useCallback, useMemo } from 'react';
import { Track } from '../../content/shared/types';
import { notebookActions, useNotebook } from './notebook';

// Notebook callbacks for the diagrams and interview questions on a lesson or problem page.

export interface SavePage {
  kind: 'lesson' | 'problem';
  slug: string;
  title: string;
  /** Stage id for lessons; "problems" for practice problems. */
  topic: string;
  href: string;
}

export const pageKeyOf = (track: Track, page: Pick<SavePage, 'kind' | 'slug'>) => `${track.id}:${page.kind}:${page.slug}`;

export const useSaveTools = (track: Track, page: SavePage) => {
  const notebook = useNotebook();
  const prefix = `${page.kind}:${page.slug}#`;

  const savedQuestions = useMemo(
    () =>
      new Set(
        Object.values(notebook.saved)
          .filter((item) => item.kind === 'question' && item.track === track.id && item.ref.startsWith(prefix))
          .map((item) => item.ref.slice(prefix.length)),
      ),
    [notebook.saved, track.id, prefix],
  );

  const onToggleQuestion = useCallback(
    (q: { id: string; title: string; body: string }) =>
      notebookActions.toggleSaved({
        kind: 'question',
        track: track.id,
        ref: `${prefix}${q.id}`,
        title: q.title,
        context: page.title,
        topic: page.topic,
        body: q.body,
        href: page.href,
      }),
    [track.id, prefix, page.title, page.topic, page.href],
  );

  const onSaveDiagram = useCallback(
    (d: { source: string; title?: string }) =>
      notebookActions.addSnippet({
        track: track.id,
        title: d.title ? `${d.title} (${page.title})` : page.title,
        code: d.source,
        language: 'mermaid',
        topic: page.topic,
        lesson: page.kind === 'lesson' ? page.slug : undefined,
        href: page.href,
      }),
    [track.id, page.kind, page.slug, page.title, page.topic, page.href],
  );

  return { savedQuestions, onToggleQuestion, onSaveDiagram, pageKey: pageKeyOf(track, page) };
};
