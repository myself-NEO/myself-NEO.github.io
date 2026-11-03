import { formatByteRate, formatBytes, formatCount, formatPlain, parseQuantity } from './numbers';

// Back-of-the-envelope capacity model used by the ```estimator block, the estimator page
// and the mock interview. Every output carries the formula with the numbers substituted,
// because the point is to learn the derivation, not to read off an answer.

export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_YEAR = 365;

export interface EstimateInputs {
  /** 'users': requests/day = DAU × requests per user; 'requests': requests/day is given. */
  mode: 'users' | 'requests';
  dau: number;
  requestsPerUser: number;
  requestsPerDay: number;
  /** Reads per write (10 means 10:1 read-heavy). 0 = write-only. */
  readsPerWrite: number;
  /** Bytes stored per write (the new record, metadata included). */
  writeBytes: number;
  /** Bytes returned per read (response size). */
  readBytes: number;
  retentionYears: number;
  /** Yearly traffic growth in percent (0 = flat). */
  growthPercent: number;
  /** Peak-to-average traffic ratio. */
  peakFactor: number;
  /** Copies of every byte kept (3 = leader + 2 replicas). */
  replication: number;
  /** Share of one day's read volume worth keeping in cache, in percent (the 80/20 rule gives 20). */
  cachePercent: number;
  /** Requests per second one application server handles at the target latency. */
  serverRps: number;
  /** Target utilisation of each server at peak, in percent (headroom for spikes and failures). */
  targetUtilization: number;
}

export const DEFAULT_INPUTS: EstimateInputs = {
  mode: 'requests',
  dau: 10_000_000,
  requestsPerUser: 10,
  requestsPerDay: 100_000_000,
  readsPerWrite: 10,
  writeBytes: 1_000,
  readBytes: 1_000,
  retentionYears: 5,
  growthPercent: 0,
  peakFactor: 3,
  replication: 3,
  cachePercent: 20,
  serverRps: 1_000,
  targetUtilization: 70,
};

export type OutputGroup = 'traffic' | 'storage' | 'bandwidth' | 'memory' | 'servers';

export interface EstimateOutput {
  id: string;
  group: OutputGroup;
  label: string;
  value: number;
  /** Human-readable value, e.g. "1.16K/s" or "16.6 TB". */
  display: string;
  /** The derivation, with numbers substituted. */
  formula: string;
}

export interface EstimateResult {
  requestsPerDay: number;
  writesPerDay: number;
  readsPerDay: number;
  avgRps: number;
  writeRps: number;
  readRps: number;
  peakRps: number;
  peakWriteRps: number;
  peakReadRps: number;
  storagePerDay: number;
  storagePerYear: number;
  storageTotal: number;
  storageReplicated: number;
  ingressPerSecond: number;
  egressPerSecond: number;
  peakEgressPerSecond: number;
  cacheBytes: number;
  servers: number;
  outputs: EstimateOutput[];
}

const n = formatPlain;
const pct = (p: number) => `${formatPlain(p)}%`;

/** Total stored over `years` when daily volume grows by `growthPercent` each year. */
export const growthTotal = (perYear: number, years: number, growthPercent: number) => {
  if (growthPercent === 0) return perYear * years;
  const g = growthPercent / 100;
  let total = 0;
  const whole = Math.floor(years);
  for (let y = 0; y < whole; y++) total += perYear * (1 + g) ** y;
  const fraction = years - whole;
  if (fraction > 0) total += perYear * (1 + g) ** whole * fraction;
  return total;
};

