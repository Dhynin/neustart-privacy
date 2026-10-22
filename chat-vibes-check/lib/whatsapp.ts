// Parser für WhatsApp-Textexporte (Android und iOS, englische und deutsche Datumsformate).
//
// Android: "6/5/23, 9:15 PM - Sender: Nachricht"   /  "05.06.23, 21:15 - Sender: Nachricht"
// iOS:     "[6/5/23, 9:15:03 PM] Sender: Nachricht" /  "[05.06.23, 21:15:03] Sender: Nachricht"

export interface ChatMessage {
  /** Zeitpunkt der Nachricht (lokale Zeit des Exports). */
  date: Date;
  /** Absender; null bei System-Events (z. B. Verschlüsselungshinweis). */
  sender: string | null;
  text: string;
}

const DATE = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp])\.? ?[Mm]\.?)?`;

const IOS_LINE = new RegExp(String.raw`^\[${DATE},? ${TIME}\] (.*)$`);
const ANDROID_LINE = new RegExp(String.raw`^${DATE},? ${TIME} [-–] (.*)$`);

/** Unsichtbare Steuerzeichen, die WhatsApp (vor allem iOS) in Exporte schreibt. */
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

/** Schmales und geschütztes Leerzeichen (vor AM/PM) → normales Leerzeichen. */
export function normalizeLine(line: string): string {
  return line.replace(/[  ]/g, " ").replace(INVISIBLE, "");
}

function toDate(
  a: string,
  b: string,
  y: string,
  hh: string,
  mm: string,
  ss: string | undefined,
  ampm: string | undefined,
  separator: string,
): Date | null {
  let first = Number(a);
  let second = Number(b);
  let year = Number(y);
  if (year < 100) year += 2000;

  // "." ist das deutsche Format (Tag.Monat), "/" meist US (Monat/Tag).
  // Ist eine Zahl > 12, ist die Reihenfolge eindeutig.
  let day: number;
  let month: number;
  if (separator === "." || first > 12) {
    day = first;
    month = second;
  } else if (second > 12) {
    month = first;
    day = second;
  } else {
    month = first;
    day = second;
  }

  let hour = Number(hh);
  if (ampm) {
    const pm = ampm.toLowerCase() === "p";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }

  const date = new Date(year, month - 1, day, hour, Number(mm), Number(ss ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitSender(rest: string): { sender: string | null; text: string } {
  const idx = rest.indexOf(": ");
  if (idx <= 0) return { sender: null, text: rest };
  return { sender: rest.slice(0, idx).trim(), text: rest.slice(idx + 2) };
}

/** Parst den kompletten Export. Zeilen ohne Zeitstempel gehören zur vorherigen Nachricht. */
export function parseWhatsAppExport(raw: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = raw.split(/\r\n|\n|\r/);

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    const match = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);

    if (match) {
      const [, a, b, y, hh, mm, ss, ampm, rest] = match;
      const separator = line.match(/\d{1,2}([./-])\d{1,2}/)?.[1] ?? "/";
      const date = toDate(a, b, y, hh, mm, ss, ampm, separator);
      if (date) {
        messages.push({ date, ...splitSender(rest) });
        continue;
      }
    }

    // Fortsetzung einer mehrzeiligen Nachricht (oder Müll vor der ersten Nachricht).
    const last = messages[messages.length - 1];
    if (last) last.text += "\n" + line;
  }

  return messages;
}

/** Platzhalter, die WhatsApp statt Medien in den Export schreibt. */
const MEDIA_PLACEHOLDER =
  /^(<.*(omitted|ausgeschlossen|weggelassen).*>|.*\b(image|video|audio|sticker|GIF|document|Bild|Audio|Sticker|Dokument) (omitted|weggelassen)\b.*|<attached: .*>|<Anhang: .*>)$/i;

export function isMediaPlaceholder(text: string): boolean {
  return MEDIA_PLACEHOLDER.test(text.trim());
}

export function isDeletedMessage(text: string): boolean {
  return /^(This message was deleted|You deleted this message|Diese Nachricht wurde gelöscht|Du hast diese Nachricht gelöscht)\.?$/i.test(
    text.trim(),
  );
}
