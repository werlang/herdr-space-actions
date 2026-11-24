// What a plain (non-agent) terminal is doing. Pure: main.js reads the facts,
// this decides the state, and term-status.test.mjs checks the rules.

// A terminal is working when something other than its own shell is in front.
// Both pids known: the pid alone decides, since a display name may differ from
// the shell's own. One missing: fall back to comparing the program names.
export function foregroundWorking(foreground, pid, shell) {
  if (!foreground) return false;
  if (foreground.pid != null && pid != null) return foreground.pid !== pid;
  return Boolean(foreground.name && shell && foreground.name !== shell);
}

// What a row needs from a terminal: its state, exit details, and whether the
// foreground is something other than its shell. A terminals() entry that
// carries `foreground` wins; otherwise the cached `hc get` does.
export function termFacts(raw, cached, shell) {
  const live = raw && Object.prototype.hasOwnProperty.call(raw, "foreground");
  if (live) {
    const hasExit = Object.prototype.hasOwnProperty.call(raw, "exit_code") || Object.prototype.hasOwnProperty.call(raw, "exitCode");
    return {
      state: raw.state ?? cached?.state ?? "live",
      exitCode: hasExit ? raw.exit_code ?? raw.exitCode : cached?.exitCode ?? null,
      signal: Object.prototype.hasOwnProperty.call(raw, "signal") ? raw.signal : cached?.signal ?? null,
      working: foregroundWorking(raw.foreground, raw.pid, shell),
      argv: Array.isArray(raw.foreground?.argv) ? raw.foreground.argv : cached?.argv ?? null,
    };
  }
  if (cached) return cached;
  if (!raw) return null;
  // The slow poll hasn't answered yet: show it at its prompt rather than drop it.
  return {
    state: raw.state ?? "live",
    exitCode: raw.exit_code ?? raw.exitCode ?? null,
    signal: raw.signal ?? null,
    working: false,
    argv: null,
  };
}

// A plain terminal's state. `prev` is what this function said last time:
// a command that just finished is done until the pane is looked at, then idle;
// once seen, a clean finish stays idle rather than list itself as done again.
// A non-zero exit or a signal always needs you.
export function termStatus(facts, prev, focused = false) {
  if (!facts) return null;
  if (facts.state === "finished") {
    const failed = (facts.exitCode != null && Number(facts.exitCode) !== 0) || Boolean(facts.signal);
    if (failed) return "blocked";
    return focused || prev === "idle" ? "idle" : "done";
  }
  if (facts.state !== "live") return "idle";
  if (facts.working) return "working";
  if (focused) return "idle";
  return prev === "working" || prev === "done" ? "done" : "idle";
}
