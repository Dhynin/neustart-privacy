import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPayload, buildSample, computeStats, scrubPII } from "./prepare.ts";
import { AnalyzeRequest, LIMITS } from "./schema.ts";
import { parseWhatsAppExport } from "./whatsapp.ts";

test("parst Android-Zeilen im US-Format mit AM/PM", () => {
  const msgs = parseWhatsAppExport("6/5/23, 9:15 PM - Lena: Hallo\n6/5/23, 9:16 PM - Max: Hi");
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].sender, "Lena");
  assert.equal(msgs[0].date.getHours(), 21);
  assert.equal(msgs[0].date.getMonth(), 5);
  assert.equal(msgs[0].date.getDate(), 5);
});

test("parst iOS-Zeilen mit Sekunden, schmalem Leerzeichen und Steuerzeichen", () => {
  const msgs = parseWhatsAppExport(readFileSync(new URL("../fixtures/beispiel-chat-ios-en.txt", import.meta.url), "utf8"));
  assert.equal(msgs.length, 5);
  assert.equal(msgs[1].text, "Hey! Did you get home ok?");
  assert.equal(msgs[2].text, "Yes, thanks 😊\nsecond line");
  assert.equal(msgs[4].date.getHours(), 0);
});

test("deutsches Format: Tag.Monat und 24h", () => {
  const [m] = parseWhatsAppExport("05.06.23, 21:15 - Lena: Hallo");
  assert.equal(m.date.getDate(), 5);
  assert.equal(m.date.getMonth(), 5);
  assert.equal(m.date.getHours(), 21);
});

test("Zeilen ohne Sender sind System-Events, Folgezeilen hängen an", () => {
  const msgs = parseWhatsAppExport("05.06.23, 21:15 - Verschlüsselt.\n05.06.23, 21:16 - Max: eins\nzwei");
  assert.equal(msgs[0].sender, null);
  assert.equal(msgs[1].text, "eins\nzwei");
});

test("scrubPII entfernt Mail, Telefon und Links, lässt Uhrzeiten und Daten stehen", () => {
  const out = scrubPII("Mail a.b@example.org, Tel +49 171 2345678, https://x.de/y um 21:15 am 05.06.2023");
  assert.ok(!out.includes("example.org"));
  assert.ok(!out.includes("2345678"));
  assert.ok(!out.includes("x.de"));
  assert.ok(out.includes("21:15"));
  assert.ok(out.includes("05.06.2023"));
});

test("Stichprobe ist begrenzt, gekürzt, chronologisch und ohne Medien", () => {
  const raw = readFileSync(new URL("../fixtures/beispiel-chat-android-de.txt", import.meta.url), "utf8");
  const msgs = parseWhatsAppExport(raw);
  const sample = buildSample(msgs, LIMITS.maxSample, () => 0.42);
  assert.equal(sample.length, LIMITS.maxSample);
  assert.ok(sample.every((m) => m.text.length <= LIMITS.maxTextLength));
  assert.ok(sample.every((m) => !m.text.includes("Medien ausgeschlossen")));
  assert.ok(sample.every((m) => !m.text.includes("2345678") && !m.text.includes("example.com")));
  const times = sample.map((m) => m.at);
  assert.deepEqual(times, [...times].sort());
});

test("Payload besteht die Server-Validierung und enthält keine Rohdatei", () => {
  const raw = readFileSync(new URL("../fixtures/beispiel-chat-android-de.txt", import.meta.url), "utf8");
  const payload = buildPayload(parseWhatsAppExport(raw));
  assert.ok(AnalyzeRequest.safeParse(payload).success);
  assert.ok(JSON.stringify(payload).length < raw.length);
  assert.ok(JSON.stringify(payload).length < LIMITS.maxBodyBytes);
});

test("Stats zählen Teilnehmende, Medien und Gesprächsstarts", () => {
  const raw = readFileSync(new URL("../fixtures/beispiel-chat-android-de.txt", import.meta.url), "utf8");
  const { totals, participants } = computeStats(parseWhatsAppExport(raw));
  assert.equal(totals.messages, 420);
  assert.deepEqual(participants.map((p) => p.name).sort(), ["Lena", "Max"]);
  assert.ok(participants.some((p) => p.media > 0));
  assert.ok(participants.every((p) => p.conversationStarts >= 0));
});
