Twelve realistic interview moments. For each, choose the best next move — the one that would earn the strongest signal from an
interviewer. Each answer explains why the other moves are weaker.

## How to use this checkpoint

- Picture yourself in the interview: the clock is running and the interviewer is watching how you think.
- Answer before reading the options when you can, then compare.
- Wrong first answers go to your [revision notebook](#system-design/hld/notebook) as mistakes with the explanation.
- Then practise the whole method on a timed problem: start with the [URL shortener](#system-design/hld/interview/url-shortener) or
  [Pastebin](#system-design/hld/interview/pastebin) mock interview.

## Questions

```quiz
? The prompt is "Design a photo-sharing app." What is the best first move?
- Draw a load balancer, app servers and a database
! Designing before scoping risks building the wrong system.
+ Restate the core use case and ask the few questions that change the design: feeds?, video?, scale?, privacy?
- Ask which cloud provider the company uses
! Rarely design-changing at this stage.
- Start estimating storage for photos
! You don't yet know the scale or features to estimate.
> Scope first, with questions that change the design.

? The interviewer answers "you decide" to every scale question. What do you do?
+ State reasonable assumptions out loud (e.g. 10M DAU, 2 uploads/day) and continue
- Keep asking until they give numbers
! That stalls the interview.
- Design for the largest scale imaginable
! Over-engineering wastes time and adds risk.
- Skip non-functional requirements
! They drive the architecture.
> Explicit assumptions keep you moving and can be corrected.

? Which is the strongest non-functional requirement for a payments page?
- "The system must be secure and fast."
! No numbers, no operations.
+ "Charging is exactly-once per payment intent; p99 under 500 ms; 99.95% available; a duplicate retry never double-charges."
- "Use PostgreSQL with SERIALIZABLE isolation."
! That's an implementation choice.
- "Support many users."
! Vague; gives no basis for decisions.
> Specific operations with measurable targets.

? Your estimate shows 30 writes per second. What should you say?
- "We'll shard the database across ten nodes for safety."
! The number argues against sharding.
+ "That's small — one relational primary handles it; I'll focus scaling effort on the read path."
- Nothing; move on silently
! Say the consequence so the reasoning is visible.
- "Let's switch to a NoSQL database for writes."
! The write rate doesn't justify it.
> Each number should end in a decision — including "nothing special needed".

? While you're writing the API, the interviewer asks, "How would you store this?" What do you do?
+ Switch to the data model as asked, then briefly fill in any API details that matter later
- Ask them to wait until the API is complete
! Ignoring steering is a communication red flag.
- Jump to deep dives
! That's not what they asked.
- Restart from requirements
! Unnecessary and time-consuming.
> Follow the interviewer's steer; resume the framework afterwards.

? Which API design detail is a red flag?
- `PUT /v1/recipes/{id}/ratings/me`
! Idempotent and uses the token for identity — good.
+ `POST /v1/follow { followerId, followeeId }` with the follower taken from the body
- Cursor pagination on list endpoints
! That's good practice.
- An Idempotency-Key on payment creation
! That's good practice.
> Identity must come from the authenticated token, not the request body.

? You're 20 minutes into a 45-minute interview and haven't drawn an architecture. What now?
- Finish perfecting the data model
! Time is the constraint; a design must appear.
+ Say you're conscious of time and draw a simple end-to-end design, one requirement at a time
- Start a deep dive on the database
! Depth without a baseline design has nothing to attach to.
- Ask for more time
! Manage the time you have.
> A complete simple design beats a perfect partial one.

? Which deep-dive opening is strongest?
- "Let me explain how Kafka works internally."
! Technology trivia isn't a deep dive into this design's problem.
+ "The hard part is the hot read path at 20K/s with a 50 ms p99 — let me compare three caching approaches. Or would you prefer we look at something else?"
- "Everything is straightforward, so no deep dive is needed."
! Every non-trivial design has a hard part.
- "I'll deep-dive the user table."
! Rarely the hard part.
> Name the hard part with its number, offer options, invite the interviewer's choice.

? The interviewer says, "Why not just use a single SQL table for this?" and they're partly right. What is the best response?
+ Agree where it works, then explain precisely where it breaks (with numbers) and what you'd do instead
- Insist your design is better without explanation
! Defensiveness loses signal.
- Immediately abandon your design
! Switching without reasoning suggests you didn't understand your choice.
- Say SQL never scales
! Untrue, and an overgeneralisation.
> Pushback tests reasoning; engage with the true part.

? In the failure step, which answer is strongest?
- "We'll add redundancy everywhere."
! No specifics about impact or mitigation.
+ "If Redis fails, ~10K reads/s hit the replicas; they're sized for a 50% hit ratio, we keep an in-process cache for hot keys, and shed low-priority traffic beyond that."
- "Failures are rare in the cloud."
! Failures are routine at scale.
- "The interviewer will tell me what fails."
! Raising failures unprompted is the signal.
> Impact, detection, mitigation — with numbers.

? Two minutes remain. What should you do?
- Add a recommendation engine to the diagram
! New components at the end add no analysed value.
+ Give a 30-second summary, two key trade-offs and the biggest open risk
- Recalculate the storage estimate more precisely
! Precision now changes nothing.
- Stay silent and wait for questions
! You should drive the close.
> End with the design's shape, its trade-offs and its risks.

? Which behaviour best shows senior-level communication?
- Talking continuously without pauses
! Leaves no room for the interviewer to steer.
+ Checking in at the end of each step and adapting when the interviewer steers
- Asking permission before every sentence
! Over-checking slows the interview.
- Never revisiting a decision
! Good engineers revise decisions when new information appears.
> Lead like a design review: structure, check-ins and adaptability.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| The overall structure and time management | [The 9-step framework](lesson:interview-framework) |
| Scoping and clarifying questions | [Step 1: understand the problem](lesson:step-understand) |
| Functional and non-functional requirements | [Step 2: define requirements](lesson:step-requirements) |
| Estimates and their consequences | [Step 3: estimation in the interview](lesson:step-estimation) |
| Endpoints, identity, pagination, idempotency | [Step 4: define the APIs](lesson:step-api) |
| Entities, stores and keys | [Step 5: data modeling](lesson:step-data-model) |
| Building the design | [Step 6: high-level architecture](lesson:step-architecture) |
| Choosing and running deep dives | [Step 7: deep dives](lesson:step-deep-dives) |
| Failure analysis | [Step 8: bottlenecks & failure scenarios](lesson:step-bottlenecks) |
| Summaries and late pushback | [Step 9: trade-offs & wrap-up](lesson:step-tradeoffs) |
| Signals, levels and red flags | [How you are evaluated](lesson:interview-rubric) |

You now have everything needed for the beginner practice problems — try them as timed mock interviews before moving on to Stage 6.
