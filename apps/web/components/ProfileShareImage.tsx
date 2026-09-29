import type { ProfileShare } from "@token-rats/contracts";

function shortTokens(tokens: number) {
  if (tokens >= 1e9) return `${Number((tokens / 1e9).toFixed(2))}B`;
  if (tokens >= 1e6) return `${Number((tokens / 1e6).toFixed(1))}M`;
  if (tokens >= 1e3) return `${Number((tokens / 1e3).toFixed(1))}K`;
  return String(tokens);
}

function modelLabel(model: string | null) {
  if (!model) return "No usage yet";
  return (model.split("/").at(-1) ?? model)
    .replace(/-(20\d{2})-?(\d{2})-?(\d{2})$/, "")
    .replace(/^gpt-/i, "GPT-")
    .replace(/^claude-/i, "Claude ")
    .replace(/^gemini-/i, "Gemini ");
}

/** Code-rendered artwork keeps real usage and user text sharp at every export. */
export function ProfileShareImage({ share, logoUrl }: { share: ProfileShare; logoUrl: string }) {
  const excerpt =
    share.instructions?.text.trim() ||
    "No public instructions yet.\n\nFind my setups on Token Rats.";
  const shortExcerpt = excerpt.length <= 160 && excerpt.split("\n").length <= 4;
  const model = modelLabel(share.topModel);
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "#10110f",
        color: "#f4f2e9",
        fontFamily: "sans-serif",
        padding: "34px 42px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: -140,
          top: -360,
          width: 920,
          height: 920,
          borderRadius: "50%",
          border: "1px solid #403125",
          background: "radial-gradient(circle, #352318 0%, #171812 58%, #10110f 74%)",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: -72,
          top: -290,
          width: 780,
          height: 780,
          borderRadius: "50%",
          border: "1px solid #403125",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 0,
          top: -220,
          width: 640,
          height: 640,
          borderRadius: "50%",
          border: "1px solid #403125",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 24,
          borderBottom: "1px solid #393a30",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoUrl} alt="" width={44} height={44} />
          <div
            style={{ display: "flex", gap: 5, fontSize: 25, fontWeight: 700, letterSpacing: -1 }}
          >
            <span>Token</span>
            <span style={{ color: "#ff8a3d" }}>Rats</span>
          </div>
        </div>
        <div style={{ display: "flex", color: "#c2c1b4", fontSize: 13, letterSpacing: 3 }}>
          THE WAY I BUILD / 30 DAYS
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: 36, paddingTop: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 434 }}>
          <div
            style={{
              display: "block",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              fontSize: share.handle.length > 23 ? 28 : 36,
              fontWeight: 700,
              letterSpacing: -1.4,
            }}
          >{`@${share.handle}`}</div>
          <div
            style={{
              display: "block",
              color: "#b9b9ad",
              fontSize: 15,
              lineHeight: 1.4,
              height: 47,
              marginTop: 8,
              overflow: "hidden",
              lineClamp: 2,
              wordBreak: "break-word",
            }}
          >
            {share.bio?.slice(0, 104) || "My models. My instructions. My way of building."}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 112,
              fontWeight: 700,
              color: "#ff8a3d",
              lineHeight: 1.1,
              letterSpacing: -7,
              marginTop: 9,
            }}
          >
            {shortTokens(share.tokens)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 13,
              color: "#d1d2bf",
              letterSpacing: 3,
              marginTop: 3,
            }}
          >
            TOKENS / LAST 30 DAYS
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 30,
              paddingTop: 17,
              borderTop: "1px solid #393a30",
            }}
          >
            <div style={{ display: "flex", fontSize: 11, letterSpacing: 2, color: "#a9ab98" }}>
              MOST-USED MODEL
            </div>
            <div
              style={{
                display: "block",
                fontSize: model.length > 27 ? 22 : 28,
                fontWeight: 700,
                marginTop: 7,
                height: 35,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {model}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#d7e6a5",
                }}
              />
              <span
                style={{
                  display: "block",
                  color: "#d7e6a5",
                  fontSize: 17,
                  maxWidth: 270,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {share.topProvider || "No provider yet"}
              </span>
              <span style={{ color: "#9b9d8a", fontSize: 11, letterSpacing: 1 }}>TOP PROVIDER</span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: "#eeeddf",
            color: "#24271e",
            borderRadius: 14,
            marginTop: 2,
            height: 398,
            overflow: "hidden",
            boxShadow: "0 14px 40px #00000050",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              background: "#d7e6a5",
              padding: "17px 24px",
              borderBottom: "1px solid #b5c58c",
            }}
          >
            <div style={{ display: "flex", fontSize: 17, fontWeight: 700 }}>
              {(share.instructions?.fileName || "AGENTS.md").slice(0, 26)}
            </div>
            <div style={{ display: "flex", fontSize: 11, letterSpacing: 1 }}>MY AGENT BRIEF</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: shortExcerpt ? "center" : "flex-start",
              padding: "24px 26px 0",
              fontSize: shortExcerpt ? 30 : 20,
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                display: "block",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineClamp: shortExcerpt ? 6 : 9,
              }}
            >
              {excerpt}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "auto",
              padding: "12px 26px 18px",
              fontSize: 11,
              letterSpacing: 1.3,
              color: "#646950",
            }}
          >
            {share.instructions
              ? `EXCERPT · LINES ${share.instructions.start}–${share.instructions.end} · MORE ON MY PROFILE`
              : "INSTRUCTIONS THAT MAKE IT PERSONAL"}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 17,
          borderTop: "1px solid #393a30",
          color: "#a9ab98",
          fontSize: 13,
        }}
      >
        <span>{`tokenrats.com/u/${share.handle}`}</span>
        <span>{`${new Date(share.period.start).toISOString().slice(0, 10)} — ${new Date(share.period.end).toISOString().slice(0, 10)} / UTC`}</span>
      </div>
    </div>
  );
}
