import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { DossierModel, DossierResult, Problem } from "./model.js";

export interface RenderOptions {
  /**
   * The dossier binary. Default: the DOSSIER_BIN environment variable, then
   * the binary from the @kylebegeman/dossier package, then dossier on PATH.
   */
  bin?: string;
  /** Directory that relative figure paths resolve against. */
  base?: string;
  /** Milliseconds before the render is abandoned. Default 30000. */
  timeout?: number;
  signal?: AbortSignal;
}

export interface RenderResult {
  /** The self-contained artifact. */
  html: string;
  slug: string;
  /** Advice that did not block the render, such as conciseness limits. */
  warnings: Problem[];
}

/** A render that did not produce HTML: findings in the model, or an error. */
export class DossierRenderError extends Error {
  readonly outcome: "findings" | "error";
  readonly code: string;
  readonly findings: Problem[];

  constructor(outcome: "findings" | "error", code: string, message: string, findings: Problem[] = []) {
    super(findings.length ? `${message}\n${findings.map((f) => `  ${f.path}: ${f.message}`).join("\n")}` : message);
    this.name = "DossierRenderError";
    this.outcome = outcome;
    this.code = code;
    this.findings = findings;
  }
}

const MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * Renders a model to its self-contained HTML with the dossier binary, on the
 * server. The model goes through the same checks as dossier build.
 */
export async function renderDossier(model: DossierModel | string, options: RenderOptions = {}): Promise<RenderResult> {
  const input = typeof model === "string" ? model : JSON.stringify(model);
  const args = ["render", "-", "--json"];
  if (options.base) args.push("--base", options.base);
  const { stdout, stderr, code } = await run(resolveBinary(options.bin), args, input, options);
  let envelope: DossierResult;
  try {
    envelope = JSON.parse(stdout) as DossierResult;
  } catch {
    throw new DossierRenderError("error", "exec", `dossier render exited ${code} without an envelope: ${(stderr || stdout).trim().slice(0, 500)}`);
  }
  if (envelope.outcome === "ok") {
    const result = envelope.result as { html?: unknown; slug?: unknown } | undefined;
    if (typeof result?.html !== "string" || typeof result.slug !== "string") {
      throw new DossierRenderError("error", "envelope", "dossier render answered without HTML");
    }
    return { html: result.html, slug: result.slug, warnings: envelope.warnings ?? [] };
  }
  throw new DossierRenderError(
    envelope.outcome,
    envelope.error?.code ?? envelope.outcome,
    envelope.error?.message ?? "dossier render failed",
    envelope.findings ?? [],
  );
}

/** Resolves the dossier binary the way renderDossier does. */
export function resolveBinary(bin?: string): string {
  if (bin) return bin;
  const fromEnv = process.env.DOSSIER_BIN;
  if (fromEnv) return fromEnv;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@kylebegeman/dossier") as { binaryPath?: () => string };
    if (typeof pkg.binaryPath === "function") return pkg.binaryPath();
  } catch {
    // Not installed: fall back to PATH.
  }
  return "dossier";
}

function run(bin: string, args: string[], input: string, options: RenderOptions): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const fail = (e: DossierRenderError): void => {
      child.kill();
      finish(() => reject(e));
    };
    const timer = setTimeout(() => fail(new DossierRenderError("error", "timeout", `dossier render took longer than ${options.timeout ?? 30000} ms`)), options.timeout ?? 30000);
    const onAbort = (): void => fail(new DossierRenderError("error", "aborted", "dossier render was aborted"));
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort);
    child.on("error", (e: NodeJS.ErrnoException) => {
      const message = e.code === "ENOENT" ? `no dossier binary at ${bin}; install @kylebegeman/dossier or set DOSSIER_BIN` : e.message;
      finish(() => reject(new DossierRenderError("error", e.code === "ENOENT" ? "binary" : "exec", message)));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) fail(new DossierRenderError("error", "output", "dossier render output exceeds 64 MB"));
      else out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("close", (code) => finish(() => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code })));
    child.stdin.on("error", () => {
      // The child exited before reading everything; close reports why.
    });
    child.stdin.end(input);
  });
}
