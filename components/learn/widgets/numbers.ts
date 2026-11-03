// Parsing and formatting of back-of-the-envelope quantities. Estimation uses powers of
// ten throughout (1 KB = 1,000 bytes), which is what interviewers expect; binary units
// (KiB, MiB, …) are accepted on input for completeness.

export type QuantityKind = 'count' | 'bytes' | 'rate' | 'bitrate' | 'duration';

const COUNT_SUFFIX: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };

const BYTE_UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  pb: 1e15,
  eb: 1e18,
  kib: 2 ** 10,
  mib: 2 ** 20,
  gib: 2 ** 30,
  tib: 2 ** 40,
  pib: 2 ** 50,
};

const BIT_UNITS: Record<string, number> = { bps: 1, kbps: 1e3, mbps: 1e6, gbps: 1e9, tbps: 1e12 };

const DURATION_UNITS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1e3,
  sec: 1e3,
  secs: 1e3,
  second: 1e3,
  seconds: 1e3,
  min: 6e4,
  mins: 6e4,
  minute: 6e4,
  minutes: 6e4,
  h: 3.6e6,
  hr: 3.6e6,
  hrs: 3.6e6,
  hour: 3.6e6,
  hours: 3.6e6,
  day: 8.64e7,
  days: 8.64e7,
};

/** Units that make an answer a rate ("1.2K/s", "300 qps"). */
const RATE_RE = /(\/\s*s(ec(ond)?)?|rps|qps|tps|req\/s|per\s+second)$/i;

export interface ParsedQuantity {
  value: number;
  kind: QuantityKind;
}

/**
 * Parses "1,200", "1.2k", "3 million", "2e6", "500 GB", "1.5TB", "40 Mbps", "12 ms", "1.2K/s".
 * A bare "B" means billion ("2B users") unless `prefer` is 'bytes' (a size field: "500 B").
 * Returns undefined for anything that isn't a number with a recognised suffix.
 */
export const parseQuantity = (input: string, prefer?: 'bytes'): ParsedQuantity | undefined => {
  // A trailing % is read as a plain number ("18%" → 18): drills state percentages as numbers.
  let text = input.trim().toLowerCase().replace(/,/g, '').replace(/^~|^≈|^about\s+/, '').replace(/\s*%$/, '').trim();
  if (!text) return undefined;
  let kind: QuantityKind = 'count';
  if (RATE_RE.test(text)) {
    kind = 'rate';
    text = text.replace(RATE_RE, '').trim();
  }
  const match = text.match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-zµ]*)$/);
  if (!match) return undefined;
  const base = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(base)) return undefined;
  if (!unit) return { value: base, kind: prefer === 'bytes' && kind === 'count' ? 'bytes' : kind };
  if (unit in BIT_UNITS) return { value: base * BIT_UNITS[unit], kind: 'bitrate' };
  if (unit in BYTE_UNITS && (unit !== 'b' || prefer === 'bytes')) return { value: base * BYTE_UNITS[unit], kind: kind === 'rate' ? 'rate' : 'bytes' };
  if (unit in DURATION_UNITS) return { value: base * DURATION_UNITS[unit], kind: 'duration' };
  if (unit in COUNT_SUFFIX) return { value: base * COUNT_SUFFIX[unit], kind };
  return undefined;
};

const trim = (n: number, digits: number) => {
  const fixed = n.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
};

/** 3 significant figures at most, without trailing zeros. */
const sig = (n: number) => {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return trim(n, digits);
};

/** 1157 → "1.16K", 9_090_909 → "9.09M". Small numbers are shown as they are. */
export const formatCount = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sig(n / 1e12)}T`;
  if (abs >= 1e9) return `${sig(n / 1e9)}B`;
  if (abs >= 1e6) return `${sig(n / 1e6)}M`;
  if (abs >= 1e4) return `${sig(n / 1e3)}K`;
  return abs >= 100 ? Math.round(n).toLocaleString('en-US') : sig(n);
};

/** Exact-ish figure with thousands separators, for formulas: 1156.7 → "1,157". */
export const formatPlain = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e15) return n.toExponential(2);
  if (abs >= 100) return Math.round(n).toLocaleString('en-US');
  return sig(n);
};

const BYTE_STEPS: [number, string][] = [
  [1e18, 'EB'],
  [1e15, 'PB'],
  [1e12, 'TB'],
  [1e9, 'GB'],
  [1e6, 'MB'],
  [1e3, 'KB'],
];

export const formatBytes = (n: number) => {
  for (const [size, unit] of BYTE_STEPS) if (Math.abs(n) >= size) return `${sig(n / size)} ${unit}`;
  return `${sig(n)} B`;
};

/** Bytes per second as both MB/s and network bits (Gbit/s is how links are sold). */
export const formatByteRate = (bytesPerSecond: number) => {
  const bits = bytesPerSecond * 8;
  const bitText = bits >= 1e9 ? `${sig(bits / 1e9)} Gbit/s` : bits >= 1e6 ? `${sig(bits / 1e6)} Mbit/s` : `${sig(bits / 1e3)} kbit/s`;
  return `${formatBytes(bytesPerSecond)}/s (${bitText})`;
};

export const formatDuration = (ms: number) => {
  if (ms >= 3.6e6) return `${sig(ms / 3.6e6)} h`;
  if (ms >= 6e4) return `${sig(ms / 6e4)} min`;
  if (ms >= 1e3) return `${sig(ms / 1e3)} s`;
  if (ms >= 1) return `${sig(ms)} ms`;
  return `${sig(ms * 1e3)} µs`;
};

export const formatQuantity = (value: number, kind: QuantityKind) => {
  switch (kind) {
    case 'bytes':
      return formatBytes(value);
    case 'rate':
      return `${formatCount(value)}/s`;
    case 'bitrate':
      return value >= 1e9 ? `${sig(value / 1e9)} Gbit/s` : `${sig(value / 1e6)} Mbit/s`;
    case 'duration':
      return formatDuration(value);
    default:
      return formatCount(value);
  }
};

/** How far apart two positive quantities are, as a factor ≥ 1 (2 = "off by 2×"). */
export const ratio = (a: number, b: number) => {
  if (a <= 0 || b <= 0) return Number.POSITIVE_INFINITY;
  return a > b ? a / b : b / a;
};
