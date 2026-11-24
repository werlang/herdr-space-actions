// Which agent row reads as selected.
//
// Herdr reports a focused terminal only while one holds the keyboard. A mod
// pane standing in for its tab's terminal — the chat view beside an agent —
// reports `terminal: null`, and `focused().agent` falls back to some other
// agent, so reading it would select the wrong row. The view still belongs to
// the tab's agent: when the keyboard is in a mod pane and its tab holds
// exactly one agent terminal, that agent is the one on screen.

/**
 * @param {object} state
 * @param {{pane?: string|null, tab?: string|null, terminal?: string|null, shown?: string|null, agent?: string|null}|null} state.focused `focused()`
 * @param {Array<{pane: string, tab: string, terminal: string|null}>} [state.panes] `panes()`
 * @param {Array<{address: string}>} [state.agents] `agents()`
 * @returns {string|null} the agent address to show as selected
 */
export function selectedAgent({ focused, panes = [], agents = [] } = {}) {
  /** Whether a terminal address belongs to an agent Herdr reports. */
  const isAgent = (address) => Boolean(address) && agents.some((a) => a.address === address);

  const pane = focused?.pane ? panes.find((p) => p.pane === focused.pane) : null;
  if (focused?.pane && !pane) return null;
  if (pane) {
    // A real pane: the terminal shown in it, or its own terminal.
    const term = focused?.shown || pane.terminal;
    if (term) return isAgent(term) ? term : null;
    // A mod pane (the chat view): the tab's one agent terminal is the agent on screen.
    const terms = panes.filter((p) => p.tab === pane.tab && isAgent(p.terminal));
    return terms.length === 1 ? terms[0].terminal : null;
  }

  // No model pane: a layout block. A terminal block names its terminal; an
  // agent block names its agent.
  const term = focused?.shown || focused?.terminal;
  if (term) return isAgent(term) ? term : null;
  return isAgent(focused?.agent) ? focused.agent : null;
}
