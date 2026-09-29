# Proposal: setup history and a friends feed

Status: archived design discussion. [setup-history-release.md](setup-history-release.md) is authoritative for the implemented scope. The older schema and delivery phases below are historical: in-app comments/likes, structured outcomes, and before/after attribution were superseded by Alberti's Goodreads + Git direction. Short ratings and notes live in Token Rats; longer discussion lives on Reddit. Usage and setup histories are independent.

## Product direction

Make Token Rats the place where people keep their agent setup, remember why it changed, and learn from the people they follow. Usage, rooms, and leaderboards remain part of the experience.

The central loop is **save a setup → try it → record a change → optionally publish → discuss or adapt someone else's version**. Saving history must be useful before a user has followers or connects usage tracking.

The Strava reference is its activity-centered interaction: an identifiable activity has context, a detail page, comments, appreciation, and a shareable image. For Token Rats, the comparable object is a setup update. Official references: [feed, kudos, and comments](https://support.strava.com/en-us/collections/19668897-feed-kudos-and-comments), [sharing activities](https://support.strava.com/en-us/articles/15401840-sharing-your-strava-activities). These inform the proposal; they are not evidence of demand for this feature.

## What exists today

- `/app` emphasizes rooms and leaderboards.
- `/app/friends` derives people from shared private rooms and sorts by spend. There is no explicit follow relationship.
- `/u/[handle]` displays the current instructions/workflow, usage, projects, and activity heatmap. Instruction saves overwrite one field; there is no revision history.
- Subscription spending exists as private, monthly user-entered records. A public list of favorite tools and plans needs its own publication choice.
- Next.js image routes already generate public profile and weekly cards.
- The Worker, D1, contracts package, GitHub identity, and local usage collection can support the first release. No new infrastructure is required initially.

## 1. A setup is a versioned bundle

People can have several named setups: Everyday coding, Research, or a project-specific setup. One is featured on their profile.

Each saved version contains:

| Content | Examples |
| --- | --- |
| Instructions | AGENTS.md, CLAUDE.md, selected excerpts, role-specific instructions |
| Tools and coordination | Paseo, Orca, a custom handler with a repo URL; what coordinates what |
| Agents and models | Roles, model identifiers, relevant versions, and why each was chosen |
| Workflow | Planning, delegation, review, handoffs, and supporting apps |
| Plans | Selected subscription names; price visibility is a separate choice |
| Context | What changed, why, when the owner started using it, and an optional later outcome |

Tools and custom handlers are labels, descriptions, links, and optional text files in the first release. Anyone can describe a setup without a dedicated integration. Uploaded configurations are downloadable text; copying a setup does not install or execute it.

**Save version** records an explicit checkpoint. The editor can autosave a draft without creating a history entry for every keystroke. Store the complete bounded text bundle per version; compute diffs for display. Use an established text-diff library and show tool/model/plan changes as readable added/removed fields.

The owner can browse a timeline, compare two versions, download one file or the whole bundle, and restore an older version. Restore creates a new checkpoint with a reference to the restored version. It preserves the intervening history. Restoring in Token Rats does not silently overwrite local files.

Saving and publishing are separate actions. A private version can produce a public excerpt without revealing other files or earlier private versions. Published diffs compare only the approved public content. Unpublishing a version must remove its text from dependent public diffs and generated cards too.

## 2. Publish an update from the history

After saving, offer **Share this update**. The composer contains:

1. A title and a short explanation of why the setup changed.
2. A suggested diff with individual files/sections the author can include.
3. Optional tools/models, project or custom-handler links, and usage context.
4. A preview of the exact public post and share image.

Saving privately is a complete action. Every save does not need a social post. A later outcome note can reference the same version, so people can describe whether an experiment worked without changing instructions again. A project/shipping update can also link to the setup used.

Illustrative post; the text and activity are fictional:

```text
@alberti · Everyday coding · v12
Moved code review into a separate agent

“I wanted the implementation and review steps to have distinct instructions.”

AGENTS.md
− Review the implementation in the same conversation.
+ Ask a separate reviewer to inspect the diff and report defects.

Paseo · two agent roles · View workflow
Usage context: selected week, sources and model mix

Like · Comment · Save · Use this version · Share
```

**Save** bookmarks an update. **Use this version** copies its published bundle into a new private draft with attribution to the original author/version. A later publication can say “Adapted from @handle.” Copying does not imply the user ran it successfully. Owners pin a favorite version or excerpt independently of their currently active version.

## 3. Friends and interaction

Add explicit following. The default feed is chronological and contains the user's own posts and public updates from people they follow. Mutual follows can be labeled friends. Shared-room members are useful follow suggestions; room membership does not grant new access to private setup history.

Ship personal shelves, optional ratings and short notes, and in-app notifications for shared versions and monthly milestones. Longer conversations link to Reddit. A notification links to the exact version or profile that caused it.

Keep a separate Discover view with tool/model filters and real public examples. An empty Following feed offers creating a first setup and finding people; suggestions remain visually separate from followed posts.

Reddit remains the home for broad community questions, support, and launch discussion. Comments attached to a saved setup live in Token Rats. This extends the earlier decision to link community navigation to Reddit; it introduces a specific social object with history inside the product.

## 4. UX and visual hierarchy

Primary navigation on desktop and mobile: **Feed · My setups · Stats · Boards · Profile**. Put Friends/Following and Discover inside Feed. Keep source connection and sync health accessible in Stats and the account menu.

| Surface | Proposed hierarchy |
| --- | --- |
| `/app` | Following/Discover; Share an update; chronological cards. Desktop sidebar: current setup, compact weekly usage, friends board. |
| `/app/setups` | Named setups and New setup. Detail view: current version, history, compare, restore, export. |
| `/u/[handle]` | Identity and Follow/Share; featured setup; favorite instructions; tools/models/plans; updates; compact usage and boards. |
| `/p/[id]` | Standalone update, approved diff, linked public version, usage context, comments, adaptation attribution. |
| `/app/stats` | Existing personal usage, model/source breakdowns, subscription comparison, setup-change markers. |
| `/app/boards` | Existing rooms and global/friends leaderboards with clear paths into profiles. |

Retain the orange rat identity and dark palette. Give names, explanations, and setup changes more space. Use monospace for file content and small diffs; keep normal prose readable. Collapse long diffs, show additions/removals with both symbols and color, and show changed filenames before opening code. On mobile, one feed column and a persistent five-item bottom navigation work well.

The profile should answer “How does this person work?” immediately. The public page can feature a favorite older version while clearly distinguishing the current published setup. Subscription names can be public while actual payments remain private. Account owners choose which usage summaries appear.

### Share cards

Extend the existing image routes with two initial formats:

- **My setup:** identity, selected tools/models/plans, favorite instruction excerpt, profile URL.
- **What changed:** update title, a short reviewed diff, version/date, optional usage summary, permanent update URL.

Add a square image download as well as the current link-preview format. Offer native sharing where supported, Copy link, and Download image. Public links should be readable before signup; following, saving, commenting, and adapting create the signup moment. Links to updates preserve that published version when the user's current setup changes.

## 5. Usage is its own record — corrected scope

Alberti's implementation direction supersedes the original before/after proposal: track setup history and token usage independently. Do not correlate them, explain token changes through setup changes, or ask users for verified structured outcomes. People can say what they tried, disliked, or dropped in short version notes and ratings; longer conversations belong on Reddit.

The product is closer to Goodreads plus Git for agent/devops setups: version history, personal shelves, ratings of versions tried, follow feeds, and a public profile of favorites. First monthly token milestones have their own in-app notification stream. Email activation is deferred; see email-continuation.md. An annual rewind belongs in later.md after real traction.

## 6. Implementation outline

Use the current Next.js + Worker + D1 stack. Initial tables:

- `setups`: owner, name, current version, featured version.
- `setup_versions`: setup, sequence, complete text/metadata bundle, content hash, created time, declared usage start, restore/remix reference.
- `setup_posts`: author, version, kind, text, approved public bundle, previous public post reference, optional fixed usage summary, publication state/time.
- `follows`: follower and followed user, unique pair.
- `post_likes`, `post_bookmarks`, `post_comments`: interactions referencing a post.
- `social_notifications`: recipient, actor, event, target, read state; keep existing push infrastructure separate initially.

Store file contents in bounded JSON bundles in D1 for the initial text-only release. Keep tool/plan metadata in the version bundle to preserve historical context. The copied public bundle is deliberate: private historical content must not be accidentally exposed through a post, diff, download, or share image.

Serve the feed by querying posts from followed users with `(published_at, id)` cursor pagination and appropriate author/time indexes. No recommendation service or precomputed feed fanout is needed initially. Permission checks also apply to direct version routes, exports, and social images. Erasure and unpublishing remain possible even though normal version editing creates new records.

Migrate existing instructions/workflow into an initial private version per owner. Preserve only the content already public in its initial public representation: full text for existing opt-ins, otherwise the existing public excerpt. Do not turn a historical preview into a fully published file. Retain the existing profile URLs, historical usage, rooms, and boards; replace the old single-field profile editor with setup editing.

CLI import can follow the web flow: select local files, preview the text, save a private checkpoint. Optional watch mode can later detect selected file changes and suggest checkpoints; social publication remains an explicit choice. Begin with explicit files so Paseo, Orca, custom handlers, and agent-specific instructions can all participate without specialized adapters.

## 7. Delivery order and acceptance criteria

| Release | Scope | Acceptance criterion |
| --- | --- | --- |
| A: Personal history | Setup editor, manual text import, version timeline, diff, restore/export, featured profile, tools/plans, setup card | Someone with zero followers can save two versions, compare them, restore the first as a third version, and export it. The public profile only exposes approved content. |
| B: Social updates | Publish from a version, follows, chronological feed, comments/likes/bookmarks, adaptation drafts, notifications, update cards | A friend follows a profile, sees its next update, comments, and makes an attributed private copy. A logged-out visitor can open the shared update. |
| C: Learning from usage | Change markers, optional before/after summaries, follow-up outcomes, explicit local-file import | The chart makes its source, window, sample size, and attribution limits visible. A reader can inspect the configuration used at that time. |
| D: Lower-friction capture | Opt-in file watching, project/session mapping, richer discovery | Changes can become private checkpoints with reviewable diffs and reliable scope; publication never happens merely because a file changed. |

Ship A and B as the first social release. Manual editing/import and the existing token collection are sufficient for that release. Exact historical attribution and automatic capture have additional data requirements and follow later.

Tests should cover version restore, published-excerpt boundaries in diffs/downloads/images, migration of current publication choices, follow/unfollow feed behavior, cursor pagination, unique reactions, comments permissions, and deletion/unpublishing. Browser checks should follow the entire save → publish → follow → comment → adapt flow and a logged-out share visit.

## 8. Launch and success

Use the existing public founder excerpt as the first real example. Ask early users to contribute an initial setup and one genuine subsequent change with a reason. Their own private history should be useful even if they decline publication.

Measure second-version saves, week-two return to history, share-link visits that lead to a saved setup, useful comments, and adaptations that are later edited or published. Track clicks on restore/download separately from actual adoption. Continue showing leaderboard engagement as a secondary product signal.

The immediate next design deliverable is a clickable Feed → Update → Profile → Setup history prototype, followed by the A/B implementation slices. This proposal does not change the deployed release or posting schedule.
