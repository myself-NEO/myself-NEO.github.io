import React, { lazy, Suspense } from 'react';
import { InterviewScript, matchClarification, mentions, keywords, parseInterviewScript, PHASE_SECTIONS, ScriptPhase } from '../../../content/system-design/hld/interview';
import { PHASE_BUDGETS, RUBRIC } from '../../../content/system-design/hld/landing';
import MarkdownContent from '../../learn/MarkdownContent';
import { interviewActions, PhaseId } from '../../learn/interviews';
import { CoverageList, Draft, DraftPhase, Hints, joinSections, Reference, useAutosave, WidgetFallback } from '../interview/parts';
import { InterviewKit, PhaseDef, PhaseGuide, PhaseProps } from '../interview/kit';

const Estimator = lazy(() => import('../../learn/widgets/Estimator'));
const DiagramEditor = lazy(() => import('../../learn/widgets/DiagramEditor'));

type Props = PhaseProps<InterviewScript>;

export const PHASES: PhaseDef[] = [
  { id: 'clarify', label: 'Clarify the problem', short: 'Clarify' },
  { id: 'requirements', label: 'Define requirements', short: 'Requirements' },
  { id: 'estimation', label: 'Estimate capacity', short: 'Estimate' },
  { id: 'api', label: 'Define the APIs', short: 'APIs' },
  { id: 'data-model', label: 'Model the data', short: 'Data model' },
  { id: 'architecture', label: 'High-level architecture', short: 'Architecture' },
  { id: 'deep-dives', label: 'Deep dives', short: 'Deep dives' },
  { id: 'bottlenecks', label: 'Bottlenecks & failures', short: 'Failures' },
  { id: 'tradeoffs', label: 'Trade-offs & wrap-up', short: 'Trade-offs' },
  { id: 'evaluation', label: 'Self-evaluation', short: 'Evaluate' },
];

/** What each phase should produce, and generic hints used when the breakdown has none. */
export const PHASE_GUIDE: Record<ScriptPhase, PhaseGuide> = {
  clarify: {
    goal: 'Clarify the use case, the users and the scope. Ask the questions whose answers change the design.',
    say: '“Before I design anything, I’d like to confirm a few things about scale and scope…”',
    hints: [
      'Ask about scale: users, requests per day, data volume, growth.',
      'Ask what matters most: latency, availability or consistency — and for which operation.',
      'Ask what is explicitly out of scope: accounts, analytics, admin tools, multi-region.',
    ],
  },
  requirements: {
    goal: 'Write 3–5 functional requirements (what users can do) and quantified non-functional requirements.',
    say: '“So the core features are… and the system must… Let me prioritise these.”',
    hints: [
      'Phrase functional requirements as user capabilities: “Users can …”.',
      'Give numbers for non-functional requirements: p99 latency, availability nines, durability, scale.',
      'Say which consistency each core operation needs — it is rarely the same for all of them.',
    ],
  },
  estimation: {
    goal: 'Estimate only the numbers that change the design, out loud, in two or three minutes — and say what each implies.',
    say: '“That’s about N requests per second at peak, which means…”',
    hints: [
      'Convert per-day numbers to per-second: divide by ~100,000 (86,400 rounded).',
      'Split reads from writes — the ratio usually decides whether caching is central.',
      'Storage = writes/day × bytes × days kept × replication factor.',
    ],
  },
  api: {
    goal: 'One endpoint per functional requirement: method, path, request, response and status codes; auth, pagination and idempotency.',
    say: '“For creating X, I’d expose POST /x returning 201 with…”',
    hints: [
      'Use plural resource nouns and the right HTTP method for each action.',
      'Take the user’s identity from the auth token, not from the request body.',
      'Any list endpoint needs pagination; any non-idempotent write may need an idempotency key.',
    ],
  },
  'data-model': {
    goal: 'Name the core entities, keys and relationships; choose a store for each from its access pattern; note indexes and partition keys.',
    say: '“The main entities are… I’ll keep X in Postgres because… and partition by…”',
    hints: [
      'List the access patterns your APIs need, then design keys and indexes to serve them.',
      'Choose the store per entity — not one database for everything by default.',
      'Name the partition key and check it doesn’t create a hot spot.',
    ],
  },
  architecture: {
    goal: 'Draw a working design that satisfies every functional requirement — build it one endpoint at a time and narrate the flow.',
    say: '“A request to shorten comes through the load balancer to the write service, which…”',
    hints: [
      'Start with client → load balancer → stateless service → database, then add only what a requirement needs.',
      'Trace each API call through the diagram; every box should be on at least one path.',
      'Mark where caches and queues will go, but defer optimisation to the deep dives.',
    ],
  },
  'deep-dives': {
    goal: 'Pick the two or three hardest parts — usually where the non-functional requirements bite — and go deep with options and trade-offs.',
    say: '“The hardest part here is… there are three ways to handle it…”',
    hints: [
      'Go from simplest to most sophisticated option and say why each falls short.',
      'Tie every option back to a number from your estimate or a non-functional requirement.',
      'At senior level, choose the deep dives yourself before the interviewer does.',
    ],
  },
  bottlenecks: {
    goal: 'Stress the design: single points of failure, hot partitions, cache failures, backlogs, network failures and races.',
    say: '“If the cache cluster fails, all reads hit the database, so…”',
    hints: [
      'Walk every box in the diagram and ask: what happens if this is slow, or gone?',
      'Look for hot keys and hot partitions in your data model.',
      'For each failure: how is it detected, how is it mitigated, what does the user see?',
    ],
  },
  tradeoffs: {
    goal: 'Summarise the design, the alternatives you rejected and why, and what you would build or monitor next.',
    say: '“To summarise… I chose X over Y because… if requirements changed to Z, I’d…”',
    hints: [
      'Give a 30-second summary of the final design first.',
      'Name the two or three biggest trade-offs and the alternative for each.',
      'Close with monitoring, security and how the design would evolve.',
    ],
  },
};