export const estimate = (inputs: EstimateInputs): EstimateResult => {
  const i = inputs;
  const requestsPerDay = i.mode === 'users' ? i.dau * i.requestsPerUser : i.requestsPerDay;
  const share = i.readsPerWrite + 1;
  const writesPerDay = requestsPerDay / share;
  const readsPerDay = requestsPerDay - writesPerDay;
  const avgRps = requestsPerDay / SECONDS_PER_DAY;
  const writeRps = writesPerDay / SECONDS_PER_DAY;
  const readRps = readsPerDay / SECONDS_PER_DAY;
  const peakRps = avgRps * i.peakFactor;
  const peakWriteRps = writeRps * i.peakFactor;
  const peakReadRps = readRps * i.peakFactor;
  const storagePerDay = writesPerDay * i.writeBytes;
  const storagePerYear = storagePerDay * DAYS_PER_YEAR;
  const storageTotal = growthTotal(storagePerYear, i.retentionYears, i.growthPercent);
  const storageReplicated = storageTotal * i.replication;
  const ingressPerSecond = writeRps * i.writeBytes;
  const egressPerSecond = readRps * i.readBytes;
  const peakEgressPerSecond = egressPerSecond * i.peakFactor;
  const cacheBytes = readsPerDay * i.readBytes * (i.cachePercent / 100);
  const perServer = i.serverRps * (i.targetUtilization / 100);
  const servers = perServer > 0 ? Math.max(1, Math.ceil(peakRps / perServer)) : 0;

  const requestsFormula =
    i.mode === 'users'
      ? `${n(i.dau)} DAU × ${n(i.requestsPerUser)} requests/user = ${n(requestsPerDay)} requests/day`
      : `given: ${n(requestsPerDay)} requests/day`;
  const split = `${n(i.readsPerWrite)}:1 read:write → writes are 1/${n(share)} of traffic`;
  const growthNote = i.growthPercent === 0 ? `× ${n(i.retentionYears)} years` : `over ${n(i.retentionYears)} years growing ${pct(i.growthPercent)}/year`;

  const outputs: EstimateOutput[] = [
    { id: 'requests-per-day', group: 'traffic', label: 'Requests per day', value: requestsPerDay, display: formatCount(requestsPerDay), formula: requestsFormula },
    { id: 'writes-per-day', group: 'traffic', label: 'Writes per day', value: writesPerDay, display: formatCount(writesPerDay), formula: `${n(requestsPerDay)} ÷ ${n(share)} (${split}) = ${n(writesPerDay)}` },
    { id: 'reads-per-day', group: 'traffic', label: 'Reads per day', value: readsPerDay, display: formatCount(readsPerDay), formula: `${n(requestsPerDay)} − ${n(writesPerDay)} = ${n(readsPerDay)}` },
    { id: 'avg-rps', group: 'traffic', label: 'Average requests/s', value: avgRps, display: `${formatCount(avgRps)}/s`, formula: `${n(requestsPerDay)} ÷ 86,400 s/day = ${n(avgRps)}/s (shortcut: ÷ 100K ≈ ${n(requestsPerDay / 1e5)}/s)` },
    { id: 'write-rps', group: 'traffic', label: 'Average writes/s', value: writeRps, display: `${formatCount(writeRps)}/s`, formula: `${n(writesPerDay)} ÷ 86,400 = ${n(writeRps)}/s` },
    { id: 'read-rps', group: 'traffic', label: 'Average reads/s', value: readRps, display: `${formatCount(readRps)}/s`, formula: `${n(readsPerDay)} ÷ 86,400 = ${n(readRps)}/s` },
    { id: 'peak-rps', group: 'traffic', label: 'Peak requests/s', value: peakRps, display: `${formatCount(peakRps)}/s`, formula: `${n(avgRps)}/s × ${n(i.peakFactor)} peak factor = ${n(peakRps)}/s (reads ${n(peakReadRps)}/s, writes ${n(peakWriteRps)}/s)` },
    { id: 'storage-day', group: 'storage', label: 'New data per day', value: storagePerDay, display: formatBytes(storagePerDay), formula: `${n(writesPerDay)} writes × ${formatBytes(i.writeBytes)} = ${formatBytes(storagePerDay)}` },
    { id: 'storage-year', group: 'storage', label: 'New data per year', value: storagePerYear, display: formatBytes(storagePerYear), formula: `${formatBytes(storagePerDay)} × 365 = ${formatBytes(storagePerYear)}` },
    { id: 'storage-total', group: 'storage', label: `Data kept (${n(i.retentionYears)} y retention)`, value: storageTotal, display: formatBytes(storageTotal), formula: `${formatBytes(storagePerYear)}/year ${growthNote} = ${formatBytes(storageTotal)}` },
    { id: 'storage-replicated', group: 'storage', label: 'Raw disk with replication', value: storageReplicated, display: formatBytes(storageReplicated), formula: `${formatBytes(storageTotal)} × ${n(i.replication)} copies = ${formatBytes(storageReplicated)} (before indexes and free-space headroom)` },
    { id: 'ingress', group: 'bandwidth', label: 'Ingress (writes), average', value: ingressPerSecond, display: formatByteRate(ingressPerSecond), formula: `${n(writeRps)} writes/s × ${formatBytes(i.writeBytes)} = ${formatByteRate(ingressPerSecond)}` },
    { id: 'egress', group: 'bandwidth', label: 'Egress (reads), average', value: egressPerSecond, display: formatByteRate(egressPerSecond), formula: `${n(readRps)} reads/s × ${formatBytes(i.readBytes)} = ${formatByteRate(egressPerSecond)}` },
    { id: 'egress-peak', group: 'bandwidth', label: 'Egress at peak', value: peakEgressPerSecond, display: formatByteRate(peakEgressPerSecond), formula: `${formatByteRate(egressPerSecond)} × ${n(i.peakFactor)} = ${formatByteRate(peakEgressPerSecond)}` },
    { id: 'cache', group: 'memory', label: 'Cache for the hot set', value: cacheBytes, display: formatBytes(cacheBytes), formula: `${n(readsPerDay)} reads/day × ${formatBytes(i.readBytes)} × ${pct(i.cachePercent)} = ${formatBytes(cacheBytes)} (upper bound: repeated reads of the same item need less)` },
    { id: 'servers', group: 'servers', label: 'Application servers at peak', value: servers, display: String(servers), formula: `${n(peakRps)}/s ÷ (${n(i.serverRps)}/s per server × ${pct(i.targetUtilization)} target) = ${servers} (add at least one more so a failure doesn't overload the rest)` },
  ];

  return {
    requestsPerDay,
    writesPerDay,
    readsPerDay,
    avgRps,
    writeRps,
    readRps,
    peakRps,
    peakWriteRps,
    peakReadRps,
    storagePerDay,
    storagePerYear,
    storageTotal,
    storageReplicated,
    ingressPerSecond,
    egressPerSecond,
    peakEgressPerSecond,
    cacheBytes,
    servers,
    outputs,
  };
};

