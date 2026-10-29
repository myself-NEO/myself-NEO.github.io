import React, { useMemo } from 'react';

// Renders a lightweight class diagram from a text block:
//
//   interface PricingStrategy
//     + priceFor(ticket: Ticket): Money
//   class ParkingLot
//     - levels: List<Level>
//     + park(vehicle: Vehicle): Ticket
//   ParkingLot *-- "1..*" Level : contains
//   HourlyPricing ..|> PricingStrategy
//
// Declarations: class | abstract class | interface | enum | record, members indented below.
// Relationships: --|> extends, ..|> implements, *-- composition, o-- aggregation,
//                --> association, ..> dependency (optional "multiplicity" on either side, ": label").

type Kind = 'class' | 'abstract' | 'interface' | 'enum' | 'record';
type RelType = 'extends' | 'implements' | 'composition' | 'aggregation' | 'association' | 'dependency';

interface UmlClass {
  name: string;
  kind: Kind;
  fields: string[];
  methods: string[];
}

interface UmlRelation {
  from: string;
  to: string;
  type: RelType;
  fromMult?: string;
  toMult?: string;
  label?: string;
}

const DECL_RE = /^(abstract class|class|interface|enum|record)\s+([\w<>, ]+?)\s*$/;
const REL_RE = /^(\w+)\s+(?:"([^"]*)"\s+)?(--\|>|\.\.\|>|\*--|o--|-->|\.\.>)\s+(?:"([^"]*)"\s+)?(\w+)(?:\s*:\s*(.+))?$/;

const OPERATOR_TYPE: Record<string, RelType> = {
  '--|>': 'extends',
  '..|>': 'implements',
  '*--': 'composition',
  'o--': 'aggregation',
  '-->': 'association',
  '..>': 'dependency',
};

const parseUml = (source: string) => {
  const classes: UmlClass[] = [];
  const relations: UmlRelation[] = [];
  let current: UmlClass | null = null;

  for (const rawLine of source.split('\n')) {
    if (!rawLine.trim() || rawLine.trim().startsWith('//')) continue;
    const indented = /^\s/.test(rawLine);
    const line = rawLine.trim();

    if (indented && current) {
      const isEnumConstant = current.kind === 'enum' && /^[A-Z][A-Z0-9_]*(\(.*\))?$/.test(line);
      (line.includes('(') && !isEnumConstant ? current.methods : current.fields).push(line);
      continue;
    }

    const decl = line.match(DECL_RE);
    if (decl) {
      const kind = decl[1] === 'abstract class' ? 'abstract' : (decl[1] as Kind);
      current = { name: decl[2], kind, fields: [], methods: [] };
      classes.push(current);
      continue;
    }

    const rel = line.match(REL_RE);
    if (rel) {
      relations.push({
        from: rel[1],
        fromMult: rel[2],
        type: OPERATOR_TYPE[rel[3]],
        toMult: rel[4],
        to: rel[5],
        label: rel[6],
      });
      current = null;
    }
  }
  return { classes, relations };
};

const STEREOTYPE: Partial<Record<Kind, string>> = {
  interface: '«interface»',
  abstract: '«abstract»',
  enum: '«enumeration»',
  record: '«record»',
};

const KIND_ACCENT: Record<Kind, string> = {
  class: 'border-sky-500/40',
  abstract: 'border-indigo-400/40',
  interface: 'border-violet-400/50',
  enum: 'border-amber-400/40',
  record: 'border-emerald-400/40',
};

const REL_META: Record<RelType, { glyph: string; name: string; describe: (r: UmlRelation) => string }> = {
  extends: { glyph: '───▷', name: 'Inheritance', describe: (r) => `${r.from} is a ${r.to} (extends)` },
  implements: { glyph: '- - -▷', name: 'Realization', describe: (r) => `${r.from} implements ${r.to}` },
  composition: {
    glyph: '◆───',
    name: 'Composition',
    describe: (r) => `${r.from} owns ${r.to}; the part's lifetime is bound to the whole`,
  },
  aggregation: {
    glyph: '◇───',
    name: 'Aggregation',
    describe: (r) => `${r.from} has ${r.to}, which can exist independently`,
  },
  association: { glyph: '───>', name: 'Association', describe: (r) => `${r.from} holds a reference to ${r.to}` },
  dependency: { glyph: '- - ->', name: 'Dependency', describe: (r) => `${r.from} uses ${r.to} transiently` },
};

const Member: React.FC<{ text: string }> = ({ text }) => {
  const visibility = text[0];
  const hasVisibility = '+-#~'.includes(visibility);
  const colour = { '+': 'text-emerald-400', '-': 'text-rose-400', '#': 'text-amber-400', '~': 'text-sky-400' }[visibility];
  return (
    <li className="font-mono text-[12px] leading-5 text-slate-300 break-words">
      {hasVisibility && <span className={`${colour} mr-1`}>{visibility}</span>}
      {hasVisibility ? text.slice(1).trim() : text}
    </li>
  );
};

const UmlDiagram: React.FC<{ source: string; title?: string }> = ({ source, title }) => {
  const { classes, relations } = useMemo(() => parseUml(source), [source]);

  return (
    <figure className="not-prose my-6 rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 sm:p-5">
      <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
        {title ?? 'Class diagram'}
      </figcaption>

      {classes.length > 0 && (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {classes.map((c) => (
            <div key={c.name} className={`rounded-lg border bg-slate-950/60 ${KIND_ACCENT[c.kind]}`}>
              <div className="px-3 py-2 text-center border-b border-slate-800">
                {STEREOTYPE[c.kind] && <div className="text-[10px] text-slate-500 font-mono">{STEREOTYPE[c.kind]}</div>}
                <div className={`font-mono font-semibold text-sm text-white ${c.kind === 'abstract' ? 'italic' : ''}`}>{c.name}</div>
              </div>
              {c.fields.length > 0 && (
                <ul className="px-3 py-2 border-b border-slate-800 last:border-b-0">
                  {c.fields.map((f) => (
                    <Member key={f} text={f} />
                  ))}
                </ul>
              )}
              {c.methods.length > 0 && (
                <ul className="px-3 py-2">
                  {c.methods.map((m) => (
                    <Member key={m} text={m} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {relations.length > 0 && (
        <div className={classes.length > 0 ? 'mt-5' : ''}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Relationships</h4>
          <ul className="space-y-2">
            {relations.map((r, i) => {
              const meta = REL_META[r.type];
              return (
                <li key={i} className="rounded-lg bg-slate-950/50 border border-slate-800 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px]">
                    <span className="text-white font-semibold">{r.from}</span>
                    {r.fromMult && <span className="text-slate-500">{r.fromMult}</span>}
                    <span className="text-sky-400" aria-hidden="true">{meta.glyph}</span>
                    {r.toMult && <span className="text-slate-500">{r.toMult}</span>}
                    <span className="text-white font-semibold">{r.to}</span>
                    {r.label && <span className="text-slate-400 font-sans">: {r.label}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    <span className="text-slate-300 font-medium">{meta.name}.</span> {meta.describe(r)}
                    {r.toMult ? ` (multiplicity ${r.toMult})` : ''}.
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </figure>
  );
};

export default UmlDiagram;