/** The breakdown sections answering a phase, joined into one markdown document. */
export const phaseReference = (script: InterviewScript, phase: ScriptPhase, only?: string[]) => joinSections(script.sections, only ?? PHASE_SECTIONS[phase]);

/** A written phase whose reference is the breakdown's sections for it. */
const HldDraftPhase: React.FC<Props & { phase: ScriptPhase; label: string; placeholder: string; rows?: number; children?: React.ReactNode; after?: React.ReactNode }> = ({
  track,
  slug,
  session,
  script,
  tools,
  phase,
  label,
  placeholder,
  rows,
  children,
  after,
}) => (
  <DraftPhase
    track={track}
    slug={slug}
    session={session}
    tools={tools}
    draftKey={phase}
    label={label}
    placeholder={placeholder}
    rows={rows}
    hints={script.hints[phase] ?? PHASE_GUIDE[phase].hints}
    reference={{ label: PHASE_SECTIONS[phase].filter((t) => script.sections[t]).join(' · '), markdown: phaseReference(script, phase) }}
    after={after}
  >
    {children}
  </DraftPhase>
);

const ArchitecturePhase: React.FC<Props> = ({ track, slug, session, script, tools }) => {
  const { text, onChange } = useAutosave(session.diagram, (t) => interviewActions.setDiagram(track.id, slug, t));
  return (
    <div className="space-y-5">
      <Suspense fallback={<WidgetFallback />}>
        <DiagramEditor value={text} onChange={onChange} label="Your architecture (Mermaid)" />
      </Suspense>
      <Draft
        track={track}
        slug={slug}
        session={session}
        draftKey="architecture"
        label="Walk through the main request flows"
        placeholder={'1. Write path: client → LB → service → …\n2. Read path: …'}
        rows={6}
      />
      <Hints track={track} slug={slug} session={session} hintKey="architecture" hints={script.hints.architecture ?? PHASE_GUIDE.architecture.hints} />
      <div className="flex flex-col gap-3">
        <Reference
          track={track}
          slug={slug}
          session={session}
          revealKey="architecture"
          label="initial design and request flows"
          markdown={phaseReference(script, 'architecture')}
          markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
        />
        <Reference
          track={track}
          slug={slug}
          session={session}
          revealKey="final-architecture"
          label="final architecture"
          markdown={script.sections['Final architecture'] ?? ''}
          markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
        />
      </div>
    </div>
  );
};

