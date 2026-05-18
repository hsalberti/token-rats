/** Minimal ANSI color helpers — no external dependency. */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";

const isCI = process.env["CI"] === "true";
const noColor =
  process.env["NO_COLOR"] !== undefined ||
  process.env["TERM"] === "dumb" ||
  isCI;

function color(code: string, text: string): string {
  if (noColor) return text;
  return `${code}${text}${RESET}`;
}

export const log = {
  info: (msg: string) => console.log(color(CYAN, "ℹ"), msg),
  success: (msg: string) => console.log(color(GREEN, "✓"), msg),
  warn: (msg: string) => console.log(color(YELLOW, "⚠"), msg),
  error: (msg: string) => console.error(color(RED, "✗"), msg),
  dim: (msg: string) => console.log(color(DIM, msg)),
  bold: (msg: string) => console.log(color(BOLD, msg)),
  plain: (msg: string) => console.log(msg),

  /** Print only when --verbose is active. */
  verbose: (msg: string, verbose: boolean) => {
    if (verbose) console.log(color(DIM, `  ${msg}`));
  },
};

/** Simple inline spinner backed by setInterval. Returns a stop() function. */
export function spinner(label: string): { stop: (final?: string) => void } {
  if (noColor || !process.stdout.isTTY) {
    console.log(`${label}…`);
    return { stop: (final?: string) => { if (final) console.log(final); } };
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${color(CYAN, frames[i++ % frames.length] ?? "·")} ${label}…`);
  }, 80);
  return {
    stop: (final?: string) => {
      clearInterval(id);
      process.stdout.write("\r\x1b[K"); // clear line
      if (final) console.log(final);
    },
  };
}
