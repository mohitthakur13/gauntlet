# 🏛️ Gauntlet

**Pit AI models against each other. Bad ideas don't survive.**

Gauntlet is a terminal REPL for structured AI debate. One model
proposes from first principles. Critics challenge it. A synthesiser
decides what to keep, what to reject, and rewrites the answer.

Or skip the formality — put two models in a ring with `/debate`
and let them argue until one concedes or you call `/verdict`.

---

## Table of contents

- [Quick start](#quick-start)
- [Example session](#example-session)
- [Debate mode](#debate-mode)
- [Install](#install)
- [Configuration](#configuration)
- [Commands](#commands)
- [How it works](#how-it-works)
- [context.md](#contextmd)
- [Extending Gauntlet](#extending-gauntlet)
- [Architecture](#architecture)
- [Tests](#tests)
- [License](#license)

---

## Quick start

You need at least two models — one to propose, one to critique.

**1. Clone and install**

```bash
git clone https://github.com/mohitthakur13/gauntlet
cd gauntlet
npm install
npm run build && npm install -g .
```

**2. Add your API keys** — copy `.env.example` to `.env` and fill in:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**3. Configure your models** — edit `src/config.json` to set the
proposer (who answers) and critics (who challenge):

```json
{
  "defaults": {
    "proposerId": "codex",
    "criticIds": ["opus"]
  }
}
```

The full model definitions are in the same file. See
[Configuration](#configuration) for details.

**4. Run**

```bash
gauntlet
```

That's it. Ask a question, then `/critique` to challenge the
answer and `/review` to synthesise. Or `/debate aggressive`
to skip straight to adversarial mode.

---

## Example session

```
[codex → opus] › Should we shard the database or use read replicas?

codex ──────────────────────────────────────────────────────
## First principles
The core question is: is the bottleneck reads or writes?
Read replicas solve read-heavy workloads at near-zero
operational cost. Sharding solves write throughput but
introduces routing complexity, cross-shard queries, and
rebalancing pain that compounds over time...

## Biggest risk
Choosing sharding prematurely. Most teams hit read limits
years before write limits. Sharding is a one-way door.

/critique

opus ───────────────────────────────────────────────────────
## Missed
No mention of connection pooling. At high concurrency,
connection exhaustion hits before either read or write
limits. PgBouncer or equivalent is the actual first move.

## Elevation
The "one-way door" framing is the right instinct but
undersells it. Sharding changes your data model — every
query must know its shard key. That constraint propagates
into application code, testing, migrations, and backfills.
The real cost is not operational, it is cognitive.

## Biggest risk
Read replicas have replication lag. Any feature that reads
after writing (confirmation pages, dashboards, notifications)
will show stale data unless you route those reads to primary.
This is the trap that makes teams regret replicas too.

/review

codex (synthesising) ───────────────────────────────────────
## Incorporate
Connection pooling is correct and was a real gap — adding it
as step zero. The cognitive cost framing for sharding is
stronger than "operational cost" and replaces it.

## Push back
Replication lag is real but well-understood. Most ORMs support
read-after-write routing to primary. Calling it a "trap" is
overstated — it is a known configuration step, not a design flaw.

## Revised response
Step 0: Connection pooling (PgBouncer). Step 1: Read replicas
with read-after-write routing to primary. Step 2: Only shard
when write throughput is the measured bottleneck — and accept
that sharding changes your data model permanently...
```

Three models. Three roles. One answer that is better than any
of them would produce alone.

---

## Debate mode

When propose → critique → review isn't adversarial enough,
`/debate` puts two models in direct opposition:

```
[codex → opus] › /debate aggressive
Debate mode active (aggressive). Enter your question.

[debate:aggressive 0] › Is Kubernetes worth the complexity for a 10-person startup?

codex [round 1] ────────────────────────────────────────────
## Position
No. At 10 engineers, Kubernetes is a net negative...

## Attack
The default industry assumption — "you'll need it eventually,
so start now" — is a sunk cost fallacy applied forward...

## Concession
None yet. No opposing position to evaluate.

opus [round 1] ─────────────────────────────────────────────
## Position
Yes, but only managed Kubernetes (GKE Autopilot, EKS Fargate).
The complexity argument applies to self-hosted clusters, not
to managed offerings where the control plane is someone else's
problem...

## Attack
The proposal conflates "Kubernetes" with "operating Kubernetes."
A 10-person startup on GKE Autopilot writes a Dockerfile and
a 30-line YAML manifest. That is less complexity than managing
EC2 instances, load balancers, and deployment scripts by hand...

## Concession
Self-hosted Kubernetes at 10 engineers is genuinely wrong.
No argument there.

[debate:aggressive 1] › focus on the migration cost angle

opus [round 2] ─────────────────────────────────────────────
## Position
Migration cost is the real argument for starting on K8s...

/verdict

gemini (verdict) ───────────────────────────────────────────
## Strongest arguments
codex: complexity cost at small scale is real and measurable...
opus: managed K8s eliminates most operational complexity...

## Final answer
Use managed Kubernetes (GKE Autopilot or equivalent) from
day one. The complexity argument is valid for self-hosted
but does not apply to managed offerings...
```

Two stances: **aggressive** (adversarial, high temperature) and
**cooperative** (collaborative, converges toward agreement). Auto
mode runs the loop unattended with convergence detection:

```
/debate cooperative auto 5    # max 5 rounds, stops when models agree
```

---

## Install

```bash
git clone https://github.com/mohitthakur13/gauntlet
cd gauntlet
npm install
cp .env.example .env
# add your API keys to .env
```

Run without installing globally:

```bash
npx tsx src/index.ts
npx tsx src/index.ts --context ~/projects/myproject/context.md
```

Install globally:

```bash
npm run build
npm install -g .
gauntlet
gauntlet --context ~/projects/myproject/context.md
```

---

## Configuration

### API keys — `.env` (never committed)

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### Models — `src/config.json` (committed, safe to share)

```json
{
  "models": [
    {
      "id": "codex",
      "model": "gpt-5.4",
      "displayName": "codex",
      "provider": "openai"
    },
    {
      "id": "opus",
      "model": "claude-opus-4-6",
      "displayName": "opus",
      "provider": "anthropic"
    }
  ],
  "defaults": {
    "proposerId": "codex",
    "criticIds": ["opus"]
  }
}
```

To swap models, edit `src/config.json` and rebuild:

```bash
npm run build && npm install -g .
```

---

## Commands

```
Proposer & critics
  /propose <id>                    Set who proposes
  /critics [id...]                 Show or set critic list

Critique
  /critique                        Parallel (default order)
  /critique parallel               Explicit parallel
  /critique sequential             Sequential (default order)
  /critique sequential <id> [id…]  Sequential (custom order)
  /review [id]                     Synthesise all critiques

Debate
  /debate aggressive               Start adversarial debate
  /debate cooperative              Start collaborative debate
  /debate <stance> auto <n>        Auto debate, max n rounds
  /verdict [id]                    End debate with final synthesis
  /debate off                      Exit debate without verdict

Modes
  /both                            Multi mode
  /single <id>                     Single model freeform
  /codex                           Shortcut: /single codex
  /opus                            Shortcut: /single opus

Direct address
  @<model> <message>               One-turn message, mode unchanged

Input
  /load <path>                     Load file as next message
  /context                         Show context metadata
  /context reload                  Reload context.md from disk

Session
  /save [path]                     Save session to markdown
  /clear                           Clear history and rounds
  /models                          Show available models
  /help                            Show this help

Keys
  ctrl+c at prompt                 Exit (save prompt if history)
  ctrl+c mid-stream                Cancel current response
```

---

## How it works

### Propose → Critique → Review

Every turn follows a strict asymmetric structure:

**The proposer** reasons from first principles and names the
biggest risk in its own answer.

**Critics** run only when you call `/critique` — never automatically:

- **parallel** — every critic sees only the proposal, independently
- **sequential** — each critic sees the proposal plus all prior
  critiques in the chain

**`/review`** triggers a synthesiser that incorporates what is
correct, pushes back on what is not, and produces a revised answer.

### Debate mode

`/debate` puts two models in direct opposition on a question.
They take turns arguing until you call `/verdict` or (in auto
mode) the system detects convergence.

**Stances:**

- `aggressive` — adversarial, models try to win (higher temperature,
  presence penalty to avoid repetition)
- `cooperative` — collaborative, models try to converge (lower
  temperature, no penalty)

**Manual mode** runs one exchange pair per user input. Between
rounds, type a message to steer the debate ("focus on cost",
"assume a team of 3") — the original question stays fixed,
your text guides the next exchange.

**Auto mode** (`/debate aggressive auto 5`) runs the loop
unattended. Convergence detection uses structural signals
(shrinking attacks, mutual agreement markers) confirmed by
an LLM judge. Only the judge can trigger auto-termination.

**`/verdict [id]`** ends the debate. A third model (or one you
specify) judges both sides and produces a final synthesised answer.
If only two models are configured, the proposer is used as judge
with a bias warning.

**During debate**, commands like `/critique`, `/review`, `/propose`,
and `@model` are blocked. Use free-text for steering, `/verdict`
to end, or `/debate off` to exit.

---

## context.md

Add a `context.md` to any project directory. Gauntlet loads it
automatically when you run from that directory:

```bash
cd ~/projects/myproject
gauntlet   # picks up context.md automatically
```

Or pass it explicitly:

```bash
gauntlet --context ~/projects/myproject/context.md
```

If your file has a `## Project Context` section, only that
section is used. Otherwise the full file is used.

Reference project files inline with `@file:`:

```markdown
## Project Context

### What this project is

One paragraph describing the system.

### Current task

What decision or implementation is being worked on right now.

### Hard constraints

Non-negotiables the models must respect.

### What was tried or ruled out

Prevent the models from suggesting things already rejected.

### Known risks / weak spots

Tell critics where to probe hardest.

### Relevant files

@file: src/config.ts
@file: ARCHITECTURE.md
```

Files over 50KB are skipped with a warning.
Total context is capped at 32,000 characters.
All models receive the same project context.

**What makes a good context.md:** The goal is not to give models
information — it's to give them _useful constraints_. Known risks,
hard constraints, and ruled-out approaches are more valuable than
background prose. Critics attack harder when they know where to look.

---

## Extending Gauntlet

### Adding a new model (same provider)

Edit `src/config.json`:

```json
{
  "models": [
    {
      "id": "codex",
      "model": "gpt-5.4",
      "displayName": "codex",
      "provider": "openai"
    },
    {
      "id": "opus",
      "model": "claude-opus-4-6",
      "displayName": "opus",
      "provider": "anthropic"
    },
    {
      "id": "sonnet",
      "model": "claude-sonnet-4-6",
      "displayName": "sonnet",
      "provider": "anthropic"
    }
  ],
  "defaults": {
    "proposerId": "codex",
    "criticIds": ["opus", "sonnet"]
  }
}
```

Rebuild:

```bash
npm run build && npm install -g .
```

That's it. The routing, prompts, and renderer all work off
the models array — no code changes needed.

### Adding a new provider

1. Create `src/models/gemini.ts` implementing the `ModelClient`
   interface from `src/types.ts`:

```ts
export class GeminiClient implements ModelClient {
  readonly model: string
  readonly displayName: string
  async streamResponse(input: { ... }): Promise<StreamResult> { ... }
}
```

2. Register it in `src/config.ts` inside `PROVIDERS`:

```ts
const PROVIDERS = {
  openai: (model, apiKey) => new CodexClient(model, apiKey),
  anthropic: (model, apiKey) => new OpusClient(model, apiKey),
  gemini: (model, apiKey) => new GeminiClient(model, apiKey),
};
```

3. Add the API key to `.env.example`:

```
GEMINI_API_KEY=
```

4. Add your model to `src/config.json` with `"provider": "gemini"`.

5. Update `getApiKey()` in `src/config.ts` to handle the new provider.

### Changing the prompts

All prompt text lives in `src/prompts.ts` — nowhere else.

The role prompts are:

- `PROPOSER_PROMPT` — first principles + biggest risk
- `PARALLEL_CRITIC_PROMPT` — missed + elevation + biggest risk
- `SEQUENTIAL_CRITIC_PROMPT` — same, but aware of prior critics
- `SYNTHESISER_PROMPT` — incorporate + push back + revised response
- `AGGRESSIVE_DEBATER_PROMPT` — position + attack + concession
- `COOPERATIVE_DEBATER_PROMPT` — build + challenge + synthesis
- `VERDICT_PROMPT` — strongest arguments + weaknesses + final answer
- `CONVERGENCE_CHECK_PROMPT` — one-word convergence check

Edit the prompt, rebuild, reinstall. The heading structure
(`## First principles`, `## Attack`, etc.) is what the tool
relies on for readable output — keep headings if you change
the instructions around them.

---

## Architecture

```
src/
├── index.ts          Entry point, context loading, startup banner
├── repl.ts           Main REPL loop, turn routing, debate loop,
│                     streaming gate, mode state
├── config.ts         Reads config.json, provider registry,
│                     deriveDisplayName, resolveModelAddress
├── config.json       Model definitions — committed, never secrets
├── prompts.ts        All system prompt text — one place only
├── history.ts        Conversation history + round tracking +
│                     context builders (parallel/sequential/review/debate)
├── commands.ts       Slash command registry, /critique, /review,
│                     /debate, /verdict, /save, command policy
├── convergence.ts    Structural signals + LLM judge convergence
├── renderer.ts       Terminal output, ANSI colours, prompt
│                     rendering, streaming headers, debate headers
├── context.ts        context.md loading, @file: expansion,
│                     section extraction, size guardrails
├── types.ts          Shared types: ReplState, Round, DebateState,
│                     HistoryEntry, ModelRole, ModelClient
└── models/
    ├── codex.ts      OpenAI client, streaming, generation params
    └── opus.ts       Anthropic client, streaming, generation params
```

**Key design decisions:**

- Critics never run automatically — always explicit `/critique`
- One critique pass per round, one review per round (v1)
- Debate uses exactly two models: proposer + first critic
- Free-text during debate is moderator steering, not a new question
- All models receive identical project context
- Prompt text lives only in `src/prompts.ts`
- Model names and defaults live only in `src/config.json`
- API keys live only in `.env`

---

## Tests

```bash
npm test            # run all tests
npm run test:watch  # watch mode
```

Tests across 8 files covering:

- **history.test.ts** — round lifecycle, array alignment,
  context builders (parallel, sequential, synthesiser, debate)
- **context.test.ts** — section extraction, @file: expansion,
  path resolution, size guardrails
- **config.test.ts** — display name derivation, model address
  resolution, config validation failure paths
- **prompts.test.ts** — heading contracts per role (including
  debate prompts), system prompt wrapping, spelling consistency
- **renderer.test.ts** — prompt display for all states, debate
  headers, verdict headers, streaming labels
- **save.test.ts** — round-based markdown format, debate metadata,
  moderator steering, section presence/absence
- **convergence.test.ts** — structural signals (agreement, shrinking
  attacks, concession dominance), judge invocation logic, thresholds
- **commands.test.ts** — all command parsing including /debate,
  /verdict, debate command policy, validation edge cases

If a test fails after you change something, fix the implementation
— not the test.

---

## License

MIT
