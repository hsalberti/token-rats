# Open source relaunch plan — 2026-09-28

## Positioning

Token Rats is already [public on GitHub](https://github.com/hsalberti/token-rats)
under MIT, and CLI 0.4.0 is published on npm as `latest`. This is a new open source release,
not a first source-code reveal. The relaunch story is: **track local agent
usage, then share the instructions and coordination patterns behind the work**.
Token counts describe usage, not output quality or a provider bill.

The immediate audience is people who use more than one coding agent and keep
changing their AGENTS.md, model choice, delegation pattern, and supporting
apps. The first useful community content should show a real setup, the model
versions and tools, a change that was tried, and the outcome. A bare config
file without context is hard for other people to adapt.

## Release gates

1. **Publish an auditable release.** Keep MIT, notices, local setup instructions, and the counting method public. Scan the release commit and inspect the npm archive. Publish CLI 0.4.0 and deploy the same public GitHub commit. Record the commit and checks in [release.md](release.md).
2. **Verify the behavior.** Check local OpenCode totals against Tokscale and native stats, full/partial instruction publication, download, workflow display, profile privacy, and Reddit navigation. Existing users' complete saved instructions remain private unless they explicitly publish them.
3. **Deploy in order.** Back up D1; apply the additive profile migration 0025; deploy the API; publish and verify CLI 0.4.0; update the advertised version; deploy web; then delete retired proxy keys. Keep historical usage and forum records. Detailed operations are in [the release checklist](../docs/open-source-release.md).
4. **Seed the founder profile.** Publish the reviewed [global-instruction excerpt](examples/alberti-agents.md) on Alberti's Token Rats profile. Link the profile from launch drafts after verifying the production URL.
5. **Alberti creates r/TokenRats.** Use the description, rules, flairs, welcome, and weekly thread copy in [posts.md](posts.md). The website community links already target that URL. Confirm the name is available; update the links if a different name is chosen.
6. **Alberti edits and posts.** Fill in any marked founder examples, recheck live rules and thread URLs, and publish the drafts himself. Agents support research, drafts, and follow-up context.

Release gates 1–4 are complete; see [release.md](release.md) for deployment and clean-install evidence. The remaining launch work is subreddit creation and Alberti’s manual posts.

## Posting schedule

| Timing | Alberti's action | Record here |
| --- | --- | --- |
| Before launch | Create r/TokenRats; publish rules, welcome, and first workflow thread | Actual subreddit and pinned thread URLs |
| Launch day | Submit Show HN when available to answer comments for several hours | HN submission URL and feedback |
| Day 1 | Post in the current r/ClaudeCode showcase thread | Comment URL and requested integrations |
| Day 2 | Post in the current r/ChatGPTCoding self-promotion thread | Comment URL and workflow feedback |
| Days 3–5 | Share the OpenCode counting write-up if the selected sub permits it; optionally the r/SideProject story | Post URLs and reproducible defects |
| Day 7 | Review clean installs, first syncs, profile shares, return visits, and useful feedback | Observations and next changes |

## Where to post first

| Order | Venue | Specific post | Why / rule evidence |
| --- | --- | --- | --- |
| 1 | Create **r/TokenRats** if available | Pin a welcome post, rules, counting-method link, and weekly workflow thread; add Workflow, AGENTS.md, Question, Project, Count defect, Release flairs | Owned support and examples home. Availability and creation are still unverified. |
| 2 | [Show HN](https://news.ycombinator.com/showhn.html) | Link to the GitHub repository; first comment explains the local reader, what gets uploaded, and the profile examples | HN asks for something people can try and says not to solicit votes. A major new release is more fitting than a routine version bump. [HN guidelines](https://news.ycombinator.com/newsguidelines.html). |
| 3 | [r/ClaudeCode weekly showcase](https://www.reddit.com/r/ClaudeCode/comments/1wsc45t/weekly_showcase_thread_what_are_you_building_with/) | Short founder comment with one real AGENTS.md change and a repo link | Its 2026-09-28 thread explicitly welcomes tools, workflows, and open source projects; simple promotion belongs in the thread. |
| 4 | [r/ChatGPTCoding weekly self-promotion thread](https://www.reddit.com/r/ChatGPTCoding/comments/1ws8gju/weekly_self_promotion_thread/) | Comment focused on comparing Codex/OpenCode/Claude workflows and asking for one concrete missing source or sharing field | The current thread requests affiliation, models/tools, audience, and feedback. Promotional standalone posts may be removed. |
| 5 | r/opencodeCLI or r/opencode | Technical post on local SQLite accounting, WAL, model switches, and an inspectable collector; link to source only after the explanation | Existing [OpenCode tracker](https://www.reddit.com/r/opencodeCLI/comments/1u8fkh5/tokenomics_where_did_my_tokens_go/) and [agent report](https://www.reddit.com/r/opencode/comments/1w0dejf/i_built_an_opensource_usage_analytics_tool_for/) posts show topical interest. Check each sub's current rules and flair on posting day. |
| 6 | r/SideProject | Founder build story and actual usage/feedback, with Self Promotion flair if the current rules permit it | Broader reach, weaker audience match. Verify the rules and flair before posting. |

Use distinct examples for each venue. Disclose founder status in every post.
Answer comments the same day, especially counting questions. Do not ask for
upvotes or arrange vote exchanges. Reddit rules and pinned threads can change,
so recheck them immediately before publishing.
HN currently has a [temporary Show HN restriction](https://news.ycombinator.com/showlim)
for accounts unfamiliar with the community; verify the founder account can
submit before scheduling the HN day.

## First week and success checks

- **Day 0:** finish release checks, verify the founder profile example, create the
  subreddit, then submit Show HN when the founder can answer questions for
  several hours.
- **Days 1–2:** post in the two current weekly Reddit threads. Respond to
  replies and turn counting defects into reproducible GitHub issues.
- **Days 3–5:** write the OpenCode technical post after comparing with
  `opencode stats` and Tokscale. Post the founder story to r/SideProject only
  if its current rules allow it.
- **Day 7:** review visits to the repo and `/sources`, clean installs, first
  syncs, new community posts, replies, 7-day return, and concrete parser
  defects. A high token total by itself is not a success metric.

The post text and subreddit setup copy are in [posts.md](posts.md). No
external posts or subreddit creation have been made as part of this plan.
