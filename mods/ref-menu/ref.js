// Reference lines for other agents. The first token is the hc address they can
// act on (`t9`, or `machine/t9`); the rest is context so the line explains
// itself when pasted into another agent's prompt.
//
// Kept free of `herdr` imports so the shape can be tested with plain Node.

/** The hc address, machine-qualified when the terminal lives elsewhere. */
export function addressOf(term, space) {
  const address = String(term?.address ?? "");
  if (!address) return "";
  if (space?.machine && !address.includes("/")) return `${space.machine}/${address}`;
  return address;
}

/** The program/agent name, from the app's terminal shape or hc's status object. */
export function appOf(term) {
  return (
    term?.report?.app ||
    (typeof term?.status === "object" ? term?.status?.app : null) ||
    term?.template ||
    term?.foreground?.name ||
    term?.name ||
    "terminal"
  );
}

/** The reported state word ("working", "blocked", ...), or "". */
export function stateOf(term) {
  if (typeof term?.status === "string") return term.status;
  return term?.status?.state ?? "";
}

/** Live terminals belonging to a tab, pane order first, then any that report
 *  the tab label without a pane (kept sub-agents). */
export function terminalsOfTab(tabId, terminals, panes) {
  const all = (terminals ?? []).filter((t) => t?.state === "live");
  const mine = all.filter((t) => t?.labels?.["herdr.tab"] === tabId);
  const order = (panes ?? []).filter((p) => p?.tab === tabId && p.terminal).map((p) => p.terminal);
  const out = [];
  const seen = new Set();
  const add = (term) => {
    if (!term || seen.has(term.address)) return;
    seen.add(term.address);
    out.push(term);
  };
  const same = (a, b) => a === b || String(a).endsWith(`/${b}`);
  for (const address of order) {
    add(mine.find((t) => same(address, t.address)) ?? all.find((t) => same(address, t.address)));
  }
  for (const term of mine) add(term);
  return out;
}

/** The space and tab that own a tab id. */
export function locateTab(tabId, spaces) {
  for (const space of spaces ?? []) {
    const tab = (space.tabs ?? []).find((t) => t.id === tabId);
    if (tab) return { space, tab };
  }
  return { space: null, tab: null };
}

/** One pasteable line: `t9 — herdr · opencode working · ...`. */
export function reference(term, space, tab) {
  const address = addressOf(term, space);
  const bits = [];
  const app = appOf(term);
  const state = stateOf(term);
  bits.push([app, state].filter(Boolean).join(" "));

  const title = String(term?.title ?? term?.status?.title ?? "").trim();
  if (title && title !== app) bits.push(`"${title}"`);

  if (tab) bits.push(`tab "${tab.name}" (${tab.id})`);
  if (space) bits.push(`space "${space.name}" (${space.id})`);
  if (term?.cwd) bits.push(term.cwd);
  bits.push(`hc: get/read/send/wait ${address}`);

  return `${address} — herdr · ${bits.join(" · ")}`;
}
