import assert from "node:assert";
import { foregroundWorking, termFacts, termStatus } from "./term-status.js";

const facts = (o = {}) => ({ state: "live", exitCode: null, signal: null, working: false, argv: null, ...o });

// working: the foreground process is not the terminal's own shell
assert.equal(foregroundWorking(null, 1, "zsh"), false);
assert.equal(foregroundWorking({ pid: 1, name: "zsh", argv: [] }, 1, "zsh"), false);
assert.equal(foregroundWorking({ pid: 2, name: "docker", argv: ["docker"] }, 1, "zsh"), true);
// Both pids known: equal pids mean the shell, even when the names differ
// (a display name is not the shell's own name); different pids mean working.
assert.equal(foregroundWorking({ pid: 1, name: "bash", argv: [] }, 1, "zsh"), false);
assert.equal(foregroundWorking({ pid: 1, name: "zsh (login)", argv: [] }, 1, "zsh"), false);
assert.equal(foregroundWorking({ pid: 2, name: "zsh", argv: [] }, 1, "zsh"), true);
// One pid missing: the program name decides.
assert.equal(foregroundWorking({ name: "docker", argv: [] }, 1, "zsh"), true);
assert.equal(foregroundWorking({ pid: 2, name: "zsh", argv: [] }, null, "zsh"), false);

// a terminals() entry with foreground wins over the cached hc get
assert.deepEqual(
  termFacts({
    state: "live",
    pid: 10,
    exit_code: null,
    signal: null,
    program: { name: "zsh" },
    foreground: { pid: 10, name: "zsh", argv: ["-zsh"] },
  }),
  { state: "live", exitCode: null, signal: null, working: false, argv: ["-zsh"] },
);
// a terminals() entry with foreground but no exit details borrows them
assert.deepEqual(
  termFacts({ state: "finished", pid: 10, foreground: null }, { state: "finished", exitCode: 3, signal: null, working: false, argv: null }),
  { state: "finished", exitCode: 3, signal: null, working: false, argv: null },
);
// no foreground there: the cached hc get is used as is
const cached = facts({ working: true, argv: ["npm", "run", "dev"] });
assert.equal(termFacts({ state: "live", pid: 10, program: { name: "zsh" } }, cached), cached);
// neither yet: the row still shows, at its prompt
assert.deepEqual(
  termFacts({ state: "live", pid: 10, exit_code: null }, null),
  { state: "live", exitCode: null, signal: null, working: false, argv: null },
);
assert.equal(termFacts(null, null), null);

// terminal states
assert.equal(termStatus(facts(), null), "idle");
assert.equal(termStatus(facts({ working: true }), "idle"), "working");
assert.equal(termStatus(facts(), "working"), "done"); // just back at the prompt
assert.equal(termStatus(facts(), "done"), "done"); // still unseen
assert.equal(termStatus(facts(), "done", true), "idle"); // looking turns it idle
assert.equal(termStatus(facts(), "working", true), "idle"); // finished while looking
assert.equal(termStatus(facts({ state: "finished", exitCode: 0 }), null), "done"); // never seen
assert.equal(termStatus(facts({ state: "finished", exitCode: 0 }), "working"), "done"); // just finished
assert.equal(termStatus(facts({ state: "finished", exitCode: 0 }), "done", true), "idle"); // looking turns it idle
// Once seen (idle), a clean finish stays idle when unfocused again.
assert.equal(termStatus(facts({ state: "finished", exitCode: 0 }), "idle"), "idle");
assert.equal(termStatus(facts({ state: "finished", exitCode: 0 }), "idle", false), "idle");
assert.equal(termStatus(facts({ state: "finished", exitCode: 2 }), null), "blocked");
assert.equal(termStatus(facts({ state: "finished", signal: "SIGTERM" }), null), "blocked");
assert.equal(termStatus(facts({ state: "finished", exitCode: 0, signal: "SIGTERM" }), null), "blocked");
assert.equal(termStatus(null, "working"), null);
assert.equal(termStatus(facts({ state: "parked" }), "blocked"), "idle");

console.log("term-status: ok");
