import { LessonMeta, ProblemMeta, Stage, Track, TrackId } from './types';

export interface LessonLocation {
  lesson: LessonMeta;
  stage: Stage;
  moduleTitle: string;
  index: number;
}

/** Lessons of a track in curriculum order, with their stage and module. */
export const flattenLessons = (track: Track): LessonLocation[] => {
  const result: LessonLocation[] = [];
  for (const stage of track.stages) {
    for (const module of stage.modules) {
      for (const lesson of module.lessons) {
        result.push({ lesson, stage, moduleTitle: module.title, index: result.length });
      }
    }
  }
  return result;
};

const lessonIndexCache = new Map<TrackId, Map<string, LessonLocation>>();

const lessonIndex = (track: Track) => {
  let index = lessonIndexCache.get(track.id);
  if (!index) {
    index = new Map(flattenLessons(track).map((loc) => [loc.lesson.slug, loc]));
    lessonIndexCache.set(track.id, index);
  }
  return index;
};

export const findLesson = (track: Track, slug: string): LessonLocation | undefined => lessonIndex(track).get(slug);

export const findProblem = (track: Track, slug: string): ProblemMeta | undefined =>
  track.problems.find((p) => p.slug === slug);

export const stageLessons = (stage: Stage): LessonMeta[] => stage.modules.flatMap((m) => m.lessons);

/** Lessons a learner can actually work through (excludes "coming soon" placeholders). */
export const availableLessons = (lessons: LessonMeta[]): LessonMeta[] => lessons.filter((l) => !l.comingSoon);
