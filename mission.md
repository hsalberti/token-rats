# Token Rats

Token Rats is an open source community for people who build with AI. Track the
usage you get from your tools, compare your subscriptions, and share what helps
you do better work.

The primary question is: **What do I get from the subscriptions I pay for?**
The social part adds context: share an idea, an AGENTS.md file, or a project;
explain the workflow; compare results with other builders.

## Current direction

1. Make token counts reliable. Keep input, cache reads, cache writes, output,
   and reasoning visible. Do not count reasoning twice.
2. Make the tracker automatic. Read local logs and retry failed uploads.
3. Compare the same period. Separate recorded usage, API estimates, and the
   subscription amount that the user entered.
4. Build in public. Release the application, CLI, parsers, plans, and documents
   under MIT. Keep third-party notices.
5. Give people a place to share and discuss useful work.

Enterprise sales, new organization plans, SSO, and paid organization features
are paused. The community and individual tracking experience take priority.

## Product rules

- More tokens do not prove better work. Do not present usage as productivity.
- Estimated values must have an estimate label. Missing prices are unknown.
- The local tracker uploads usage metadata, never conversation content.
- Optional API proxy requests pass through our server. Explain that clearly.
- Community content is public because the author chose to publish it. Never
  upload a local AGENTS.md file automatically.
- Do not claim that we can read subscription quotas or provider invoices.
- Keep public discussions useful: evidence, reproducible examples, and respect.

## Launch measures

Measure successful first syncs, active trackers after seven days, failed-upload
recovery, price coverage, monthly comparisons, and useful community replies.
Track parser defects as launch defects. A larger leaderboard is not a reason
to accept incorrect counts.
