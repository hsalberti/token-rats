# Email activation — postponed at Alberti's request

## Current status

The app implements a persistent queue for setup and first monthly milestone emails, opt-in preferences, retries, provider idempotency, and signed unsubscribe links. In-app notifications work independently. Email activation is intentionally postponed; no release announcement or customer email was sent during this work.

- Sender selected by Alberti: `Token Rats <updates@tokenrats.com>`.
- `RESEND_API_KEY` exists in BWS; the latest key has Full access for domain setup. Never put its value in this repository.
- Resend domain `tokenrats.com` was created with ID `08d8c143-21f6-4b9d-a1a7-48dac6127bb1`.
- The domain is not verified. A test to Resend's documented `delivered@resend.dev` address was rejected because of that.
- Cloudflare zone ID: `c4f236587bc337eb4ea959ff0b3e8a0a`.
- Existing main/old Cloudflare tokens returned 403; the routes token can read the zone but cannot read/write DNS. Local Wrangler OAuth can deploy Workers/D1 but cannot manage DNS.
- No DNS changes were made. Worker email secrets have not been installed, so delivery remains inactive.

## Resume steps

1. Obtain a Cloudflare token with Zone → DNS → Edit, restricted to tokenrats.com, through BWS as `CLOUDFLARE_DNS_TOKEN`.
2. Fetch fresh records with Resend `GET /domains/08d8c143-21f6-4b9d-a1a7-48dac6127bb1`. Do not recreate the domain. It currently requests DKIM TXT `resend._domainkey`, SPF TXT and MX at `send`, and CNAME `rsend`. Copy the returned values exactly and keep the CNAME DNS-only. Inspect existing records before adding anything.
3. Request verification with Resend `POST /domains/{id}/verify`, then wait for verified status. Add an appropriate DMARC policy only after inspecting any existing policy.
4. Replace the temporary Full access key with a sending key restricted to this domain. Store `EMAIL_FROM` in BWS and install `RESEND_API_KEY` plus `EMAIL_FROM` as Worker secrets without printing values.
5. Run the real sender against `delivered@resend.dev`, including the unsubscribe headers. Check provider status, retries, idempotency, and unsubscribe. Use a dedicated test identity; do not send tests to customers.
6. Activate the opt-in friend-email controls and verify the five-minute scheduled queue dispatcher. It processes up to ten emails per run; items older than 24 hours are cancelled, so stale notifications are not delivered after activation. Expand batching/queue throughput when audience volume warrants it.
7. Monitor provider suppression/bounce behavior. Add signed provider webhooks for suppression tracking before running bulk campaigns.
8. Release announcements in `release-emails.md` are drafts. Prepare recipient eligibility and the final body for Alberti's review before sending a campaign. Friend-notification preferences are not campaign consent.

## Event semantics

- A shared setup version alerts its author's followers once per version.
- Monthly milestones are 1M, 10M, and 100M recorded tokens in a UTC calendar month, each only once in the person's history.
- Existing history is seeded silently during migration. Historical imports do not send retroactive announcements.
- Private profiles, unpublished versions, unfollows, and preference changes suppress pending deliveries.
- Tokens and setup changes are independent records; email copy must not claim one explains the other.

References: [Resend domain API](https://resend.com/docs/api-reference/domains/get-domain), [test recipients](https://resend.com/docs/dashboard/emails/send-test-emails), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
