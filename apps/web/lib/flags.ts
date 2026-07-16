/**
 * Web feature flags.
 *
 * Simple compile-time booleans that gate user-visible surfaces. Flip a flag and
 * everything guarded by it disappears from the UI — the underlying code paths
 * (OAuth routes, API helpers, contract fields) stay intact so the feature can be
 * turned back on without a rebuild of the data model.
 */

/**
 * Master switch for every Twitter/X-facing surface: verified-handle pills, the
 * profile connect/disconnect section, "Post to X" share buttons, and the
 * @tokenratsx / @hsalberti footer + help links. Set to `false` to hide all of
 * them site-wide.
 */
export const TWITTER_ENABLED = false;
