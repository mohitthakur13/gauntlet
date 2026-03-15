# Gauntlet

Gauntlet is a terminal REPL for structured AI debate.
One model proposes from first principles. One or more critics
challenge it. A synthesiser can then revise the answer.

## Install

```bash
git clone https://github.com/mohitthakur13/gauntlet
cd gauntlet
npm install
cp .env.example .env
# add your API keys to .env
```

Run locally:

```bash
npx tsx src/index.ts
npx tsx src/index.ts --context ~/projects/myproject/context.md
```

Install globally:

```bash
npm run build
npm install -g .
gauntlet
```

## Configuration

API keys live in `.env`:

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Models live in [`src/config.json`](/Users/mohitthakur/Development/tools/gauntlet/src/config.json).
Edit that file to change proposer/critic defaults, then rebuild:

```bash
npm run build && npm install -g .
```

## How it works

Every session has one proposer and one or more critics.

The proposer responds automatically to every query,
reasoning from first principles and naming its own
biggest risk.

Critics run only when you call `/critique`:
- parallel: every critic independently sees only
  the proposal — same input, independent views
- sequential: each critic sees the proposal plus all
  prior critiques in the chain, labeled by critic

After critiques, `/review` triggers a synthesiser that
decides what to incorporate, what to push back on,
and produces a revised response.

## Commands

```text
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

## context.md

Add a `context.md` to any project directory.
Gauntlet loads it automatically when you run from
that directory, or pass it explicitly:

```bash
gauntlet --context ~/projects/myproject/context.md
```

If your file has a `## Project Context` section, only
that section is used. Otherwise the full file is used.

Reference project files inline with `@file:`:

```markdown
## Project Context

### What this project is
One paragraph.

### Current task
What decision is being worked on right now.

### Hard constraints
Non-negotiables the models must respect.

### What was tried or ruled out
Prevent repeated bad suggestions.

### Known risks / weak spots
Tell critics where to probe hardest.

### Relevant files
@file: src/config.ts
@file: ARCHITECTURE.md
```

Files over 50KB are skipped with a warning.
Total context is capped at 32,000 characters.
All models receive the same project context.

## Adding a new model

Step 1: add it to `src/config.json`.

```json
{
  "models": [
    { "id": "codex", "model": "gpt-5.4", "displayName": "codex", "provider": "openai" },
    { "id": "opus", "model": "claude-opus-4-6", "displayName": "opus", "provider": "anthropic" },
    { "id": "sonnet", "model": "claude-sonnet-4-6", "displayName": "sonnet", "provider": "anthropic" }
  ],
  "defaults": {
    "proposerId": "codex",
    "criticIds": ["sonnet"]
  }
}
```

Step 2: rebuild.

```bash
npm run build && npm install -g .
```

## Adding a new provider

1. Create `src/models/gemini.ts` implementing `ModelClient`.
2. Register it in `src/config.ts` inside `PROVIDERS`.
3. Add `GEMINI_API_KEY` to `.env.example`.
4. Add the model to `src/config.json` with `provider: "gemini"`.
