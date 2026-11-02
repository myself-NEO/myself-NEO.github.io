import React from 'react';
import { Level, ProblemStatus } from '../../content/shared/types';
import { LeetCodeDifficulty, LeetCodeProblem, problemRef } from '../../content/learning/problems';
import { itemKey, NotebookState, problemNote } from '../learn/notebook';
import { problemStatus, ProgressState } from '../learn/progress';
import { LevelBadge } from '../learn/ui';

// Helpers shared by the DSA coding-questions, interview-notes and progress pages.

export const DSA = 'dsa' as const;

export const PRACTICE_STATUSES: ProblemStatus[] = ['not-started', 'in-progress', 'completed'];

export const PRACTICE_STATUS_LABEL: Record<ProblemStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'Attempted',
  completed: 'Solved',
};

const DIFFICULTY_LEVEL: Record<LeetCodeDifficulty, Level> = { Easy: 'beginner', Medium: 'intermediate', Hard: 'advanced' };

export const DifficultyBadge: React.FC<{ difficulty: LeetCodeDifficulty }> = ({ difficulty }) => (
  <LevelBadge level={DIFFICULTY_LEVEL[difficulty]} label={difficulty} />
);

export const statusOf = (progress: ProgressState, problem: LeetCodeProblem) => problemStatus(progress, DSA, problemRef(problem));
export const isRevisit = (notebook: NotebookState, problem: LeetCodeProblem) => Boolean(notebook.revise[itemKey(DSA, problemRef(problem))]);
export const noteOf = (notebook: NotebookState, problem: LeetCodeProblem) => problemNote(notebook, DSA, problemRef(problem));
/** When the problem's status last changed, if it has one. */
export const statusChangedAt = (progress: ProgressState, problem: LeetCodeProblem): number | undefined =>
  progress.problemsAt[itemKey(DSA, problemRef(problem))];

export const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
