# Third-party notices

Token Rats vendors small amounts of third-party content. Each entry below lists the upstream source, the license under which it ships, and the in-tree location.

---

## CodexBar — provider logo SVGs (MIT)

40 SVG provider logos under [`assets/providers/`](./assets/providers/) were mirrored from [steipete/CodexBar](https://github.com/steipete/CodexBar), commit on `main` as of **2026-05-18**.

- **License:** MIT — full text in [`assets/providers/LICENSE-CodexBar`](./assets/providers/LICENSE-CodexBar)
- **Copyright:** © 2026 Peter Steinberger
- **Per-file metadata + trademark caveats:** [`assets/providers/README.md`](./assets/providers/README.md)

> **Trademarks are not covered by the MIT license.** Each SVG depicts a third-party brand mark (Anthropic, OpenAI, Cursor, Google, Microsoft, etc.). The MIT grant covers reuse of the *file assets*; it does not grant permission to use each company's trademarks. See `assets/providers/README.md` for the disclaimer requirements before shipping any of these in a user-visible surface.

No CodexBar **source code** (Swift, TypeScript, JS, configuration) is vendored. The provider auth/data-source matrix in [`research/codexbar.md`](./research/codexbar.md) is summarized from public README content and is used as a *spec*, not as code to port verbatim.
