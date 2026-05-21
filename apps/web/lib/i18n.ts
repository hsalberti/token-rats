/**
 * i18n — minimal English ↔ Portuguese (BR) dictionary.
 *
 * Detection is server-side from `Accept-Language` (see lib/server-locale.ts).
 * No client-side runtime negotiation, no external library.
 *
 * Brand and meme terms are intentionally NOT translated and live inline in
 * the dictionaries below (e.g. "Token-mogg", "Token-maxx", "feel the agi",
 * "Strava", "Flex the burn"). Translators: do not localise those tokens —
 * they're part of the product voice. See mission.md for the rationale.
 */

export type Locale = "en" | "pt-BR";

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Parse an Accept-Language header and pick the best supported locale.
 * Honours quality factors; falls back to `en` when no supported tag matches.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const tags = acceptLanguage
    .split(",")
    .map((entry) => {
      const [raw, ...params] = entry.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=(\d*\.?\d+)$/i);
        if (m?.[1]) q = Number(m[1]) || 0;
      }
      return { tag: (raw ?? "").toLowerCase().trim(), q };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

/* -------------------------------------------------------------------------- */
/* Dictionary                                                                 */
/* -------------------------------------------------------------------------- */

const EN = {
  /* Common */
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "common.cancel": "Cancel",

  /* Privacy line — repeated on every authed surface */
  "privacy.short": "Counts only — we literally can’t read your prompts.",
  "privacy.verifyCli": "Verify the CLI on GitHub",
  "privacy.verifyShort": "Verify the CLI →",

  /* Landing */
  "landing.tagline":
    "Strava for AI token burn. Auto-sync your Claude Code or Codex logs. Compete with friends and token-maxx your way to the top of the leaderboards.",
  "landing.signin": "Sign in with GitHub",
  "landing.boardTitle": "Global Token Consumption Leaderboard",
  "landing.boardSub": "Live global leaderboard of public Token Rats. Opt-in only.",
  "landing.howItWorks": "How it works",
  "landing.step1.title": "Install",
  "landing.step1.desc":
    "One command to connect your Claude Code and Cursor logs. Runs locally — no prompt content leaves your machine.",
  "landing.step2.title": "Compete",
  "landing.step2.desc":
    "Create a board with friends, or hit the global / country leaderboards. Climb, post, repeat.",
  "landing.step3.title": "Token-maxx",
  "landing.step3.desc": "Token mog your friends, feel the agi. Accelerate. Ship. Repeat.",
  "landing.forTeams": "For IT teams & companies →",

  /* /teams pitch page */
  "teams.title": "Token Rats for IT teams",
  "teams.sub":
    "We work with IT teams so enterprises can safely set up token usage competitions across teams.",
  "teams.bullet1.title": "Privacy by design",
  "teams.bullet1.body":
    "Counts only. The CLI literally can’t read your prompts or completions — only token counts leave the machine.",
  "teams.bullet2.title": "Direct contact with founders",
  "teams.bullet2.body":
    "While we’re early, every org gets a direct line to the founders. Tell us what your team needs.",
  "teams.bullet3.title": "Team-wide dashboards",
  "teams.bullet3.body":
    "Spend by user, by model, by day — across your whole org. Healthy competition, real cost visibility.",
  "teams.waitlistTitle": "Join the orgs waitlist",
  "teams.waitlistBody":
    "Orgs are on a manual approval queue right now. Sign in, request your org, and we’ll be in touch.",
  "teams.cta.signedOut": "Sign in with GitHub to request",
  "teams.cta.signedIn": "Request your org →",
  "teams.backHome": "← Back home",

  /* Sign in */
  "signin.title": "Sign in or create an account",
  "signin.sub":
    "One click with GitHub. We’ll spin up your handle, your leaderboard, and your first board.",
  "signin.privacy":
    "We only read your public GitHub profile. We literally can’t read your prompts.",
  "signin.noAccount": "No account?",
  "signin.noAccountCta": "Signing in creates one.",
  "signin.tagline": "Strava for AI token burn.",

  /* Dashboard */
  "dash.cardA.eyebrow": "With friends",
  "dash.cardA.title": "Create a board",
  "dash.cardA.body": "Compete with your crew. Token-mogg them all week.",
  "dash.cardA.cta": "+ Create board",
  "dash.cardB.eyebrow": "Public boards",
  "dash.cardB.title": "Hit the global leaderboards",
  "dash.cardB.body": "Compete countrywide or worldwide. Opt-in, public.",
  "dash.cardB.ctaCountry": "{country} board",
  "dash.cardB.ctaGlobal": "Global trending",
  "dash.cardB.secondary": "Global trending",
  "dash.nameBoard": "Name your board",
  "dash.boardName": "Board name",
  "dash.boardNamePlaceholder": "e.g. Weekend Builders",
  "dash.makePublicPrefix": "Make this board public for",
  "dash.makePublicSuffix": "Listed on /groups; joinable by anyone in {country}.",
  "dash.cantDetectCountry":
    "We couldn’t detect your country, so public boards aren’t available here.",
  "dash.creating": "Creating…",
  "dash.createBtn": "Create board",
  "dash.yourBoards": "Your boards",
  "dash.friendsLink": "Friends →",
  "dash.noBoards": "No boards yet",
  "dash.noBoardsHint": "Create one above, or paste a code below to join a friend’s.",
  "dash.haveCode": "Got an invite code?",
  "dash.joinPlaceholder": "e.g. abc-xyz",
  "dash.joinBtn": "Join board",
  "dash.joining": "Joining…",
  "dash.addSource": "Add a source",
  "dash.addSourceSub":
    "Pick where your tokens live. The CLI handles the rest — counts only, never prompts.",
  "dash.createFailed": "Failed to create board",
  "dash.joinFailed": "Failed to join board",

  /* UserMenu */
  "menu.signedInAs": "Signed in as",
  "menu.publicProfile": "View public profile",
  "menu.friends": "Friends",
  "menu.autobiography": "Token autobiography",
  "menu.requestOrg": "Request an org",
  "menu.settings": "Settings",
  "menu.helpDm": "Help · DM @tokenratsx",
  "menu.signout": "Sign out",

  /* Settings */
  "settings.title": "Settings",
  "settings.tab.profile": "Profile",
  "settings.tab.notifications": "Notifications",
  "settings.tab.referrals": "Invite friends",
  "settings.tab.orgs": "Orgs",
  "settings.backToApp": "← App",
  "settings.orgs.title": "Orgs",
  "settings.orgs.body":
    "Request an org for your team. Direct line to the founders while we’re early.",
  "settings.orgs.cta": "Request an org →",
  "settings.orgs.learnMore": "Learn more about Token Rats for teams →",

  /* Onboarding (no-sessions view) */
  "onb.noSync.greeting": "@{handle}, you haven’t synced yet.",
  "onb.noSync.body": "Run the CLI to upload your Claude Code + Cursor usage, then come back here.",
  "onb.quickStart": "Quick start",
  "onb.gotoDash": "Go to dashboard",
  "onb.refresh": "Refresh",

  /* InstallBlock */
  "install.runsLocally": "Runs locally · counts only · never reads your prompts",
  "install.copyBoth": "Copy both",

  /* NodeInstallHint */
  "node.dontHaveNode": "Don’t have Node?",
  "node.helpDm": "Help · DM @tokenratsx",
  "node.otherPlatforms": "Other platforms",
  "node.orDownload": "Or download from",

  /* SourcePicker */
  "source.autodiscover":
    "The CLI auto-discovers your local {sourceName} logs and uploads counts only — no prompts, no completions, no source code.",

  /* Footer */
  "footer.madeBy": "made by",
} as const;

