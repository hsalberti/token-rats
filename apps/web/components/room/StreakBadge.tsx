interface StreakBadgeProps {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Compact streak badge for leaderboard rows.
 * Shows current streak with a fire icon; muted if streak is 0.
 */
export function StreakBadge({ currentStreak, longestStreak }: StreakBadgeProps) {
  if (currentStreak === 0) {
    return (
      <span
        title={`No active streak (longest: ${longestStreak}d)`}
        className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-600"
      >
        <span>—</span>
      </span>
    );
  }

  return (
    <span
      title={`${currentStreak}-day streak (longest: ${longestStreak}d)`}
      className="inline-flex items-center gap-1 rounded-md bg-orange-950/60 px-2 py-0.5 text-xs font-mono font-bold text-orange-400"
    >
      <span>🔥</span>
      <span>{currentStreak}d</span>
    </span>
  );
}
