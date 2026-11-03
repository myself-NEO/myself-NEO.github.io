import { ProblemMeta, Stage, Track } from '../../../content/shared/types';
import { availableLessons, findLesson, stageLessons } from '../../../content/shared/curriculum';
import { hasProblemBody } from '../../../content/shared/loaders';

/** The stage after which a problem's prerequisite lessons have all been covered. */
export const unlockStage = (track: Track, problem: ProblemMeta) =>
  Math.max(1, ...problem.concepts.map((c) => findLesson(track, c)?.stage.number ?? 1));

export interface SequenceStep {
  stage: Stage;
  minutes: number;
  essentialMinutes: number;
  lessons: number;
  written: number;
  problems: ProblemMeta[];
}

/** Stages in order, each followed by the problems that become practisable after it. */
export const learningSequence = (track: Track): SequenceStep[] =>
  track.stages.map((stage) => {
    const listed = stageLessons(stage);
    return {
      stage,
      minutes: listed.reduce((sum, l) => sum + l.minutes, 0),
      essentialMinutes: listed.filter((l) => l.essential).reduce((sum, l) => sum + l.minutes, 0),
      lessons: listed.length,
      written: availableLessons(listed).length,
      problems: track.problems.filter((p) => unlockStage(track, p) === stage.number),
    };
  });

export const hasBreakdown = (track: Track, slug: string) => hasProblemBody(track.id, slug);

/** Hours with one decimal, e.g. 125 min → "2.1". */
export const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}`;
