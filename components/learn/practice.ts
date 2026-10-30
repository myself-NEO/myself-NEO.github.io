import { PracticeCopy, Track } from '../../content/shared/types';

/** The original LLD wording, used by tracks that don't define their own. */
const DESIGN_PRACTICE: PracticeCopy = {
  groupTitle: 'Practice Problems',
  noun: 'problems',
  libraryTitle: 'practice problems',
  libraryIntro: '',
  levelBlurbs: {
    beginner: 'One main entity lifecycle, a handful of classes. Focus on clean modelling and encapsulation.',
    intermediate: 'Several interacting entities, a state machine or two, and at least one extensibility follow-up.',
    advanced: 'Concurrency, scarce resources, delivery guarantees or pluggable engines. Expect deep follow-ups.',
  },
  titlePrefix: 'Design a ',
  steps: [
    'Read the statement, then write your own clarifying questions.',
    'Sketch entities and classes before opening any hint.',
  ],
  searchPlaceholder: 'Search by name, pattern or topic (e.g. “state”, “concurrency”)',
};

export const practiceCopy = (track: Track): PracticeCopy => track.practice ?? { ...DESIGN_PRACTICE, libraryTitle: `${track.shortTitle} practice problems` };
