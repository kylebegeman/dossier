"use strict";

const path = require("node:path");

/** npm packages holding the prebuilt binary, by process.platform and process.arch. */
const platforms = Object.freeze({
  "darwin-arm64": "@kylebegeman/dossier-darwin-arm64",
  "darwin-x64": "@kylebegeman/dossier-darwin-x64",
  "linux-arm64": "@kylebegeman/dossier-linux-arm64",
  "linux-x64": "@kylebegeman/dossier-linux-x64",
  "win32-arm64": "@kylebegeman/dossier-win32-arm64",
  "win32-x64": "@kylebegeman/dossier-win32-x64",
});

/**
 * The absolute path of the dossier binary: DOSSIER_BIN when set, otherwise the
 * binary from this platform's package. Throws with a remedy when neither exists.
 */
function binaryPath() {
  if (process.env.DOSSIER_BIN) return path.resolve(process.env.DOSSIER_BIN);
  const key = process.platform + "-" + process.arch;
  const pkg = platforms[key];
  if (!pkg) {
    throw new Error("no prebuilt dossier binary for " + key + "; build it from source with Go (see https://github.com/kylebegeman/dossier) and set DOSSIER_BIN");
  }
  const exe = process.platform === "win32" ? "dossier.exe" : "dossier";
  try {
    return require.resolve(pkg + "/bin/" + exe);
  } catch {
    throw new Error(pkg + " is not installed; reinstall @kylebegeman/dossier without --omit=optional or --no-optional");
  }
}

module.exports = { binaryPath, platforms };
