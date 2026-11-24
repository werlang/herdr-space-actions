import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectedAgent } from "../mods/agents-plus/selection.js";

const agent = (address) => ({ address });

const pane = (id, tab, terminal, mod) => ({
  pane: id,
  tab,
  terminal: terminal ?? null,
  ...(mod ? { mod } : {}),
});

describe("selectedAgent", () => {
  it("uses the focused pane's terminal when an agent has the keyboard", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "p1", tab: "t1", terminal: "tt1", agent: "tt1" },
        panes: [pane("p1", "t1", "tt1")],
        agents: [agent("tt1")],
      }),
      "tt1",
    );
  });

  it("uses a terminal shown in place of the pane's own", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "p1", tab: "t1", terminal: "tt1", shown: "tt2", agent: "tt2" },
        panes: [pane("p1", "t1", "tt1")],
        agents: [agent("tt1"), agent("tt2")],
      }),
      "tt2",
    );
  });

  it("keeps the tab's agent selected while its chat pane has the keyboard", () => {
    assert.equal(
      selectedAgent({
        // Herdr falls back to an unrelated agent for mod panes.
        focused: { pane: "chat", tab: "t1", terminal: null, agent: "other" },
        panes: [pane("term", "t1", "tt1"), pane("chat", "t1", null, "agent-chat")],
        agents: [agent("tt1"), agent("other")],
      }),
      "tt1",
    );
  });

  it("ignores a plain shell splitting the same tab", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "chat", tab: "t1", terminal: null, agent: null },
        panes: [
          pane("term", "t1", "tt1"),
          pane("shell", "t1", "tt2"),
          pane("chat", "t1", null, "agent-chat"),
        ],
        agents: [agent("tt1")],
      }),
      "tt1",
    );
  });

  it("stays unselected when the tab has two agent terminals", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "chat", tab: "t1", terminal: null, agent: null },
        panes: [
          pane("a", "t1", "tt1"),
          pane("b", "t1", "tt2"),
          pane("chat", "t1", null, "agent-chat"),
        ],
        agents: [agent("tt1"), agent("tt2")],
      }),
      null,
    );
  });

  it("stays unselected for a shell pane without an agent", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "shell", tab: "t1", terminal: "tt2", agent: "other" },
        panes: [pane("shell", "t1", "tt2")],
        agents: [agent("tt1"), agent("other")],
      }),
      null,
    );
  });

  it("uses a layout terminal block's terminal", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: null, tab: "t1", terminal: "tt1", agent: null },
        panes: [],
        agents: [agent("tt1")],
      }),
      "tt1",
    );
  });

  it("uses an agent block's agent", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: null, tab: "t1", terminal: null, agent: "tt1" },
        panes: [],
        agents: [agent("tt1")],
      }),
      "tt1",
    );
  });

  it("stays unselected for a layout mod block", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: null, tab: "t1", terminal: null, agent: null },
        panes: [pane("term", "t1", "tt1")],
        agents: [agent("tt1")],
      }),
      null,
    );
  });

  it("stays unselected for a mod pane in a tab without agents", () => {
    assert.equal(
      selectedAgent({
        focused: { pane: "file", tab: "t1", terminal: null, agent: null },
        panes: [pane("shell", "t1", "tt2"), pane("file", "t1", null, "file-editor")],
        agents: [agent("tt1")],
      }),
      null,
    );
  });

  it("handles missing focus and unknown panes", () => {
    assert.equal(selectedAgent({ focused: null, panes: [], agents: [] }), null);
    assert.equal(
      selectedAgent({
        focused: { pane: "gone", tab: "t1", terminal: null, agent: "other" },
        panes: [pane("term", "t1", "tt1")],
        agents: [agent("tt1"), agent("other")],
      }),
      null,
    );
  });
});
