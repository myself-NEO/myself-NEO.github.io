import React, { lazy, Suspense } from 'react';
import { keywords, LldInterviewScript, LldScriptPhase, matchClarification, mentions, mentionsType, parseLldInterviewScript, Section } from '../../../content/system-design/lld/interview';
import { PHASE_BUDGETS, RUBRIC } from '../../../content/system-design/lld/landing';
import { interviewActions, PhaseId } from '../../learn/interviews';
import { CoverageList, Draft, DraftPhase, Hints, joinSections, Reference, useAutosave, WidgetFallback } from '../interview/parts';
import { InterviewKit, PhaseDef, PhaseGuide, PhaseProps } from '../interview/kit';

const UmlEditor = lazy(() => import('../../learn/widgets/UmlEditor'));

type Props = PhaseProps<LldInterviewScript>;

export const PHASES: PhaseDef[] = [
  { id: 'clarify', label: 'Clarify the problem', short: 'Clarify' },
  { id: 'requirements', label: 'Define requirements', short: 'Requirements' },
  { id: 'entities', label: 'Identify entities and responsibilities', short: 'Entities' },
  { id: 'class-design', label: 'Design the classes', short: 'Class design' },
  { id: 'implementation', label: 'Implement the core flow', short: 'Implementation' },
  { id: 'edge-cases', label: 'Edge cases & concurrency', short: 'Edge cases' },
  { id: 'extensibility', label: 'Follow-ups & extensions', short: 'Follow-ups' },
  { id: 'evaluation', label: 'Self-evaluation', short: 'Evaluate' },
];

/** What each phase should produce, and generic hints used when the breakdown has none. */
export const PHASE_GUIDE: Record<LldScriptPhase, PhaseGuide> = {
  clarify: {
    goal: 'Pin down what the system must do, the rules it enforces, how it fails, what is out of scope and whether calls run concurrently.',
    say: '“Before I model anything, let me check the rules and the scope…”',
    hints: [
      'Ask about capabilities: what can each actor do, and which variants exist (types, sizes, tiers)?',
      'Ask about rules and errors: what is allowed, what is rejected, and what happens on failure?',
      'Ask whether several threads or users act at once — it decides how much of the design is about concurrency.',
    ],
  },
  requirements: {
    goal: 'Write the functional requirements as operations, and the non-functional ones that shape the classes: thread safety, swappable policies, efficiency.',
    say: '“So the core operations are… it must be thread-safe, and pricing should be swappable. Is that the right scope?”',
    hints: [
      'Phrase each functional requirement as an operation the API will expose: “park a vehicle and issue a ticket”.',
      'Non-functional requirements in LLD are about the code: thread safety, extensibility, testability, time complexity.',
      'Say what is out of scope (persistence, UI, payments) so you don’t design it.',
    ],
  },
  entities: {
    goal: 'List the core entities and give each one responsibility. Decide which are value objects, which are enums and which own state.',
    say: '“The nouns are… the ones with behaviour are… Ticket is a value object, so a record.”',
    hints: [
      'Underline the nouns in the requirements, then drop the ones with no state or behaviour you need.',
      'Give each entity one sentence of responsibility; if you need “and”, it may be two classes.',
      'Fixed sets (types, sizes, states) are enums; immutable data carriers are records.',
    ],
  },
  'class-design': {
    goal: 'Draw the classes, interfaces and relationships. Put each rule in the class that owns the data, and an interface wherever behaviour varies.',
    say: '“ParkingLot orchestrates; each Level owns its spots and allocates them; pricing sits behind an interface so it can change.”',
    hints: [
      'Put behaviour where the data lives (information expert) instead of in a central manager.',
      'Introduce an interface only where a requirement says the behaviour varies or will change.',
      'Prefer composition: the whole owns its parts; inheritance only for a true is-a with shared behaviour.',
    ],
  },
  implementation: {
    goal: 'Write the core flow in Java: the main entry points, the invariants they check and the exceptions they throw. Skip getters and boilerplate.',
    say: '“Let me code park() first — it’s the flow everything else depends on…”',
    hints: [
      'Start with the method that carries the main requirement, then the one that undoes it.',
      'Validate at the boundary and throw a specific exception; keep the rest of the code free of defensive checks.',
      'Inject time, IDs and policies through constructors so the code is testable.',
    ],
  },
  'edge-cases': {
    goal: 'Walk the edge cases — invalid input, empty, full, duplicates, repeated calls — then find the shared state and make every check-then-act atomic.',
    say: '“Two gates could claim the same spot at once, so the claim has to be atomic…”',
    hints: [
      'For each operation ask: what if it’s called twice, with bad input, or when there’s nothing left?',
      'List the shared mutable state; every read-decide-write on it needs a lock, an atomic or a concurrent collection.',
      'Say how you would test it: unit tests with an injected clock, plus one test that runs callers in parallel.',
    ],
  },
  extensibility: {
    goal: 'Take the follow-ups: show that each one is a new class or a local change, and state the complexity of the key operations.',
    say: '“Weekend pricing is a new strategy that wraps the hourly one — nothing else changes.”',
    hints: [
      'Answer a follow-up by naming what you add and what stays untouched.',
      'Decorator, Strategy and Observer turn most follow-ups into new classes.',
      'If a follow-up forces edits everywhere, say which earlier decision you would revisit.',
    ],
  },
};

