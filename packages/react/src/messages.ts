/**
 * The messages the Dossier reader runtime posts to an embedding page when it
 * runs inside a frame. This is the contract DossierFrame listens for.
 */

/** The reader's decisions: the path, picked item ids in item order, notes by id, and the reply line. */
export interface ReaderDecisions {
  path: string;
  picked: string[];
  notes: Record<string, string>;
  reply: string;
}

export type ReaderMessage =
  | { type: "dossier:height"; slug: string; height: number }
  | { type: "dossier:decisions"; slug: string; decisions: ReaderDecisions };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const notes: Record<string, string> = {};
    for (const [id, note] of Object.entries(d.notes)) {
      if (typeof note !== "string") return null;
      notes[id] = note;
    }
    return { type: "dossier:decisions", slug: data.slug, decisions: { path: d.path, picked: [...d.picked], notes, reply: d.reply } };
  }
  return null;
}
