import { Track } from '../../shared/types';
import { FOUNDATIONS } from './stages/01-foundations';
import { PRINCIPLES } from './stages/02-principles';
import { MODELING } from './stages/03-modeling';
import { PATTERNS } from './stages/04-patterns';
import { METHODOLOGY } from './stages/05-methodology';
import { ADVANCED } from './stages/06-advanced';
import { LLD_PROBLEMS } from './problems';

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
  basePath: '#system-design/lld',
  home: { label: 'System Design', href: '#system-design' },
  language: 'Java',
  hasKnowledgeChecks: true,
};