const sectionsMarkdown = (script: LldInterviewScript, steps: Section[], extra: string[] = []) =>
  joinSections(script.sections, [...steps.map((s) => s.title), ...extra]);

const labelOf = (script: LldInterviewScript, steps: Section[], extra: string[] = []) =>
  [...steps.map((s) => s.title), ...extra.filter((t) => script.sections[t]?.trim())].join(' · ');

const ClassDesignPhase: React.FC<Props> = ({ track, slug, session, script, tools }) => {
  const { text, onChange } = useAutosave(session.diagram, (t) => interviewActions.setDiagram(track.id, slug, t));
  const extra = ['Design decisions', 'Patterns and principles'];
  return (
    <div className="space-y-5">
      <Suspense fallback={<WidgetFallback />}>
        <UmlEditor value={text} onChange={onChange} label="Your class diagram" />
      </Suspense>
      <Draft
        track={track}
        slug={slug}
        session={session}
        draftKey="class-design"
        label="Key decisions: where each rule lives, the interfaces, the patterns and why"
        placeholder={'- Allocation lives in … because …\n- … is an interface because requirement … says it will change\n- Pattern: … — not … because …'}
        rows={6}
      />
      <Hints track={track} slug={slug} session={session} hintKey="class-design" hints={script.hints['class-design'] ?? PHASE_GUIDE['class-design'].hints} />
      <Reference
        track={track}
        slug={slug}
        session={session}
        revealKey="class-design"
        label={labelOf(script, script.design, extra)}
        markdown={sectionsMarkdown(script, script.design, extra)}
        markdownEnv={{ onToggleQuestion: tools.onToggleQuestion, savedQuestions: tools.savedQuestions }}
      />
    </div>
  );
};

const ImplementationPhase: React.FC<Props> = ({ track, slug, session, script }) => {
  const implementation = script.implementation;
  const markdown = [implementation ? `### ${implementation.title}\n\n${implementation.body.replace(/^(#{3,5}) /gm, '#$1 ')}` : '', joinSections(script.sections, ['Example execution flow'])]
    .filter(Boolean)
    .join('\n\n');
  return (
    <div className="space-y-5">
      <Draft
        track={track}
        slug={slug}
        session={session}
        draftKey="implementation"
        label="Your implementation of the core flow (Java)"
        placeholder={'public final class ParkingLot {\n    private final List<Level> levels;\n\n    public Ticket park(Vehicle vehicle) {\n        // validate, claim atomically, issue the ticket\n    }\n}'}
        rows={18}
      />
      <Hints track={track} slug={slug} session={session} hintKey="implementation" hints={script.hints.implementation ?? PHASE_GUIDE.implementation.hints} />
      <Reference
        track={track}
        slug={slug}
        session={session}
        revealKey="implementation"
        label={[implementation?.title, script.sections['Example execution flow'] ? 'Example execution flow' : ''].filter(Boolean).join(' · ')}
        markdown={markdown}
      />
    </div>
  );
};

const EdgeCasesPhase: React.FC<Props> = ({ track, slug, session, script }) => (
  <div className="space-y-5">
    <Draft
      track={track}
      slug={slug}
      session={session}
      draftKey="edge-cases"
      label="Edge cases, the shared state and how you make it safe, and how you would test it"
      placeholder={'Edge cases\n- … called twice → …\n- Nothing left → …\n\nConcurrency\n- Shared state: … guarded by …\n\nTests\n- …'}
      rows={10}
    />
    <Hints track={track} slug={slug} session={session} hintKey="edge-cases" hints={PHASE_GUIDE['edge-cases'].hints} />
    <div className="flex flex-col gap-3">
      <Reference
        track={track}
        slug={slug}
        session={session}
        revealKey="edge-cases"
        label={labelOf(script, [], ['Edge cases', 'Concurrency'])}
        markdown={joinSections(script.sections, ['Edge cases', 'Concurrency'])}
      />
      <Reference track={track} slug={slug} session={session} revealKey="tests" label="Tests" markdown={script.sections.Tests ?? ''} />
    </div>
  </div>
);