type NumericKey = Exclude<keyof EstimateInputs, 'mode'>;

/** Fields shown in the calculator, in order, with the kind of quantity each one takes. */
export const INPUT_FIELDS: { key: NumericKey; label: string; hint: string; bytes?: boolean; modes?: EstimateInputs['mode'][] }[] = [
  { key: 'dau', label: 'Daily active users', hint: 'e.g. 10M', modes: ['users'] },
  { key: 'requestsPerUser', label: 'Requests per user per day', hint: 'reads + writes', modes: ['users'] },
  { key: 'requestsPerDay', label: 'Requests per day', hint: 'e.g. 100M', modes: ['requests'] },
  { key: 'readsPerWrite', label: 'Reads per write', hint: '10 = 10:1' },
  { key: 'writeBytes', label: 'Stored per write', hint: 'e.g. 1 KB', bytes: true },
  { key: 'readBytes', label: 'Returned per read', hint: 'e.g. 1 KB', bytes: true },
  { key: 'retentionYears', label: 'Retention (years)', hint: 'e.g. 5' },
  { key: 'growthPercent', label: 'Growth per year (%)', hint: '0 = flat' },
  { key: 'peakFactor', label: 'Peak ÷ average', hint: 'typically 2–5' },
  { key: 'replication', label: 'Copies of each byte', hint: 'e.g. 3' },
  { key: 'cachePercent', label: 'Hot share of reads (%)', hint: '80/20 rule → 20' },
  { key: 'serverRps', label: 'Requests/s per server', hint: 'at target latency' },
  { key: 'targetUtilization', label: 'Target utilisation (%)', hint: 'headroom, e.g. 70' },
];

const KEY_ALIASES: Record<string, NumericKey | 'mode'> = {
  mode: 'mode',
  dau: 'dau',
  users: 'dau',
  requestsperuser: 'requestsPerUser',
  actionsperuser: 'requestsPerUser',
  requestsperday: 'requestsPerDay',
  requests: 'requestsPerDay',
  readsperwrite: 'readsPerWrite',
  readwrite: 'readsPerWrite',
  writebytes: 'writeBytes',
  writesize: 'writeBytes',
  payload: 'writeBytes',
  readbytes: 'readBytes',
  readsize: 'readBytes',
  retentionyears: 'retentionYears',
  retention: 'retentionYears',
  growthpercent: 'growthPercent',
  growth: 'growthPercent',
  peakfactor: 'peakFactor',
  peak: 'peakFactor',
  replication: 'replication',
  cachepercent: 'cachePercent',
  cache: 'cachePercent',
  serverrps: 'serverRps',
  targetutilization: 'targetUtilization',
  utilization: 'targetUtilization',
};

export interface PresetParseResult {
  inputs: EstimateInputs;
  /** Lines that could not be understood (shown to authors by the validator). */
  errors: string[];
  title?: string;
}

/**
 * Parses an ```estimator block body: `key = value` lines (values like 10M, 1 KB, 3).
 * Setting dau or requestsPerUser switches to 'users' mode unless `mode` says otherwise.
 */
export const parsePreset = (source: string): PresetParseResult => {
  const inputs: EstimateInputs = { ...DEFAULT_INPUTS };
  const errors: string[] = [];
  let explicitMode = false;
  let sawUsers = false;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([\w\s-]+?)\s*[=:]\s*(.+)$/);
    if (!m) {
      errors.push(line);
      continue;
    }
    const alias = KEY_ALIASES[m[1].toLowerCase().replace(/[\s_-]/g, '')];
    if (!alias) {
      errors.push(line);
      continue;
    }
    if (alias === 'mode') {
      const value = m[2].trim().toLowerCase();
      if (value === 'users' || value === 'requests') {
        inputs.mode = value;
        explicitMode = true;
      } else errors.push(line);
      continue;
    }
    const valueText = m[2].trim().replace(/:1$/, '').replace(/%$/, '');
    const isBytes = INPUT_FIELDS.find((f) => f.key === alias)?.bytes;
    const parsed = parseQuantity(valueText, isBytes ? 'bytes' : undefined);
    if (!parsed) {
      errors.push(line);
      continue;
    }
    inputs[alias] = parsed.value;
    if (alias === 'dau' || alias === 'requestsPerUser') sawUsers = true;
  }
  if (!explicitMode && sawUsers) inputs.mode = 'users';
  return { inputs, errors };
};
