import type { AgentSoftware } from "@token-rats/contracts";

const details = {
  paseo: { label: "Paseo", icon: "/agent-software/paseo.svg" },
  codex: { label: "Codex", icon: "/providers/codex.svg" },
  orca: { label: "Orca", icon: "/agent-software/orca.png" },
  proprietary: { label: "Proprietary", icon: "/agent-software/proprietary.svg" },
  other: { label: "Other", icon: null },
} as const;

export function AgentSoftwareBadges({ software }: { software: AgentSoftware[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {software.map((item) => {
        const detail = details[item.id];
        const label =
          item.name && (item.id === "other" || item.id === "proprietary")
            ? item.name
            : detail.label;
        const icon = item.logoUrl ?? detail.icon;
        return (
          <span
            key={item.id}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200"
          >
            {icon ? (
              <img
                src={icon}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded-sm object-contain"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded bg-zinc-700 text-xs"
              >
                {label.charAt(0).toUpperCase()}
              </span>
            )}
            {label}
          </span>
        );
      })}
    </div>
  );
}
