import { TrackId } from '../../content/shared/types';

// System Design routes (track URLs are built with the helpers in ../learn/routes):
//   #system-design                          landing page
//   #system-design/<track>                  track overview (LLD) or planned page (HLD)
//   #system-design/<track>/learn/<slug>     lesson
//   #system-design/<track>/problems         practice library
//   #system-design/<track>/problems/<slug>  problem
export const ROOT_HREF = '#system-design';

type SystemDesignTrackId = Extract<TrackId, 'lld' | 'hld'>;

export type SystemDesignRoute =
  | { kind: 'landing' }
  | { kind: 'track'; track: SystemDesignTrackId }
  | { kind: 'lesson'; track: SystemDesignTrackId; slug: string }
  | { kind: 'problems'; track: SystemDesignTrackId }
  | { kind: 'problem'; track: SystemDesignTrackId; slug: string }
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
  return { kind: 'not-found' };
};
