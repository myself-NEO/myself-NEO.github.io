import { ProblemMeta, Stage, Track } from '../../content/shared/types';
import { availableLessons, findLesson, LessonLocation, stageLessons } from '../../content/shared/curriculum';
import { hasProblemBody } from '../../content/shared/loaders';

/** The stage after which a problem's prerequisite lessons have all been covered. */
export const unlockStage = (track: Track, problem: ProblemMeta) =>
  Math.max(1, ...problem.concepts.map((c) => findLesson(track, c)?.stage.number ?? 1));

/** The problem's last prerequisite lesson in curriculum order. */
const lastPrerequisite = (track: Track, problem: ProblemMeta): LessonLocation | undefined =>
  problem.concepts
    .map((c) => findLesson(track, c))
    .reduce<LessonLocation | undefined>((last, loc) => (loc && (!last || loc.index > last.index) ? loc : last), undefined);

/** Problems that become practisable at one point of a stage. */
export interface PracticeGroup {
  /** The module after which they unlock; absent when it is the end of the stage. */
  afterModule?: string;
  problems: ProblemMeta[];
}

export interface SequenceStep {
  stage: Stage;
  minutes: number;
  essentialMinutes: number;
  lessons: number;
  written: number;
  problems: ProblemMeta[];
  /** `problems`, split by the module they unlock after (one group unless `byModule`). */
  groups: PracticeGroup[];
}

/**
 * Stages in order, each followed by the problems that become practisable after it.
 * With `byModule`, a problem is placed after the module of its last prerequisite lesson, so long
 * stages interleave practice instead of saving every problem for the stage's end.
 */
export const learningSequence = (track: Track, { byModule = false }: { byModule?: boolean } = {}): SequenceStep[] =>
  track.stages.map((stage) => {
    const listed = stageLessons(stage);
    const problems = track.problems.filter((p) => unlockStage(track, p) === stage.number);
    const lastModule = stage.modules[stage.modules.length - 1]?.title;
    const groups: PracticeGroup[] = [];
    if (byModule) {
      for (const module of stage.modules) {
        const here = problems.filter((p) => (lastPrerequisite(track, p)?.moduleTitle ?? lastModule) === module.title);
        if (here.length > 0) groups.push({ afterModule: module.title === lastModule ? undefined : module.title, problems: here });
      }
    } else if (problems.length > 0) {
      groups.push({ problems });
    }
    return {
      stage,
      minutes: listed.reduce((sum, l) => sum + l.minutes, 0),
      essentialMinutes: listed.filter((l) => l.essential).reduce((sum, l) => sum + l.minutes, 0),
      lessons: listed.length,
      written: availableLessons(listed).length,
      problems,
      groups,
    };
  });

export const hasBreakdown = (track: Track, slug: string) => hasProblemBody(track.id, slug);

/** Hours with one decimal, e.g. 125 min → "2.1". */
export const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}`;
