import { Track, TrackId } from '../shared/types';
import { LLD_TRACK } from './lld';
import { HLD_TRACK } from './hld';

export const SYSTEM_DESIGN_TRACKS: Record<Extract<TrackId, 'lld' | 'hld'>, Track> = {
  lld: LLD_TRACK,
  hld: HLD_TRACK,
};