const PT_BR: Record<keyof typeof EN, string> = {
  /* Common */
  "common.copy": "Copiar",
  "common.copied": "Copiado!",
  "common.cancel": "Cancelar",

  /* Privacy */
  "privacy.short": "Só contagens — literalmente não conseguimos ler seus prompts.",
  "privacy.verifyCli": "Verifique a CLI no GitHub",
  "privacy.verifyShort": "Verifique a CLI →",

  /* Landing — keep "Strava", "Flex the burn", "Token Rats" intact */
  "landing.tagline":
    "Strava da queima de tokens de IA. Sincroniza seus logs do Claude Code ou Codex. Compita com amigos e token-maxx até o topo dos rankings.",
  "landing.signin": "Entrar com GitHub",
  "landing.boardTitle": "Ranking Global de Consumo de Tokens",
  "landing.boardSub": "Ranking global ao vivo dos Token Rats públicos. Só com opt-in.",
  "landing.howItWorks": "Como funciona",
  "landing.step1.title": "Instalar",
  "landing.step1.desc":
    "Um comando para conectar seus logs do Claude Code e Cursor. Roda local — nenhum prompt sai da sua máquina.",
  "landing.step2.title": "Competir",
  "landing.step2.desc":
    "Crie uma board com a galera, ou caia nos rankings global / por país. Sobe, posta, repete.",
  // Keep meme stack: Token-maxx, "Token mog", "feel the agi", "Accelerate. Ship. Repeat."
  "landing.step3.title": "Token-maxx",
  "landing.step3.desc": "Token mog your friends, feel the agi. Accelerate. Ship. Repeat.",
  "landing.forTeams": "Para times de TI & empresas →",

  /* /teams pitch page */
  "teams.title": "Token Rats para times de TI",
  "teams.sub":
    "A gente trabalha com times de TI para empresas montarem competições de uso de tokens entre equipes, com segurança.",
  "teams.bullet1.title": "Privacidade por design",
  "teams.bullet1.body":
    "Só contagens. A CLI literalmente não consegue ler seus prompts ou completions — só contagens saem da máquina.",
  "teams.bullet2.title": "Contato direto com os founders",
  "teams.bullet2.body":
    "Enquanto estamos cedo, cada org tem linha direta com os founders. Conta o que seu time precisa.",
  "teams.bullet3.title": "Dashboards para o time todo",
  "teams.bullet3.body":
    "Gasto por pessoa, por modelo, por dia — em toda a org. Competição saudável, visibilidade real de custo.",
  "teams.waitlistTitle": "Entre na waitlist de orgs",
  "teams.waitlistBody":
    "Orgs estão numa fila de aprovação manual. Entre, peça sua org, e a gente entra em contato.",
  "teams.cta.signedOut": "Entrar com GitHub para pedir",
  "teams.cta.signedIn": "Pedir sua org →",
  "teams.backHome": "← Voltar ao início",

  /* Sign in */
  "signin.title": "Entre ou crie uma conta",
  "signin.sub": "Um clique com GitHub. A gente cria seu handle, seu ranking e sua primeira board.",
  "signin.privacy":
    "Lemos só seu perfil público do GitHub. Literalmente não conseguimos ler seus prompts.",
  "signin.noAccount": "Sem conta?",
  "signin.noAccountCta": "Entrar já cria uma.",
  "signin.tagline": "Strava da queima de tokens de IA.",

  /* Dashboard — keep Token-mogg meme */
  "dash.cardA.eyebrow": "Com a galera",
  "dash.cardA.title": "Crie uma board",
  "dash.cardA.body": "Compita com sua tropa. Token-mogg eles a semana inteira.",
  "dash.cardA.cta": "+ Criar board",
  "dash.cardB.eyebrow": "Boards públicas",
  "dash.cardB.title": "Caia nos rankings globais",
  "dash.cardB.body": "Compita no seu país ou no mundo. Opt-in, público.",
  "dash.cardB.ctaCountry": "Board do {country}",
  "dash.cardB.ctaGlobal": "Trending global",
  "dash.cardB.secondary": "Trending global",
  "dash.nameBoard": "Dê nome à sua board",
  "dash.boardName": "Nome da board",
  "dash.boardNamePlaceholder": "ex: Galera de Fim de Semana",
  "dash.makePublicPrefix": "Tornar essa board pública para",
  "dash.makePublicSuffix": "Listada em /groups; qualquer um em {country} pode entrar.",
  "dash.cantDetectCountry":
    "Não detectamos seu país, então boards públicas não estão disponíveis aqui.",
  "dash.creating": "Criando…",
  "dash.createBtn": "Criar board",
  "dash.yourBoards": "Suas boards",
  "dash.friendsLink": "Amigos →",
  "dash.noBoards": "Sem boards ainda",
  "dash.noBoardsHint": "Cria uma aí em cima, ou cola um código abaixo para entrar na de um amigo.",
  "dash.haveCode": "Tem um código de convite?",
  "dash.joinPlaceholder": "ex: abc-xyz",
  "dash.joinBtn": "Entrar na board",
  "dash.joining": "Entrando…",
  "dash.addSource": "Adicionar fonte",
  "dash.addSourceSub":
    "Escolha onde seus tokens vivem. A CLI cuida do resto — só contagens, nunca prompts.",
  "dash.createFailed": "Falha ao criar board",
  "dash.joinFailed": "Falha ao entrar na board",

  /* UserMenu — keep handle */
  "menu.signedInAs": "Logado como",
  "menu.publicProfile": "Ver perfil público",
  "menu.friends": "Amigos",
  "menu.autobiography": "Token autobiografia",
  "menu.requestOrg": "Pedir uma org",
  "menu.settings": "Configurações",
  "menu.helpDm": "Ajuda · DM @tokenratsx",
  "menu.signout": "Sair",

  /* Settings */
  "settings.title": "Configurações",
  "settings.tab.profile": "Perfil",
  "settings.tab.notifications": "Notificações",
  "settings.tab.referrals": "Convidar amigos",
  "settings.tab.orgs": "Orgs",
  "settings.backToApp": "← App",
  "settings.orgs.title": "Orgs",
  "settings.orgs.body":
    "Peça uma org para seu time. Linha direta com os founders enquanto estamos cedo.",
  "settings.orgs.cta": "Pedir uma org →",
  "settings.orgs.learnMore": "Saiba mais sobre o Token Rats para times →",

  /* Onboarding */
  "onb.noSync.greeting": "@{handle}, você ainda não sincronizou.",
  "onb.noSync.body": "Rode a CLI para enviar seu uso do Claude Code + Cursor e volte aqui.",
  "onb.quickStart": "Início rápido",
  "onb.gotoDash": "Ir para o dashboard",
  "onb.refresh": "Atualizar",

  /* InstallBlock */
  "install.runsLocally": "Roda local · só contagens · nunca lê seus prompts",
  "install.copyBoth": "Copiar tudo",

  /* NodeInstallHint */
  "node.dontHaveNode": "Não tem Node?",
  "node.helpDm": "Ajuda · DM @tokenratsx",
  "node.otherPlatforms": "Outras plataformas",
  "node.orDownload": "Ou baixe em",

  /* SourcePicker */
  "source.autodiscover":
    "A CLI descobre seus logs locais do {sourceName} e envia só contagens — sem prompts, sem completions, sem código-fonte.",

  /* Footer */
  "footer.madeBy": "feito por",
};

const DICT: Record<Locale, Record<keyof typeof EN, string>> = {
  en: EN,
  "pt-BR": PT_BR,
};

export type I18nKey = keyof typeof EN;

/** Translate a key, with optional `{var}` interpolation. */
export function t(locale: Locale, key: I18nKey, vars?: Record<string, string | number>): string {
  let value = DICT[locale]?.[key] ?? EN[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.split(`{${k}}`).join(String(v));
    }
  }
  return value;
}
