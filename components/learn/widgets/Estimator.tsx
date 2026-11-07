import React, { useId, useMemo, useState } from 'react';
import { DEFAULT_INPUTS, estimate, EstimateInputs, INPUT_FIELDS, OutputGroup, parsePreset } from './estimate';
import { formatBytes, formatCount, parseQuantity } from './numbers';
import { onRadioGroupKeyDown } from '../ui';

// Interactive capacity calculator. In markdown:
//
//   ```estimator title="URL shortener"
//   requestsPerDay = 100M
//   readsPerWrite = 10
//   writeBytes = 500 B
//   ```
//
// Inputs accept "10M", "1.5 KB", "3". The block keeps its own state unless `values` and
// `onChange` are given (the mock interview stores the learner's inputs).

export type EstimatorValues = Record<string, string>;

const GROUP_LABEL: Record<OutputGroup, string> = {
  traffic: 'Traffic',
  storage: 'Storage',
  bandwidth: 'Bandwidth',
  memory: 'Memory',
  servers: 'Servers',
};

const toText = (inputs: EstimateInputs): EstimatorValues => {
  const values: EstimatorValues = { mode: inputs.mode };
  for (const f of INPUT_FIELDS) {
    const v = inputs[f.key];
    values[f.key] = f.bytes ? formatBytes(v) : formatCount(v);
  }
  return values;
};

/** Text values → numbers; fields that don't parse fall back to the preset and are reported. */
const fromText = (values: EstimatorValues, fallback: EstimateInputs) => {
  const inputs: EstimateInputs = { ...fallback, mode: values.mode === 'users' ? 'users' : values.mode === 'requests' ? 'requests' : fallback.mode };
  const invalid = new Set<string>();
  for (const f of INPUT_FIELDS) {
    const text = values[f.key];
    if (text === undefined) continue;
    const parsed = parseQuantity(text.replace(/%$/, '').replace(/:1$/, ''), f.bytes ? 'bytes' : undefined);
    if (!parsed || parsed.value < 0) invalid.add(f.key);
    else inputs[f.key] = parsed.value;
  }
  return { inputs, invalid };
};

export const presetValues = (preset: string | undefined): EstimatorValues => toText(preset ? parsePreset(preset).inputs : DEFAULT_INPUTS);

interface EstimatorProps {
  title?: string;
  /** Body of an ```estimator block. */
  preset?: string;
  values?: EstimatorValues;
  onChange?: (values: EstimatorValues) => void;
  /** Hide the outer frame and title (used inside other panels). */
  bare?: boolean;
}

const inputClass =
  'w-full rounded-lg bg-slate-950/60 border px-2.5 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500';

const Estimator: React.FC<EstimatorProps> = ({ title, preset, values: controlled, onChange, bare }) => {
  const id = useId();
  const presetInputs = useMemo(() => (preset ? parsePreset(preset).inputs : DEFAULT_INPUTS), [preset]);
  const initial = useMemo(() => toText(presetInputs), [presetInputs]);
  const [own, setOwn] = useState<EstimatorValues>(initial);
  const [showFormulas, setShowFormulas] = useState(true);
  const values = controlled ?? own;
  const { inputs, invalid } = useMemo(() => fromText(values, presetInputs), [values, presetInputs]);
  const result = useMemo(() => estimate(inputs), [inputs]);

  const set = (next: EstimatorValues) => {
    if (onChange) onChange(next);
    if (!controlled) setOwn(next);
  };

  const groups = (Object.keys(GROUP_LABEL) as OutputGroup[]).map((g) => ({ group: g, items: result.outputs.filter((o) => o.group === g) }));
  const fields = INPUT_FIELDS.filter((f) => !f.modes || f.modes.includes(inputs.mode));

  const body = (
    <div className="grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-5">
      <fieldset className="min-w-0 m-0 p-0 border-0">
        <legend className="sr-only">Assumptions</legend>
        <div role="radiogroup" aria-label="Start from" onKeyDown={onRadioGroupKeyDown} className="inline-flex rounded-lg border border-slate-700 bg-slate-950/50 p-0.5 mb-3">
          {(['requests', 'users'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={inputs.mode === m}
              tabIndex={inputs.mode === m ? 0 : -1}
              onClick={() => set({ ...values, mode: m })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                inputs.mode === m ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'requests' ? 'Requests per day' : 'Users × requests'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {fields.map((f) => {
            const bad = invalid.has(f.key);
            const inputId = `${id}-${f.key}`;
            return (
              <div key={f.key} className="min-w-0">
                <label htmlFor={inputId} className="block text-[11px] font-semibold text-slate-400 mb-1 leading-tight">
                  {f.label}
                </label>
                <input
                  id={inputId}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set({ ...values, [f.key]: e.target.value })}
                  aria-invalid={bad}
                  aria-describedby={`${inputId}-hint`}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} ${bad ? 'border-rose-500/70' : 'border-slate-700'}`}
                />
                <span id={`${inputId}-hint`} className={`block text-[10px] mt-0.5 ${bad ? 'text-rose-300' : 'text-slate-400'}`}>
                  {bad ? 'Not a number — try 10M, 1.5 KB' : f.hint}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => set(initial)} className="text-slate-400 hover:text-white underline underline-offset-2">
            Reset to preset
          </button>
          <label className="inline-flex items-center gap-1.5 text-slate-400">
            <input type="checkbox" checked={showFormulas} onChange={(e) => setShowFormulas(e.target.checked)} className="accent-sky-500" />
            Show working
          </label>
        </div>
      </fieldset>

      <div className="min-w-0 space-y-4" aria-live="polite">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{GROUP_LABEL[group]}</h3>
            <dl className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/40">
              {items.map((o) => (
                <div key={o.id} className="px-3 py-2 flex flex-wrap items-baseline justify-between gap-x-3" data-output={o.id}>
                  <dt className="text-sm text-slate-300">{o.label}</dt>
                  <dd className="text-sm font-semibold text-white font-mono">{o.display}</dd>
                  {showFormulas && (
                    <dd className="basis-full mt-0.5 text-[12px] leading-snug text-slate-400 [overflow-wrap:anywhere]" data-working="">
                      {o.formula}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <figure className="not-prose my-6 rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 sm:p-5" data-widget="estimator">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">🧮 Capacity estimator{title ? ` · ${title}` : ''}</span>
        <span className="text-[11px] text-slate-400">Change any assumption; decimal units (1 KB = 1,000 B)</span>
      </figcaption>
      {body}
    </figure>
  );
};

export default Estimator;
