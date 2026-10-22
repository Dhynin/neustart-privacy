// Liest einen WhatsApp-Export im Browser: entweder die .txt direkt oder die ZIP,
// die WhatsApp beim Teilen erzeugt. Die ZIP wird gestreamt, nur Text-Einträge
// werden entpackt; Fotos, Videos und Sprachnachrichten werden übersprungen.

import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from "fflate";

/** Obergrenze für die hochgeladene Datei (ZIPs mit Medien können groß sein). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** Obergrenze für den entpackten Chat-Text (Schutz vor ZIP-Bomben). */
export const MAX_CHAT_TEXT_BYTES = 60 * 1024 * 1024;

export class ChatFileError extends Error {}

export interface ChatFile {
  text: string;
  /** Name der gelesenen Datei bzw. des Eintrags in der ZIP. */
  source: string;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Je höher, desto wahrscheinlicher ist der ZIP-Eintrag der Chat. */
function chatScore(path: string): number {
  if (path.startsWith("__MACOSX/") || baseName(path).startsWith(".")) return -1;
  if (!/\.txt$/i.test(path)) return -1;
  const name = baseName(path).toLowerCase();
  if (name === "_chat.txt") return 3;
  if (name.includes("whatsapp") || name.includes("chat")) return 2;
  return 1;
}

async function isZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

async function readZip(file: Blob): Promise<ChatFile> {
  const found: { path: string; score: number; chunks: Uint8Array[]; bytes: number }[] = [];
  let failure: Error | null = null;
  let totalTextBytes = 0;

  const unzip = new Unzip((entry: UnzipFile) => {
    const score = chatScore(entry.name);
    if (score < 0) return; // nicht start() → Eintrag wird nicht entpackt
    if (entry.originalSize !== undefined && entry.originalSize > MAX_CHAT_TEXT_BYTES) {
      failure = new ChatFileError("Der Chat in der ZIP ist zu groß.");
      return;
    }
    const item = { path: entry.name, score, chunks: [] as Uint8Array[], bytes: 0 };
    found.push(item);
    entry.ondata = (err, data) => {
      if (err) {
        failure = new ChatFileError("Die ZIP-Datei ist beschädigt.");
        return;
      }
      item.bytes += data.length;
      totalTextBytes += data.length;
      if (item.bytes > MAX_CHAT_TEXT_BYTES || totalTextBytes > MAX_CHAT_TEXT_BYTES) {
        failure = new ChatFileError("Der Chat in der ZIP ist zu groß.");
        entry.terminate();
        return;
      }
      item.chunks.push(data);
    };
    try {
      entry.start();
    } catch {
      failure = new ChatFileError("Diese ZIP-Kompression wird nicht unterstützt.");
    }
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        unzip.push(new Uint8Array(0), true);
        break;
      }
      unzip.push(value);
      if (failure) break;
    }
  } catch {
    throw new ChatFileError("Die ZIP-Datei konnte nicht gelesen werden.");
  } finally {
    reader.releaseLock();
  }
  if (failure) throw failure;

  const best = found.filter((f) => f.bytes > 0).sort((a, b) => b.score - a.score)[0];
  if (!best) {
    throw new ChatFileError("In der ZIP habe ich keinen Chat gefunden. Sie sollte eine .txt-Datei enthalten.");
  }
  const decoder = new TextDecoder("utf-8");
  const text = best.chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
  return { text, source: baseName(best.path) };
}

export async function readChatFile(file: File): Promise<ChatFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ChatFileError("Die Datei ist zu groß (max. 2 GB).");

  if (await isZip(file)) return readZip(file);

  if (/\.zip$/i.test(file.name)) throw new ChatFileError("Die ZIP-Datei ist beschädigt.");
  if (!/\.txt$/i.test(file.name) && !file.type.startsWith("text/")) {
    throw new ChatFileError("Bitte die ZIP oder .txt aus „Chat exportieren“ hochladen.");
  }
  if (file.size > MAX_CHAT_TEXT_BYTES) throw new ChatFileError("Die Textdatei ist zu groß.");
  return { text: await file.text(), source: file.name };
}
