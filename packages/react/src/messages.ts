/**
 * The messages the Dossier reader runtime posts to an embedding page when it
 * runs inside a frame. This is the contract DossierFrame listens for.
 */

/**
 * The reader's decisions: the chosen option id, picked item ids in item order
 * (pick kinds), verdicts by item id (verdict kinds), notes by item id, and the
 * reply line.
 */
export interface ReaderDecisions {
  path: string;
  picked: string[];
  verdicts: Record<string, string>;
  notes: Record<string, string>;
  reply: string;
}

export type ReaderMessage =
  | { type: "dossier:height"; slug: string; height: number }
  | { type: "dossier:decisions"; slug: string; decisions: ReaderDecisions };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copies a record whose values are all strings, or returns null. */
function stringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== "string") return null;
    out[key] = text;
  }
  return out;
}

/**
 * Validates data posted by the reader runtime. Anything that is not exactly a
 * reader message is null, so a frame never acts on a foreign message.
 */
export function readerMessage(data: unknown): ReaderMessage | null {
  if (!isRecord(data) || typeof data.slug !== "string") return null;
  if (data.type === "dossier:height") {
    const height = data.height;
    if (typeof height !== "number" || !Number.isFinite(height) || height < 0) return null;
    return { type: "dossier:height", slug: data.slug, height: Math.ceil(height) };
  }
  if (data.type === "dossier:decisions" && isRecord(data.decisions)) {
    const d = data.decisions;
    if (typeof d.path !== "string" || typeof d.reply !== "string" || !Array.isArray(d.picked) || !isRecord(d.notes)) return null;
    if (!d.picked.every((id): id is string => typeof id === "string")) return null;
    const notes = stringRecord(d.notes);
    const verdicts = d.verdicts === undefined ? {} : stringRecord(d.verdicts);
    if (!notes || !verdicts) return null;
    return { type: "dossier:decisions", slug: data.slug, decisions: { path: d.path, picked: [...d.picked], verdicts, notes, reply: d.reply } };
  }
  return null;
}
