import { Track } from '../../shared/types';
import { FOUNDATIONS } from './stages/01-foundations';
import { PRINCIPLES } from './stages/02-principles';
import { MODELING } from './stages/03-modeling';
import { PATTERNS } from './stages/04-patterns';
import { METHODOLOGY } from './stages/05-methodology';
import { ADVANCED } from './stages/06-advanced';
import { LLD_PROBLEMS } from './problems';

export const LLD_HOME = '#system-design/lld';

export const LLD_TRACK: Track = {
  id: 'lld',
  title: 'Low-Level Design',
  shortTitle: 'LLD',
  status: 'active',
  tagline: 'Object-oriented design in Java 17+',
  description:
    'Design the classes, interfaces, relationships and behaviour inside one service — and write the Java that implements them.',
  stages: [FOUNDATIONS, PRINCIPLES, MODELING, PATTERNS, METHODOLOGY, ADVANCED],
  problems: LLD_PROBLEMS,
  basePath: LLD_HOME,
  home: { label: 'System Design', href: '#system-design' },
  language: 'Java',
  hasKnowledgeChecks: true,
  notebook: true,
  problemStatuses: ['not-started', 'in-progress', 'attempted', 'completed'],
  notePlaceholder: 'e.g. Strategy vs State: Strategy is chosen by the caller, State changes itself as the object moves on…',
  sectionLinks: [
    { label: 'Mock interviews', href: `${LLD_HOME}/interview` },
    { label: 'Revision notebook', href: `${LLD_HOME}/notebook` },
    { label: 'Progress', href: `${LLD_HOME}/progress` },
  ],
};
