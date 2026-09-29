export const CURRENT_RELEASE = {
  id: "friends-history-2026-09",
  title: "Your agent setup has a story now",
  date: "September 2026",
  subject: "What's new on Token Rats: setup history, friends, and kudos",
} as const;

export interface CampaignReport {
  id: string;
  status: string;
  createdAt: number;
  startedAt: number | null;
  audienceTotal: number;
  missingEmail: number;
  excluded: number;
  recipients: number;
  pending: number;
  failed: number;
  cancelled: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  returned: number;
  returnedAfterClick: number;
  newUsageEligible: number;
  newUsage: number;
  newUsageAfterClick: number;
  existingUsageActive: number;
  newSetupEligible: number;
  newSetup: number;
  newSetupAfterClick: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}
