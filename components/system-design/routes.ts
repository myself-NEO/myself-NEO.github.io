import { TrackId } from '../../content/system-design/types';

// Hash routes, matching the rest of the site (#learning/<slug>):
//   #system-design                          landing page
//   #system-design/<track>                  track overview (LLD) or planned page (HLD)
//   #system-design/<track>/learn/<slug>     lesson
//   #system-design/<track>/problems         practice library
//   #system-design/<track>/problems/<slug>  problem
export const ROOT_HREF = '#system-design';

export const trackHref = (track: TrackId) => `${ROOT_HREF}/${track}`;
export const lessonHref = (track: TrackId, slug: string) => `${ROOT_HREF}/${track}/learn/${slug}`;
export const problemsHref = (track: TrackId) => `${ROOT_HREF}/${track}/problems`;
export const problemHref = (track: TrackId, slug: string) => `${ROOT_HREF}/${track}/problems/${slug}`;

export type SystemDesignRoute =
  | { kind: 'landing' }
  | { kind: 'track'; track: TrackId }
  | { kind: 'lesson'; track: TrackId; slug: string }
  | { kind: 'problems'; track: TrackId }
  | { kind: 'problem'; track: TrackId; slug: string }
  | { kind: 'not-found' };

const isTrack = (value: string): value is TrackId => value === 'lld' || value === 'hld';

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