const FollowUpPhase: React.FC<Props> = ({ track, slug, session, script }) => {
  const chosen = session.deepDives ?? [];
  const toggle = (i: number) => interviewActions.setDeepDives(track.id, slug, chosen.includes(i) ? chosen.filter((c) => c !== i) : [...chosen, i].sort((a, b) => a - b));
  const extra = ['Common mistakes and alternatives', 'Complexity'];
  return (
    <div className="space-y-5">
      {script.followUps.length > 0 && (
        <fieldset className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-200">Choose one or two follow-ups the interviewer might ask</legend>
          <p className="text-xs text-slate-400 mb-3">Explain the change before opening the answer: what you add, and what stays untouched.</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {script.followUps.map((f, i) => (
              <li key={f.title}>
                <label className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
                  <input type="checkbox" checked={chosen.includes(i)} onChange={() => toggle(i)} className="mt-0.5 accent-sky-500" />
                  <span>{f.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {script.followUps.length > 0 && chosen.length === 0 && <p className="text-sm text-slate-400">Pick at least one follow-up to work on.</p>}
      {chosen.map((i) => {
        const f = script.followUps[i];
        if (!f) return null;
        return (
          // A group, not a region: the revealed reference inside is already a region with this name.
          <div key={f.title} role="group" aria-label={f.title} className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4 space-y-4">
            <h3 className="font-bold text-white">{f.title}</h3>
            <Draft
              track={track}
              slug={slug}
              session={session}
              draftKey={`follow:${i}`}
              label="Your change: the classes you add or modify, and what stays the same"
              placeholder={'Add: … implements …\nChange: … (one line in …)\nUntouched: …'}
              rows={5}
            />
            <Reference track={track} slug={slug} session={session} revealKey={`follow:${i}`} label={f.title} markdown={f.body} />
          </div>
        );
      })}
      <Hints track={track} slug={slug} session={session} hintKey="extensibility" hints={PHASE_GUIDE.extensibility.hints} />
      <Reference track={track} slug={slug} session={session} revealKey="extensibility" label={labelOf(script, [], extra)} markdown={joinSections(script.sections, extra)} />
    </div>
  );
};

const renderPhase = (phase: PhaseId, props: Props): React.ReactNode => {
  const { track, slug, session, script } = props;
  switch (phase) {
    case 'requirements': {
      const text = session.drafts.requirements ?? '';
      return (
        <DraftPhase
          {...props}
          draftKey="requirements"
          label="Functional and non-functional requirements"
          placeholder={'Functional\n1. … (one operation per line)\n\nNon-functional\n- Thread-safe: …\n- … should be swappable\n\nOut of scope: …'}
          rows={10}
          hints={PHASE_GUIDE.requirements.hints}
          reference={{ label: 'Requirements', markdown: script.sections.Requirements ?? '' }}
          after={script.requirements.map((group, i) => (
            <CoverageList key={group.title} track={track} slug={slug} session={session} title={group.title} prefix={`req${i}`} items={group.items} text={text} mentions={mentions} />
          ))}
        />
      );
    }
    case 'entities': {
      const text = session.drafts.entities ?? '';
      const items = script.types.map((t) => ({ text: `\`${t.name}\` · ${t.kind}`, terms: [t.name] }));
      return (
        <DraftPhase
          {...props}
          draftKey="entities"
          label="Entities, their kind and one responsibility each"
          placeholder={'ParkingLot (class): park and unpark; owns the levels\nTicket (record): …\nVehicleType (enum): …'}
          rows={8}
          hints={script.hints.entities ?? PHASE_GUIDE.entities.hints}
          reference={{ label: labelOf(script, script.modelling), markdown: sectionsMarkdown(script, script.modelling) }}
          after={<CoverageList track={track} slug={slug} session={session} title="Types in the reference class diagram" prefix="types" items={items} text={text} mentions={mentionsType} />}
        />
      );
    }
    case 'class-design':
      return <ClassDesignPhase {...props} />;
    case 'implementation':
      return <ImplementationPhase {...props} />;
    case 'edge-cases':
      return <EdgeCasesPhase {...props} />;
    case 'extensibility':
      return <FollowUpPhase {...props} />;
    default:
      return null;
  }
};

export const LLD_INTERVIEW_KIT: InterviewKit<LldInterviewScript> = {
  phases: PHASES,
  budgets: PHASE_BUDGETS,
  guide: PHASE_GUIDE,
  rubric: RUBRIC,
  parse: parseLldInterviewScript,
  matcher: { keywords, matchClarification, mentions },
  howItWorks: [
    'Ask clarifying questions; the interviewer answers from this problem’s script.',
    'Write the requirements, list the entities and draw the class diagram.',
    'Code the core flow in Java, then cover edge cases and concurrency.',
    'Take on a follow-up; hints and the reference solution stay hidden until you open them.',
    'Finish by rating yourself on the interview rubric.',
  ],
  clarifyPlaceholder: 'Ask a clarifying question, e.g. “Can several gates park cars at the same time?”',
  noMatchAnswer:
    'No scripted answer for that one. In a real interview, state a reasonable assumption out loud (“I’ll assume …”) and move on — or rephrase if you meant the rules, errors, scope or concurrency.',
  designChoice:
    /\b(which|what)\s+(pattern|design pattern|class|classes|interface|data structure|collection|language|framework|database|db)\b|\b(should|can|could|may)\s+(i|we)\s+use\b/i,
  designChoiceAnswer:
    'That’s your call — it’s part of what is being evaluated. Pick an option, give the reason tied to the requirements, and I’ll push back if I disagree.',
  checklistTitle: 'Interviewer checklist',
  renderPhase,
};
