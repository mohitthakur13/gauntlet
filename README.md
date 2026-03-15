# 🗡️ Gauntlet

**Pit AI models against each other. Bad ideas don't survive.**

Gauntlet is a terminal REPL that runs a structured debate between two AI models.
One proposes from first principles. The other finds what was missed and pushes the
answer further. You stay in control.

---

## How it works

Every turn in `/both` mode follows a strict asymmetric structure:

**The proposer** (goes first):

- Reasons from first principles — not the default industry answer
- Names the biggest risk in its own response

**The critic** (goes second):

- Identifies what's critical and missing
- Shows how to elevate the answer to the next level

You can flip the order, address models directly, and carry context
from your project into every session.

---

## Prerequisites

- Node.js 20+
- An OpenAI API key
- An Anthropic API key

---

## Install

```bash
git clone https://github.com/mohitthakur13/gauntlet
cd gauntlet
npm install
cp .env.example .env
# add your API keys to .env
```

### Run without installing globally

```bash
npx tsx src/index.ts
npx tsx src/index.ts --context ~/projects/myproject/context.md
```

### Install globally (recommended)

```bash
npm run build
npm install -g .
gauntlet
gauntlet --context ~/projects/myproject/context.md
```

---

## Configuration

### API keys — `.env` (never committed)

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Models — `src/config.json` (committed, safe to share)

```json
{
  "codex": {
    "model": "gpt-5.4",
    "displayName": "codex"
  },
  "opus": {
    "model": "claude-opus-4-6",
    "displayName": "opus"
  }
}
```

To swap models, edit `src/config.json` and rebuild:

```bash
npm run build && npm install -g .
```

---

## Usage

```
┌─────────────────────────────────────────┐
│  gauntlet                    ctrl+c/q   │
└─────────────────────────────────────────┘
Context: /projects/myproject/context.md
Models:  codex (gpt-5.4)  ·  opus (claude-opus-4-6)
Mode:    both
──────────────────────────────────────────
[codex → opus] ›
```

Type any question and both models respond in sequence.
The proposer reasons from first principles. The critic elevates.

### Example session

```
[codex → opus] › Design a rate limiting strategy for a high-traffic API

Codex ──────────────────────────────────────
## First principles
...

## Biggest risk
...

Opus ───────────────────────────────────────
## Missed
...

## Elevation
...

[codex → opus] › @codex incorporate the critique and rewrite
[codex → opus] › @opus push the elevation further, be specific
```

---

## Commands

### 🔀 Routing

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `/both`              | Both models respond (default)                |
| `/codex`             | Codex only — freeform, no enforced structure |
| `/opus`              | Opus only — freeform, no enforced structure  |
| `/order codex-first` | Codex proposes, Opus critiques (default)     |
| `/order opus-first`  | Opus proposes, Codex critiques               |

### 🎯 Direct address

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `@codex <message>` | One-turn message to Codex, mode unchanged |
| `@opus <message>`  | One-turn message to Opus, mode unchanged  |

Use `@model` to follow up with a specific model without switching modes:

```
@codex incorporate the critique and rewrite your proposal
@opus push your elevation further, give a concrete example
```

### 📂 Input

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `/load <path>`    | Load a file and send as next message |
| `/context`        | Show loaded context file             |
| `/context reload` | Reload context.md from disk          |

### 💾 Session

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `/save [path]` | Save full session to markdown        |
| `/clear`       | Clear conversation history           |
| `/models`      | Show current model names and strings |
| `/help`        | Show all commands                    |

### ⌨️ Keyboard

| Key                 | Action                                    |
| ------------------- | ----------------------------------------- |
| `ctrl+c` at prompt  | Exit (save prompt if unsaved history)     |
| `ctrl+c` mid-stream | Cancel current response, return to prompt |
| `ctrl+d`            | Exit                                      |

---

## Project context

Add a `context.md` to any project directory. Gauntlet loads it
automatically when you run from that directory.

```bash
cd ~/projects/myproject
gauntlet  # picks up context.md automatically
```

Or pass it explicitly:

```bash
gauntlet --context ~/projects/myproject/context.md
```

**What to put in `context.md`:**

- Current task or decision you're working through
- Architecture principles and constraints
- What's already been tried and ruled out
- Known risks or weak spots to probe

Both models receive this context in their system prompts,
so critiques are grounded in your actual project rather than
generic advice.

---

## Extending Gauntlet

The codebase is intentionally small and modular.

### Add a third model

1. Create `src/models/newmodel.ts` — implement the `ModelClient` interface from `src/types.ts`
2. Add its config to `src/config.json`
3. Register it in `src/repl.ts`

### Change the proposer/critic prompts

Edit `src/prompts.ts` — all system prompt text lives there.
No prompt text exists anywhere else in the codebase.

### Change which models are used

Edit `src/config.json` — model strings and display names.
Rebuild and reinstall.

### Architecture

```
src/
├── index.ts        entry point, context loading, startup
├── repl.ts         main REPL loop, turn routing, mode/order state
├── config.ts       reads src/config.json, derives display names
├── config.json     model names and strings (committed)
├── prompts.ts      all system prompt text
├── history.ts      shared conversation history
├── commands.ts     slash command registry and handlers
├── renderer.ts     terminal output, ANSI colours, prompt rendering
├── context.ts      context.md loading
├── types.ts        shared types: ModelRole, ReplState, HistoryEntry
└── models/
    ├── codex.ts    OpenAI client, streaming
    └── opus.ts     Anthropic client, streaming
```

---

## License

MIT
