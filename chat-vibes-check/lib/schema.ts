import { z } from "zod";

// Obergrenzen für das, was der Browser an /api/analyze schicken darf.
export const LIMITS = {
  maxSample: 200,
  maxTextLength: 300,
  maxParticipants: 12,
  maxNameLength: 60,
  maxBodyBytes: 256 * 1024,
} as const;

const ParticipantStats = z.object({
  name: z.string().min(1).max(LIMITS.maxNameLength),
  messages: z.number().int().nonnegative(),
  shareOfMessages: z.number().min(0).max(1),
  avgLength: z.number().nonnegative(),
  questions: z.number().int().nonnegative(),
  emojis: z.number().int().nonnegative(),
  media: z.number().int().nonnegative(),
  conversationStarts: z.number().int().nonnegative(),
  doubleTexts: z.number().int().nonnegative(),
  medianReplyMinutes: z.number().nonnegative().nullable(),
});

export const AnalyzeRequest = z.object({
  totals: z.object({
    messages: z.number().int().nonnegative(),
    firstDate: z.string().max(40),
    lastDate: z.string().max(40),
    activeDays: z.number().int().nonnegative(),
    busiestHour: z.number().int().min(0).max(23).nullable(),
  }),
  participants: z.array(ParticipantStats).min(1).max(LIMITS.maxParticipants),
  sample: z
    .array(
      z.object({
        from: z.string().min(1).max(LIMITS.maxNameLength),
        at: z.string().max(40),
        text: z.string().min(1).max(LIMITS.maxTextLength + 1),
      }),
    )
    .min(1)
    .max(LIMITS.maxSample),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;
export type ParticipantStats = z.infer<typeof ParticipantStats>;

// Strukturierte Antwort von Claude (über zodOutputFormat erzwungen).
export const VibeResult = z.object({
  vibeScore: z
    .number()
    .int()
    .describe("Spielerischer Vibe-Score von 0 (eisig) bis 100 (beste Chemie)."),
  scoreLabel: z.string().describe("Zwei bis vier Wörter, die den Score einordnen."),
  headline: z.string().describe("Pointierte Überschrift, maximal 70 Zeichen."),
  summary: z.string().describe("Zwei bis drei Sätze Gesamteindruck."),
  observations: z
    .array(
      z.object({
        emoji: z.string().describe("Genau ein passendes Emoji."),
        title: z.string().describe("Kurzer Titel, maximal 40 Zeichen."),
        detail: z.string().describe("Ein bis zwei Sätze, konkret und mit Bezug auf Stats oder Beispiele."),
      }),
    )
    .describe("Vier bis sechs konkrete Beobachtungen."),
  balance: z.string().describe("Ein Satz zur Balance im Hin-und-Her."),
  punchline: z.string().describe("Pointierte Schlusszeile, maximal 120 Zeichen."),
});

export type VibeResult = z.infer<typeof VibeResult>;
