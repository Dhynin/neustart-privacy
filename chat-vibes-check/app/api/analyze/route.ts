import Anthropic from "@anthropic-ai/sdk";
import { analyzeChat, EmptyResultError, RefusedError } from "@/lib/analyze.ts";
import { allowRequest } from "@/lib/rate-limit.ts";
import { AnalyzeRequest, LIMITS } from "@/lib/schema.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Strukturierte Antworten können etwas dauern.
export const maxDuration = 120;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function clientIp(req: Request): string {
  // Hinter Cloudflare steht die echte Client-IP in CF-Connecting-IP.
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!allowRequest(clientIp(req))) {
    return error(429, "Kurze Pause bitte – zu viele Analysen in kurzer Zeit. Versuch es in ein paar Minuten nochmal.");
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > LIMITS.maxBodyBytes) {
    return error(413, "Die Anfrage ist zu groß.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Ungültige Anfrage.");
  }

  const parsed = AnalyzeRequest.safeParse(body);
  if (!parsed.success) {
    return error(400, "Die Chat-Daten haben nicht das erwartete Format.");
  }

  try {
    const result = await analyzeChat(parsed.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Bewusst keine Chat-Inhalte loggen, nur Fehlerart und Status.
    if (err instanceof RefusedError) {
      return error(422, "Zu diesem Chat möchte ich lieber nichts sagen. Probier einen anderen.");
    }
    if (err instanceof EmptyResultError) {
      console.error("analyze: empty result", err.message);
      return error(502, "Die Analyse kam unvollständig zurück. Bitte nochmal versuchen.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      console.error("analyze: connection error");
      return error(503, "Die KI ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      console.error("analyze: upstream rate limit");
      return error(503, "Gerade ist viel los. Bitte in einer Minute nochmal versuchen.");
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("analyze: credentials rejected", err.status);
      return error(500, "Der Server ist nicht richtig konfiguriert.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("analyze: api error", err.status);
      return error(502, "Die Analyse hat nicht geklappt. Bitte nochmal versuchen.");
    }
    if (err instanceof Error && err.message.includes("Could not resolve authentication method")) {
      console.error("analyze: no Anthropic credentials configured (ANTHROPIC_API_KEY missing)");
      return error(500, "Der Server ist nicht richtig konfiguriert.");
    }
    console.error("analyze: unexpected error", err instanceof Error ? err.name : typeof err);
    return error(500, "Unerwarteter Fehler.");
  }
}
