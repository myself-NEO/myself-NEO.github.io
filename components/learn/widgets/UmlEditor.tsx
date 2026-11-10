import React, { useEffect, useId, useRef, useState } from 'react';
import UmlDiagram from '../UmlDiagram';

// A class-diagram workspace in the same text notation the lessons use (```uml blocks):
// the text is the diagram, previewed live, with a syntax reference one click away.

const PLACEHOLDER = `class ParkingLot
  - levels: List<Level>
  + park(v: Vehicle): Ticket
interface PricingStrategy
  + fee(t: Ticket, exit: Instant): long
class HourlyPricing
HourlyPricing ..|> PricingStrategy
ParkingLot *-- "1..*" Level : owns
ParkingLot --> PricingStrategy : delegates fees`;

const SYNTAX: [string, string][] = [
  ['class Name', 'also: abstract class, interface, enum, record'],
  ['  - field: Type', 'indented members; + public, - private, # protected'],
  ['  + method(arg: Type): Return', 'a member with ( ) is a method'],
  ['A --|> B', 'A extends B'],
  ['A ..|> B', 'A implements B'],
  ['A *-- "1..*" B : label', 'composition (A owns B), optional multiplicity and label'],
  ['A o-- B', 'aggregation (B can exist without A)'],
  ['A --> B', 'association (A holds a B)'],
  ['A ..> B', 'dependency (A uses B transiently)'],
];

interface UmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
}

const UmlEditor: React.FC<UmlEditorProps> = ({ value, onChange, label, rows = 14 }) => {
  const id = useId();
  const [preview, setPreview] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(value), 400);
    return () => clearTimeout(timer.current);
  }, [value]);

  return (
    <div className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4 space-y-3">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="min-w-0">
          <label htmlFor={`${id}-source`} className="block text-sm font-semibold text-slate-200 mb-1.5">
            {label}
          </label>
          <textarea
            id={`${id}-source`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            aria-describedby={`${id}-help`}
            className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-[13px] leading-5 text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <details id={`${id}-help`} className="mt-2 text-xs text-slate-400">
            <summary className="cursor-pointer font-semibold text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">
              Diagram syntax
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              {SYNTAX.map(([code, meaning]) => (
                <React.Fragment key={code}>
                  <dt className="font-mono text-sky-300 whitespace-pre">{code}</dt>
                  <dd>{meaning}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        </div>
        <div className="min-w-0 [&>figure]:!my-0" aria-live="off">
          {/* The diagram's own subheadings are h4s; this keeps the outline in order under the phase's h2. */}
          <h3 className="sr-only">Preview of your class diagram</h3>
          {preview.trim() ? (
            <UmlDiagram source={preview} title="Preview" />
          ) : (
            <div className="h-full min-h-[10rem] rounded-xl border border-dashed border-slate-700 flex items-center justify-center p-4 text-sm text-slate-400 text-center">
              Your class diagram appears here as you type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UmlEditor;
