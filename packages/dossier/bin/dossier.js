#!/usr/bin/env node
"use strict";

// Runs the platform's dossier binary with this process's arguments and
// streams. Signals go to the binary, which shuts down on its own terms; this
// process exits the way the binary did.
const { spawn } = require("node:child_process");
const { binaryPath } = require("../lib/index.js");

let bin;
try {
  bin = binaryPath();
} catch (error) {
  process.stderr.write("dossier: " + error.message + "\n");
  process.exit(1);
}

const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
const forward = (signal) => {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, forward);

child.on("error", (error) => {
  process.stderr.write("dossier: cannot run " + bin + ": " + error.message + "\n");
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code === null ? 1 : code);
});
