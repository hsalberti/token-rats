# Open source launch pack

Drafts only. Publish after the 0.4.0 release gates in
[open-source-release.md](../docs/open-source-release.md) pass. The repository is
already public. Do not claim a Reddit community exists until it is created.
Check each community's live rules before posting.

## Show HN

Title: Show HN: Token Rats – local AI coding usage and shared agent workflows

Link: https://github.com/hsalberti/token-rats

First comment:

I built Token Rats because I kept changing how I coordinate Codex, Claude
Code, OpenCode, and other apps, but couldn't easily compare the usage or see
the instructions behind other people's setups.

The CLI reads local Claude Code and Codex logs, OpenCode's SQLite database,
and Cursor generation records. It uploads token counts, model/provider names,
timestamps, and opaque IDs. Cursor counts are estimates. You can try local
detection with `npx token-rats sync --dry-run` without creating an account.
Profiles let people publish a full AGENTS.md, a selected excerpt, and a
write-up of how their agents and apps work together. Discussion lives on r/TokenRats.
My published instruction excerpt: https://tokenrats.com/u/hsalberti.

The code and project documents are MIT licensed. The stack is TypeScript,
Next.js, a Cloudflare Worker, and SQLite/D1.

The important limits: tokens are not productivity, estimated API cost is not
a subscription bill, Cursor counts are estimates, and long sessions still
have date-attribution limits. The [counting method](https://github.com/hsalberti/token-rats/blob/main/docs/counting.md)
explains those limits. Complete saved instructions are published only when their owners explicitly
choose to share them.

I'd especially like feedback on OpenCode counting and on the context that
makes an AGENTS.md excerpt useful to another developer. A small synthetic
fixture that reveals a counting bug is especially helpful.

## Reddit community setup

Proposed name: r/TokenRats (availability not checked).
Description: Open source AI coding usage, agent coordination, and AGENTS.md
examples with the context needed to adapt them.

Post flairs: Question, Workflow, AGENTS.md, Project, Count defect, Release.
Rules: Be respectful. State your affiliation. Do not post credentials or
private logs. Label estimates. Explain the work behind a usage claim. Do not
encourage waste just to increase a leaderboard rank.

Welcome post:

Welcome to Token Rats. Share how you coordinate agents and apps, the
instructions that help, and what changed when you adjusted them. AGENTS.md
files and excerpts are welcome; add project/model context and remove private
details first. If you share token numbers, include the period, source, and
whether they are reported or estimated. I maintain Token Rats and will use
counting defects here to improve the open source collector.

First weekly workflow thread:

What did you change in your agent setup this week? Share the model and tools,
who did which part of the work, one instruction or handoff that mattered, and
the result. An AGENTS.md excerpt or diagram is welcome if you can explain the
project context. Token totals are optional; a specific failure or improvement
is more useful than a large number. I maintain Token Rats and will collect
reproducible counting defects in GitHub issues.

## r/ClaudeCode weekly showcase comment

I maintain Token Rats, an MIT open source project for tracking local coding
agent usage and sharing the setup behind it. The latest release reads Claude
Code, Codex, and OpenCode usage locally, and profiles now support full
or excerpted AGENTS.md files and workflow descriptions. One change from my own Claude Code
workflow: [replace with one actual instruction, what changed, and the result].
Repo: https://github.com/hsalberti/token-rats. I'd be interested in which
AGENTS.md instruction you keep revising as models change.

## r/ChatGPTCoding weekly thread comment

I built Token Rats for people switching between Codex, Claude Code, and
OpenCode. The CLI reads local usage fields and the site compares that recorded
usage with the subscription amount you enter. Your profile can also share an
AGENTS.md excerpt or an agent/app coordination workflow with model context.
It's MIT licensed: https://github.com/hsalberti/token-rats. I'd value
feedback on which workflow details would make someone else's setup actually
reusable. I'm the maintainer; there is no paid tier in this release.

## r/opencodeCLI technical post draft

Title: Reading OpenCode token usage from its local SQLite database

I added an OpenCode reader to Token Rats after realizing a hosted API proxy
was the wrong shape for this job. The current OpenCode DB stores assistant
message token fields separately: input, output, reasoning, cache read, and
cache write. The collector queries just those fields and groups them by
session, provider, and model; it reads WAL changes and handles channel-specific
DB filenames. Copied history in forked sessions is deduplicated by usage
fingerprint. Reasoning is added to output once for Token Rats' schema.

I compared the component sum with OpenCode's stored total on my local DB and
it matched. Tokscale independently matched the input, cache, and output counts
once its output-only field was combined with reasoning. The MIT source is here:
https://github.com/hsalberti/token-rats/blob/main/packages/cli/src/lib/opencode-extract.ts.
If you have an OpenCode schema or provider case this misses, a small sanitized
fixture would help more than a screenshot of a total. I'm the maintainer.

## r/SideProject founder story draft

Title: I made my AI coding usage tracker open source and added a place to share agent setups

I built Token Rats while switching among coding agents and changing the
instructions I give them. The hard part was seeing which local usage records I
could actually trust, then explaining what changed in my workflow. The current
release reads Claude Code, Codex, OpenCode, and Cursor locally. It also lets
people share a full or partial AGENTS.md and explain how they coordinate agents
and apps. I removed an API proxy because it added setup and did not fit the
local-file workflow. The repository is MIT licensed:
https://github.com/hsalberti/token-rats.

[Add one real before/after workflow change and its result. Add an actual
counting defect you fixed or a limitation you still see.] I maintain the
project and would value feedback on which shared workflow details are useful
to another developer. Use the subreddit self-promotion flair only if its live
rules allow this post.

## First week

1. Publish CLI 0.4.0 and deploy the local-source release. Verify a clean install.
2. Create the Reddit community and publish its rules and welcome post.
3. Link the reviewed founder profile example.
4. Post Show HN if the founder account is eligible, then answer questions.
5. Use the current r/ClaudeCode and r/ChatGPTCoding weekly threads.
6. Triage counting defects daily and invite one reproducible fixture at a time.

For other subreddits, check their current self-promotion rules before posting.
Use one relevant post with a clear founder disclosure. Do not post duplicate
launch messages across communities or ask for coordinated votes.

## Published links

- Founder profile: https://tokenrats.com/u/hsalberti (verified in production).
- Release: https://github.com/hsalberti/token-rats/releases/tag/v0.4.0.
- Subreddit and external post URLs: add after Alberti creates/posts them.
