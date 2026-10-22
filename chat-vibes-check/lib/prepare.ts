// Läuft im Browser: aus dem geparsten Chat werden Stats und eine kleine,
// redigierte Stichprobe. Nur dieses Objekt verlässt das Gerät.

import { LIMITS, type AnalyzeRequest, type ParticipantStats } from "./schema.ts";
import { isDeletedMessage, isMediaPlaceholder, type ChatMessage } from "./whatsapp.ts";

/** Pause, nach der eine Nachricht als neuer Gesprächsbeginn zählt. */
const NEW_CONVERSATION_MS = 6 * 60 * 60 * 1000;
/** Antworten nach mehr als einem Tag zählen nicht zur Antwortzeit. */
const MAX_REPLY_MS = 24 * 60 * 60 * 1000;

const EMOJI = /\p{Extended_Pictographic}/gu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
// Ziffernfolgen mit typischen Trennzeichen; ab 7 Ziffern gilt es als Telefonnummer.
const PHONE_CANDIDATE = /\+?\(?\d[\d\s()./-]{5,}\d/g;
const DATE_LIKE = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;

/** Entfernt E-Mail-Adressen, Telefonnummern und Links. */
export function scrubPII(text: string): string {
  return text
    .replace(EMAIL, "[E-Mail]")
    .replace(URL_PATTERN, "[Link]")
    .replace(PHONE_CANDIDATE, (m) =>
      m.replace(/\D/g, "").length >= 7 && !DATE_LIKE.test(m.trim()) ? "[Telefon]" : m,
    );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function computeStats(messages: ChatMessage[]): Pick<AnalyzeRequest, "totals" | "participants"> {
  const userMessages = messages.filter((m) => m.sender !== null);
  const bySender = new Map<
    string,
    { messages: number; chars: number; textMessages: number; questions: number; emojis: number; media: number; starts: number; doubles: number; replies: number[] }
  >();

  const hours = new Array<number>(24).fill(0);
  const days = new Set<string>();

  let prev: ChatMessage | undefined;
  for (const m of userMessages) {
    const sender = m.sender!;
    let s = bySender.get(sender);
    if (!s) {
      s = { messages: 0, chars: 0, textMessages: 0, questions: 0, emojis: 0, media: 0, starts: 0, doubles: 0, replies: [] };
      bySender.set(sender, s);
    }
    s.messages++;
    hours[m.date.getHours()]++;
    days.add(m.date.toDateString());

    if (isMediaPlaceholder(m.text)) {
      s.media++;
    } else if (!isDeletedMessage(m.text)) {
      s.textMessages++;
      s.chars += m.text.length;
      if (m.text.includes("?")) s.questions++;
      s.emojis += m.text.match(EMOJI)?.length ?? 0;
    }

    const gap = prev ? m.date.getTime() - prev.date.getTime() : Infinity;
    if (gap > NEW_CONVERSATION_MS) s.starts++;
    else if (prev && prev.sender === sender) s.doubles++;
    else if (prev && gap >= 0 && gap <= MAX_REPLY_MS) s.replies.push(gap / 60000);

    prev = m;
  }

  const total = userMessages.length;
  const participants: ParticipantStats[] = [...bySender.entries()]
    .sort((a, b) => b[1].messages - a[1].messages)
    .slice(0, LIMITS.maxParticipants)
    .map(([name, s]) => {
      const reply = median(s.replies);
      return {
        name: truncate(scrubPII(name), LIMITS.maxNameLength),
        messages: s.messages,
        shareOfMessages: total ? round(s.messages / total, 3) : 0,
        avgLength: s.textMessages ? round(s.chars / s.textMessages) : 0,
        questions: s.questions,
        emojis: s.emojis,
        media: s.media,
        conversationStarts: s.starts,
        doubleTexts: s.doubles,
        medianReplyMinutes: reply === null ? null : round(reply),
      };
    });

  const busiest = Math.max(...hours);
  return {
    totals: {
      messages: total,
      firstDate: userMessages[0] ? formatDate(userMessages[0].date) : "",
      lastDate: userMessages.at(-1) ? formatDate(userMessages.at(-1)!.date) : "",
      activeDays: days.size,
      busiestHour: busiest > 0 ? hours.indexOf(busiest) : null,
    },
    participants,
  };
}

/**
 * Stichprobe aus Anfang, Ende und zufälliger Mitte, chronologisch sortiert,
 * gekürzt und redigiert. Medien, gelöschte Nachrichten und System-Events fallen raus.
 */
export function buildSample(
  messages: ChatMessage[],
  max: number = LIMITS.maxSample,
  random: () => number = Math.random,
): AnalyzeRequest["sample"] {
  const usable = messages.filter(
    (m) => m.sender !== null && m.text.trim() !== "" && !isMediaPlaceholder(m.text) && !isDeletedMessage(m.text),
  );

  let picked: ChatMessage[];
  if (usable.length <= max) {
    picked = usable;
  } else {
    const headCount = Math.floor(max * 0.3);
    const tailCount = Math.floor(max * 0.3);
    const midCount = max - headCount - tailCount;
    const middle = usable.slice(headCount, usable.length - tailCount).map((m, i) => ({ m, i }));
    // Fisher-Yates auf der Mitte, danach wieder chronologisch.
    for (let i = middle.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [middle[i], middle[j]] = [middle[j], middle[i]];
    }
    const mid = middle
      .slice(0, midCount)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.m);
    picked = [...usable.slice(0, headCount), ...mid, ...usable.slice(usable.length - tailCount)];
  }

  return picked
    .map((m) => ({
      from: truncate(scrubPII(m.sender!), LIMITS.maxNameLength),
      at: formatDate(m.date),
      text: truncate(scrubPII(m.text.trim()), LIMITS.maxTextLength),
    }))
    .filter((m) => m.text !== "");
}

export function buildPayload(messages: ChatMessage[]): AnalyzeRequest {
  return { ...computeStats(messages), sample: buildSample(messages) };
}
