# critique

A terminal REPL for three-way conversations between you, Codex, and Claude Opus.

## Setup

```bash
cp .env.example .env
# add your API keys to .env
npm install
```

## Usage

```bash
# from any project directory that has a context.md
npx tsx /path/to/critique/src/index.ts

# with explicit context file
npx tsx /path/to/critique/src/index.ts --context ./context.md
```

To install globally:

```bash
npm run build
npm install -g .
critique --context ~/projects/geist/context.md
```

## Commands

`/codex` `/opus` `/both` switch who responds

`/load <file>` load a file as input

`/save [path]` save session to markdown

`/clear` clear history

`/help` show all commands

## context.md

Add a `context.md` to your project repo describing the current task, architecture decisions, and relevant constraints. `critique` loads it automatically if you run it from that directory.
