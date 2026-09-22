# Open source launch pack

Drafts only. Publish after the release gates in docs/open-source-release.md
pass and the repository is public. Do not claim a Reddit community exists
until it has been created.

## Show HN

Title: Show HN: Token Rats – compare AI subscription usage and share agent workflows

Link: https://github.com/hsalberti/token-rats

First comment:

I built Token Rats because I wanted to understand what I was getting from my
AI coding subscriptions and learn how other people use theirs.

It collects local Claude Code and Codex token counts, shows Cursor estimates,
and compares recorded usage with the subscription amount you enter for a
month. An optional proxy tracks Anthropic Messages and OpenRouter/OpenAI Chat
Completions. The community page lets people share ideas, projects, questions,
and AGENTS.md files.

The code and project documents are MIT licensed. The stack is TypeScript,
Next.js, a Cloudflare Worker, and SQLite/D1.

The important limits: tokens are not productivity; API-equivalent cost is not
a subscription bill; Cursor counts are estimates; long sessions still use
their start date and last model. We publish the counting method and want help
making it more accurate. The local tracker sends usage metadata only. The
optional API proxy handles content in transit, and community posts are public.

I would like feedback on the counting method and what you need for a useful
comparison. A small synthetic fixture that reveals a bug is especially useful.

## Reddit community setup

Proposed name: r/TokenRats (availability not checked).
Description: An open source community for AI coding workflows, token usage,
subscription comparisons, and AGENTS.md examples.

Post categories: Question, Workflow, AGENTS.md, Project, Count defect, Release.
Rules: Be respectful. State your affiliation. Do not post credentials or
private logs. Label estimates. Explain the work behind a usage claim. Do not
encourage waste just to increase a leaderboard rank.

Welcome post:

Welcome to Token Rats. Share how you build with AI, the agent instructions
that help, and what you get from your tools. Include a time period, source,
and whether your numbers are measured or estimated. Start with a workflow
that helped you finish something, or a question you want to test.

## First week

1. Publish the source and counting method. Verify the install from a clean machine.
2. Post Show HN with the repository link and the comment above. Answer questions.
3. Create the Reddit community and publish its rules and welcome post.
4. Share three real, reviewed AGENTS.md examples with context and results.
5. Triage counting defects daily. Publish fixes and a short method changelog.
6. Invite contributors to one reproducible parser or pricing issue at a time.

For other subreddits, check their current self-promotion rules before posting.
Use one relevant post with a clear founder disclosure. Do not post duplicate
launch messages across communities or ask for coordinated votes.
