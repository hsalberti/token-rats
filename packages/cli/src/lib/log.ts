/**
 * Minimal color/logging helpers using plain ANSI codes.
 * No external color library required.
 */

const ESC = "\x1b";

export const c = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  cyan: `${ESC}[36m`,
  red: `${ESC}[31m`,
  gray: `${ESC}[90m`,
};

function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

function color(code: string, text: string): string {
  return isTTY() ? `${code}${text}${c.reset}` : strip(text);
}

export function info(msg: string): void {
  console.log(color(c.cyan, `  ${msg}`));
}

export function success(msg: string): void {
  console.log(color(c.green, `✓ ${msg}`));
}

export function warn(msg: string): void {
  console.warn(color(c.yellow, `⚠ ${msg}`));
}

export function error(msg: string): void {
  console.error(color(c.red, `✗ ${msg}`));
}

export function dim(msg: string): void {
  console.log(color(c.dim, `  ${msg}`));
}

export function bold(msg: string): void {
  console.log(isTTY() ? `${c.bold}${msg}${c.reset}` : msg);
}

/** Simple spinner — returns a stop() function. No-op when not a TTY. */
export function spinner(label: string): { stop: (finalMsg?: string) => void } {
  if (!isTTY()) {
    process.stdout.write(`  ${label}...\n`);
    return {
      stop(finalMsg?: string) {
        if (finalMsg) process.stdout.write(`  ${finalMsg}\n`);
      },
    };
  }

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${c.cyan}${frames[i++ % frames.length]}${c.reset} ${label}   `);
  }, 80);

  return {
    stop(finalMsg?: string) {
      clearInterval(interval);
      process.stdout.write("\r\x1b[K"); // clear line
      if (finalMsg) success(finalMsg);
    },
  };
}
