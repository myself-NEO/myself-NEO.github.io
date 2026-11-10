import { TrackId } from '../../content/shared/types';

// System Design routes (track URLs are built with the helpers in ../learn/routes):
//   #system-design                          landing page
//   #system-design/<track>                  track overview (LLD and HLD)
//   #system-design/<track>/learn/<slug>     lesson
//   #system-design/<track>/problems         practice library
//   #system-design/<track>/problems/<slug>  problem
//   #system-design/<track>/interview        mock interviews
//   #system-design/<track>/interview/<slug> one mock interview
//   #system-design/<track>/notebook         revision notebook
//   #system-design/<track>/progress         progress dashboard
// HLD only:
//   #system-design/hld/estimator            capacity estimator
export const ROOT_HREF = '#system-design';

type SystemDesignTrackId = Extract<TrackId, 'lld' | 'hld'>;

export type SystemDesignRoute =
  | { kind: 'landing' }
  | { kind: 'track'; track: SystemDesignTrackId }
  | { kind: 'lesson'; track: SystemDesignTrackId; slug: string }
  | { kind: 'problems'; track: SystemDesignTrackId }
  | { kind: 'problem'; track: SystemDesignTrackId; slug: string }
  | { kind: 'interviews'; track: SystemDesignTrackId }
  | { kind: 'interview'; track: SystemDesignTrackId; slug: string }
  | { kind: 'estimator'; track: 'hld' }
  | { kind: 'notebook'; track: SystemDesignTrackId }
  | { kind: 'progress'; track: SystemDesignTrackId }
  | { kind: 'not-found' };

const isTrack = (value: string): value is SystemDesignTrackId => value === 'lld' || value === 'hld';

/** Parses the part of the hash after "#system-design/". */
export const parseRoute = (path: string): SystemDesignRoute => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: 'landing' };

  const [track, section, slug, ...rest] = parts;
  if (!isTrack(track) || rest.length > 0) return { kind: 'not-found' };
  if (!section) return { kind: 'track', track };
  if (section === 'learn' && slug) return { kind: 'lesson', track, slug };
  if (section === 'problems') return slug ? { kind: 'problem', track, slug } : { kind: 'problems', track };
  if (section === 'interview') return slug ? { kind: 'interview', track, slug } : { kind: 'interviews', track };
  if (!slug && section === 'notebook') return { kind: 'notebook', track };
  if (!slug && section === 'progress') return { kind: 'progress', track };
  if (!slug && section === 'estimator' && track === 'hld') return { kind: 'estimator', track };
  return { kind: 'not-found' };
};