const DeepDivePhase: React.FC<Props> = ({ track, slug, session, script, tools }) => {
  const chosen = session.deepDives ?? [];
  const toggle = (i: number) => interviewActions.setDeepDives(track.id, slug, chosen.includes(i) ? chosen.filter((c) => c !== i) : [...chosen, i].sort((a, b) => a - b));
  return (
    <div className="space-y-5">
      <fieldset className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-200">Choose two or three deep dives</legend>
        <p className="text-xs text-slate-400 mb-3">At senior level, pick them yourself from the non-functional requirements before the interviewer does.</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {script.deepDives.map((d, i) => (
            <li key={d.title}>
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
                <input type="checkbox" checked={chosen.includes(i)} onChange={() => toggle(i)} className="mt-0.5 accent-sky-500" />
                <span>
                  {d.title}
                  <span className="block text-[11px] text-slate-400">{d.section}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {chosen.length === 0 && <p className="text-sm text-slate-400">Pick at least one deep dive to work on.</p>}
      {chosen.map((i) => {
        const d = script.deepDives[i];
        if (!d) return null;
        return (
          // A group, not a region: the revealed reference inside is already a region with this name.
          <div key={d.title} role="group" aria-label={d.title} className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4 space-y-4">
            <h3 className="font-bold text-white">{d.title}</h3>
            <Draft
              track={track}
              slug={slug}
              session={session}
              draftKey={`deep:${i}`}
              label="Your approach: options, the one you choose, and why"
              placeholder={'Option 1 (simple): … falls short because …\nOption 2: …\nChoice: … because …'}
              rows={6}
            />
            <Reference
              track={track}
              slug={slug}
              session={session}
              revealKey={`deep:${i}`}
              label={d.title}
              markdown={d.body}
              markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
            />
          </div>
        );
      })}
      <Hints track={track} slug={slug} session={session} hintKey="deep-dives" hints={script.hints['deep-dives'] ?? PHASE_GUIDE['deep-dives'].hints} />
    </div>
  );
};

const renderPhase = (phase: PhaseId, props: Props): React.ReactNode => {
  const { track, slug, session, script } = props;
  switch (phase) {
    case 'requirements': {
      const text = session.drafts.requirements ?? '';
      return (
        <HldDraftPhase
          {...props}
          phase="requirements"
          label="Functional and non-functional requirements"
          placeholder={'Functional\n- Users can …\n\nNon-functional\n- p99 latency < … ms for …\n- … availability; consistency: …\n- Scale: …'}
          rows={10}
          after={
            <>
              <CoverageList track={track} slug={slug} session={session} title="Functional requirements" prefix="fr" items={script.functional} text={text} mentions={mentions} />
              <CoverageList track={track} slug={slug} session={session} title="Non-functional requirements" prefix="nfr" items={script.nonFunctional} text={text} mentions={mentions} />
            </>
          }
        />
      );
    }
    case 'estimation':
      return (
        <HldDraftPhase {...props} phase="estimation" label="What do the numbers mean for the design?" placeholder={'Peak ~… RPS → …\nStorage ~… over … years → …\nRead-heavy (… : 1) → …'} rows={6}>
          <div className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-300 mb-3">🧮 Estimation workspace · prefilled from the interviewer’s answers where possible</p>
            <Suspense fallback={<WidgetFallback />}>
              <Estimator bare preset={script.estimatorPreset} values={session.estimate as Record<string, string> | undefined} onChange={(v) => interviewActions.setEstimate(track.id, slug, v)} />
            </Suspense>
          </div>
        </HldDraftPhase>
      );
    case 'api':
      return <HldDraftPhase {...props} phase="api" label="Your API" placeholder={'POST /v1/…\n  body: { … }\n  → 201 { … }\n\nGET /v1/…/{id}\n  → 200 …'} rows={10} />;
    case 'data-model':
      return <HldDraftPhase {...props} phase="data-model" label="Entities, keys, stores, indexes and partitioning" placeholder={'Entity (store): fields — PK …, index on …, partition by …'} rows={8} />;
    case 'architecture':
      return <ArchitecturePhase {...props} />;
    case 'deep-dives':
      return <DeepDivePhase {...props} />;
    case 'bottlenecks':
      return <HldDraftPhase {...props} phase="bottlenecks" label="Bottlenecks and failure scenarios" placeholder={'- If … fails: detected by …, mitigated by …\n- Hot spot: …'} rows={8} />;
    case 'tradeoffs':
      return <HldDraftPhase {...props} phase="tradeoffs" label="Summary, trade-offs and alternatives" placeholder={'Summary: …\nChose … over … because …\nNext: …'} rows={8} />;
    default:
      return null;
  }
};

const FollowUps: React.FC<Props> = ({ track, script, tools }) =>
  script.sections['Interviewer follow-up questions'] ? (
    <section aria-labelledby="followups-heading">
      <h3 id="followups-heading" className="font-bold text-white mb-1">
        Follow-up questions to practise
      </h3>
      <p className="text-sm text-slate-400 mb-2">Answer each out loud before opening it. Save the ones you struggled with to your notebook.</p>
      <MarkdownContent
        markdown={script.sections['Interviewer follow-up questions']}
        basePath={track.basePath}
        onToggleQuestion={tools.onToggleQuestion}
        savedQuestions={tools.savedQuestions}
      />
    </section>
  ) : null;

export const HLD_INTERVIEW_KIT: InterviewKit<InterviewScript> = {
  phases: PHASES,
  budgets: PHASE_BUDGETS,
  guide: PHASE_GUIDE,
  rubric: RUBRIC,
  parse: parseInterviewScript,
  matcher: { keywords, matchClarification, mentions },
  howItWorks: [
    'Ask clarifying questions; the interviewer answers from this problem’s script.',
    'Write your requirements, estimate, APIs and data model; draw the architecture.',
    'Choose deep dives, then stress the design for failures and trade-offs.',
    'Hints and the reference design stay hidden until you open them.',
    'Finish by rating yourself on the interview rubric.',
  ],
  clarifyPlaceholder: 'Ask a clarifying question, e.g. “How many new links per day?”',
  noMatchAnswer:
    'No scripted answer for that one. In a real interview, state a reasonable assumption out loud (“I’ll assume …”) and move on — or rephrase if you meant scale, scope, latency, consistency or data size.',
  designChoice: /\b(which|what)\s+(database|db|datastore|store|queue|cache|broker|language|framework|cloud)\b|\b(should|can|could|may)\s+(i|we)\s+use\b/i,
  designChoiceAnswer:
    'That’s your call — it’s part of what is being evaluated. Pick an option, give the reason tied to the requirements, and I’ll push back if I disagree.',
  clarifyAppendix: (script) => (script.sections['Scope and exclusions'] ? { title: 'Scope and exclusions', markdown: script.sections['Scope and exclusions'] } : undefined),
  checklistTitle: 'Evaluation checklist',
  renderPhase,
  evaluationExtra: (props) => <FollowUps {...props} />,
};
