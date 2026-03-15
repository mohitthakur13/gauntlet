## Project Context

### What this project is
Gauntlet is a terminal REPL for structured AI debate.
One proposer answers from first principles. Critics run
only when /critique is called. /review synthesises
critiques into a revised response.

### Current task
Multi-critic architecture is implemented. Context loading
now supports @file: references and ## Project Context
section extraction. Save format now reflects rounds.

### Hard constraints
- Proposal runs automatically on each query in multi mode
- Critics never run automatically — explicit /critique only
- All models receive the same project context
- Prompt text lives only in src/prompts.ts
- UK spelling: synthesiser, not synthesizer
- One critique pass per round in v1
- One review per round in v1

### What was tried or ruled out
- Auto-running critics after every query — rejected,
  removes user control
- Storing critiqueMode as persistent session state —
  rejected, specified at /critique call time
- hasHistory in ReplState — removed, derivable
- /critics reorder command — deferred to v2
- Multiple critique passes per round — deferred to v2

### Known risks / weak spots
- Sequential critique can repeat earlier critics if
  prompt formatting is weak
- Context expansion can bloat prompts without size limits
- Two-model assumptions may still exist in edge cases

### Relevant files
@file: src/config.json
@file: src/types.ts
@file: src/prompts.ts
@file: src/commands.ts
