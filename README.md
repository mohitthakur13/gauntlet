# 🗡️ Gauntlet

**Pit AI models against each other. Bad ideas don't survive.**

Gauntlet is a terminal REPL for structured AI debate. One model
proposes from first principles. One or more critics challenge it.
A synthesiser decides what to keep, what to reject, and rewrites
the answer.

---

## How it works

Every turn follows a strict asymmetric structure:

**The proposer** reasons from first principles and names the
biggest risk in its own answer.

**Critics** run only when you call `/critique` — never automatically:
- **parallel** — every critic sees only the proposal, independently
- **sequential** — each critic sees the proposal plus all prior
  critiques in the chain, labeled by critic

**`/review`** triggers a synthesiser that incorporates what is
correct, pushes back on what is not, and produces a revised answer.

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

## Example session
```
[codex → opus] › Design a rate limiting strategy for a high-traffic API. Short.

codex ──────────────────────────────────────────────────────
## First principles
Rate limiting is a flow control mechanism. The core constraint
is: downstream systems have finite capacity. Design from there.
...

## Biggest risk
Token bucket implementations often share state across instances.
In distributed systems this requires a coordination layer —
Redis is common but introduces a single point of failure.

/critique sequential

opus [1/1] ─────────────────────────────────────────────────
## Missed
No mention of client identification strategy. IP-based limiting
is trivially bypassable behind NAT. API key or user-scoped
limits are almost always the correct default.

## Elevation
The proposal treats rate limiting as infrastructure. The harder
and more important question is: what is the right limit per
customer tier, and how do you communicate limit state to clients
via headers (X-RateLimit-Remaining, Retry-After) so they can
self-throttle gracefully.

## Biggest risk
Redis dependency without a fallback means a Redis outage
disables your entire API. Circuit breaker or local fallback
limiting is not optional in production.

/review

codex (synthesising) ───────────────────────────────────────
## Incorporate
The client identification point is correct and was a real gap.
Switching to API key scoped limits. Adding standard rate limit
headers to the response spec.

## Push back
The Redis fallback concern is valid for high-scale systems but
premature for most APIs. Will note it as a scaling consideration
rather than a day-one requirement.

## Revised response
...

[codex → opus] ›
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

Modes
  /both                            Multi mode
  /single <id>                     Single model freeform
  /codex                           Shortcut: /single codex
  /opus                            Shortcut: /single opus

Direct address
  @<model> <message>               One-turn message, mode unchanged
                                   Use to follow up with one model
                                   without changing mode:
                                   @codex incorporate the critique

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
information — it's to give them *useful constraints*. Known risks,
hard constraints, and ruled-out approaches are more valuable than
background prose. Critics attack harder when they know where to look.

---

## Extending Gauntlet

### Adding a new model (same provider)

Edit `src/config.json`:
```json
{
  "models": [
    { "id": "codex",  "model": "gpt-5.4",          "displayName": "codex",  "provider": "openai"    },
    { "id": "opus",   "model": "claude-opus-4-6",   "displayName": "opus",   "provider": "anthropic" },
    { "id": "sonnet", "model": "claude-sonnet-4-6", "displayName": "sonnet", "provider": "anthropic" }
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
     openai:    (model, apiKey) => new CodexClient(model, apiKey),
     anthropic: (model, apiKey) => new OpusClient(model, apiKey),
     gemini:    (model, apiKey) => new GeminiClient(model, apiKey),  // add this
   }
```

3. Add the API key to `.env.example`:
```
   GEMINI_API_KEY=
```

4. Add your model to `src/config.json` with `"provider": "gemini"`.

5. Update `getApiKey()` in `src/config.ts` to handle the new provider.

### Changing the proposer/critic prompts

All prompt text lives in `src/prompts.ts` — nowhere else.

The four role prompts are:
- `PROPOSER_PROMPT` — first principles + biggest risk
- `PARALLEL_CRITIC_PROMPT` — missed + elevation + biggest risk
- `SEQUENTIAL_CRITIC_PROMPT` — same, but aware of prior critics
- `SYNTHESISER_PROMPT` — incorporate + push back + revised response

Edit the prompt, rebuild, reinstall. The heading structure
(`## First principles`, `## Missed`, etc.) is what the tool
relies on for readable output — keep headings if you change
the instructions around them.

---

## Architecture
```
src/
├── index.ts          Entry point, context loading, startup banner
├── repl.ts           Main REPL loop, turn routing, mode state
├── config.ts         Reads config.json, provider registry,
│                     deriveDisplayName, resolveModelAddress
├── config.json       Model definitions — committed, never secrets
├── prompts.ts        All system prompt text — one place only
├── history.ts        Conversation history + round tracking +
│                     context builders for parallel/sequential/review
├── commands.ts       Slash command registry, /critique, /review,
│                     /save, /context, /propose, /critics, etc.
├── renderer.ts       Terminal output, ANSI colours, prompt
│                     rendering, streaming headers
├── context.ts        context.md loading, @file: expansion,
│                     section extraction, size guardrails
├── types.ts          Shared types: ReplState, Round, HistoryEntry,
│                     ModelRole, CritiqueMode, ModelClient
└── models/
    ├── codex.ts      OpenAI client, streaming
    └── opus.ts       Anthropic client, streaming
```

**Key design decisions:**
- Critics never run automatically — always explicit `/critique`
- One critique pass per round, one review per round (v1)
- All models receive identical project context
- Prompt text lives only in `src/prompts.ts`
- Model names and defaults live only in `src/config.json`
- API keys live only in `.env`

---

## Tests
```bash
npm test          # run all tests
npm run test:watch  # watch mode
```

84 tests across 6 files covering:
- **history.test.ts** — round lifecycle, array alignment invariants,
  context builders (parallel, sequential, synthesiser)
- **context.test.ts** — section extraction, @file: expansion,
  path resolution, size guardrails
- **config.test.ts** — display name derivation, model address
  resolution, config validation failure paths
- **prompts.test.ts** — heading contracts per role, system prompt
  wrapping, sequential substitution, spelling consistency
- **renderer.test.ts** — prompt display for all states, duplicate
  critic handling, streaming headers
- **save.test.ts** — round-based markdown format, section
  presence/absence, multi-round separation

If a test fails after you change something, fix the implementation
— not the test.

---

## License

MIT
