import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { ChatFileError, readChatFile } from "./chat-file.ts";
import { parseWhatsAppExport } from "./whatsapp.ts";

const androidChat = readFileSync(new URL("../fixtures/beispiel-chat-android-de.txt", import.meta.url), "utf8");
const iosChat = readFileSync(new URL("../fixtures/beispiel-chat-ios-en.txt", import.meta.url), "utf8");
const fakeJpeg = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);

function zipFile(name: string, entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]>): File {
  return new File([zipSync(entries)], name, { type: "application/zip" });
}

test("iOS-ZIP: liest _chat.txt, ignoriert Medien und __MACOSX", async () => {
  const file = zipFile("WhatsApp Chat - Lena.zip", {
    "__MACOSX/._chat.txt": strToU8("junk"),
    "00000012-PHOTO-2023-06-05.jpg": [fakeJpeg, { level: 0 }],
    "_chat.txt": strToU8(iosChat),
  });
  const chat = await readChatFile(file);
  assert.equal(chat.source, "_chat.txt");
  assert.equal(chat.text, iosChat);
});

test("Android-ZIP: findet die Chat-Textdatei mit Umlauten im Namen", async () => {
  const file = zipFile("WhatsApp Chat mit Lena.zip", {
    "IMG-20230605-WA0001.jpg": [fakeJpeg, { level: 0 }],
    "WhatsApp Chat mit Lena Müller.txt": strToU8(androidChat),
    "PTT-20230605-WA0002.opus": fakeJpeg,
  });
  const chat = await readChatFile(file);
  assert.equal(chat.source, "WhatsApp Chat mit Lena Müller.txt");
  assert.equal(parseWhatsAppExport(chat.text).filter((m) => m.sender).length, 420);
});

test("ZIP ohne Textdatei gibt eine verständliche Fehlermeldung", async () => {
  const file = zipFile("fotos.zip", { "IMG-1.jpg": fakeJpeg });
  await assert.rejects(readChatFile(file), (e: unknown) => e instanceof ChatFileError && /keinen Chat/.test(e.message));
});

test("Kaputte ZIP wird abgelehnt", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "chat.zip");
  await assert.rejects(readChatFile(file), ChatFileError);
});

test(".txt wird weiterhin direkt gelesen", async () => {
  const chat = await readChatFile(new File([androidChat], "WhatsApp Chat mit Lena.txt", { type: "text/plain" }));
  assert.equal(chat.text, androidChat);
});

test("Andere Dateitypen werden abgelehnt", async () => {
  await assert.rejects(readChatFile(new File([fakeJpeg], "foto.jpg", { type: "image/jpeg" })), ChatFileError);
});
