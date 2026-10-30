import { Track } from '../../content/shared/types';

// Every learning track lives under its own hash prefix (track.basePath), matching the
// rest of the site's hash routing:
//   <basePath>                    track overview
//   <basePath>/learn/<slug>       lesson
//   <basePath>/problems           practice library
//   <basePath>/problems/<slug>    problem

/** Hash prefixes owned by learning sections: links starting with these are routes, not in-page anchors. */
export const LEARNING_ROUTE_PREFIXES = ['#system-design', '#dsa', '#java'];

export const trackHref = (track: Track) => track.basePath;
export const lessonHref = (track: Track, slug: string) => `${track.basePath}/learn/${slug}`;
export const problemsHref = (track: Track) => `${track.basePath}/problems`;
export const problemHref = (track: Track, slug: string) => `${track.basePath}/problems/${slug}`;

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb prefix: the section home, then the track unless the track *is* the section (as with DSA). */
export const trackCrumbs = (track: Track): Crumb[] =>
  track.basePath === track.home.href
    ? [{ label: track.home.label, href: track.home.href }]
    : [
        { label: track.home.label, href: track.home.href },
        { label: track.title, href: track.basePath },
      ];
