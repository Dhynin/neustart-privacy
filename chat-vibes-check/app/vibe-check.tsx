"use client";

import { useCallback, useRef, useState } from "react";
import { buildPayload } from "@/lib/prepare.ts";
import type { AnalyzeRequest, VibeResult } from "@/lib/schema.ts";
import { parseWhatsAppExport } from "@/lib/whatsapp.ts";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

type State =
  | { step: "idle" }
  | { step: "ready"; fileName: string; payload: AnalyzeRequest }
  | { step: "loading"; fileName: string; payload: AnalyzeRequest }
  | { step: "done"; result: VibeResult }
  | { step: "error"; message: string };

function formatMinutes(min: number | null): string {
  if (min === null) return "–";
  if (min < 1) return "< 1 Min.";
  if (min < 60) return `${Math.round(min)} Min.`;
  return `${(min / 60).toFixed(1).replace(".", ",")} Std.`;
}

export default function VibeCheck({ personaName }: { personaName: string }) {
  const [state, setState] = useState<State>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
      setState({ step: "error", message: "Bitte eine .txt-Datei hochladen. Bei iPhone-Exporten erst die ZIP entpacken und die _chat.txt nehmen." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setState({ step: "error", message: "Die Datei ist zu groß (max. 30 MB)." });
      return;
    }

    // Die Datei wird nur hier im Browser gelesen, nie hochgeladen.
    const text = await file.text();
    const messages = parseWhatsAppExport(text);
    const payload = buildPayload(messages);

    if (payload.participants.length === 0 || payload.sample.length < 5) {
      setState({
        step: "error",
        message: "Ich konnte in der Datei keinen WhatsApp-Chat erkennen. Exportiere den Chat bitte „ohne Medien“ und lade die .txt hoch.",
      });
      return;
    }
    setState({ step: "ready", fileName: file.name, payload });
  }, []);

  const analyze = useCallback(async () => {
    if (state.step !== "ready") return;
    setState({ ...state, step: "loading" });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setState({ step: "error", message: data?.error ?? "Da ist etwas schiefgelaufen. Bitte nochmal versuchen." });
        return;
      }
      setState({ step: "done", result: data as VibeResult });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setState({ step: "error", message: "Keine Verbindung zum Server. Bist du online?" });
    }
  }, [state]);

  const reset = () => {
    setState({ step: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  if (state.step === "done") return <Result result={state.result} personaName={personaName} onReset={reset} />;

  if (state.step === "loading") {
    return (
      <section className="card stack center" aria-live="polite" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        <p>
          <strong>{personaName} liest gerade mit …</strong>
        </p>
        <p className="muted small">Das dauert meist 10–40 Sekunden.</p>
      </section>
    );
  }

  if (state.step === "ready") {
    const { payload, fileName } = state;
    return (
      <section className="card stack" aria-live="polite">
        <h2>Chat erkannt ✅</h2>
        <p className="muted small">{fileName}</p>
        <div className="chips">
          <span className="chip">{payload.totals.messages.toLocaleString("de-DE")} Nachrichten</span>
          <span className="chip">{payload.totals.activeDays} aktive Tage</span>
          <span className="chip">{payload.participants.length} Personen</span>
        </div>
        <ul className="observations">
          {payload.participants.slice(0, 4).map((p) => (
            <li key={p.name} className="observation">
              <span className="emoji" aria-hidden="true">💬</span>
              <div>
                <strong>{p.name}</strong>
                <p className="muted small">
                  {Math.round(p.shareOfMessages * 100)} % der Nachrichten · antwortet im Schnitt nach{" "}
                  {formatMinutes(p.medianReplyMinutes)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <details>
          <summary>Was wird gesendet?</summary>
          <p className="muted small">
            Nicht deine Datei. Nur diese Statistiken und eine Stichprobe von {payload.sample.length} gekürzten Nachrichten
            (max. 300 Zeichen), in denen E-Mail-Adressen, Telefonnummern und Links bereits entfernt sind. Nichts wird
            gespeichert.
          </p>
        </details>
        <div className="button-row">
          <button className="button" type="button" onClick={analyze}>
            Vibe-Check starten
          </button>
          <button className="button secondary" type="button" onClick={reset}>
            Andere Datei
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      {state.step === "error" && (
        <div className="card error" role="alert">
          {state.message}
        </div>
      )}

      <label
        className={`dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <span className="icon" aria-hidden="true">📄</span>
        <strong>WhatsApp-Chat auswählen</strong>
        <span className="muted small">.txt-Export · wird nur auf deinem Gerät gelesen</span>
      </label>

      <section className="card stack">
        <h2>So geht&apos;s</h2>
        <ol className="steps">
          <li>
            <span className="num">1</span>
            <span>Chat in WhatsApp öffnen → Menü → „Chat exportieren“ → „Ohne Medien“.</span>
          </li>
          <li>
            <span className="num">2</span>
            <span>Die .txt-Datei hier auswählen. Sie bleibt auf deinem Gerät.</span>
          </li>
          <li>
            <span className="num">3</span>
            <span>{personaName} bekommt nur Statistiken und eine kleine, anonymisierte Stichprobe.</span>
          </li>
        </ol>
        <details>
          <summary>Wo finde ich den Export?</summary>
          <ul className="muted small">
            <li>Android: Chat öffnen → ⋮ → Mehr → Chat exportieren → Ohne Medien.</li>
            <li>iPhone: Chat öffnen → Name antippen → Chat exportieren → Ohne Medien. Die ZIP in „Dateien“ entpacken und die _chat.txt wählen.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}

function Result({ result, personaName, onReset }: { result: VibeResult; personaName: string; onReset: () => void }) {
  return (
    <section className="stack" aria-live="polite">
      <div className="card stack">
        <div className="score">
          <div
            className="ring"
            style={{ ["--value" as string]: result.vibeScore }}
            role="img"
            aria-label={`Vibe-Score ${result.vibeScore} von 100`}
          >
            <span>{result.vibeScore}</span>
          </div>
          <div>
            <p className="muted small">Vibe-Score</p>
            <p className="score-label">{result.scoreLabel}</p>
          </div>
        </div>
        <h2>{result.headline}</h2>
        <p>{result.summary}</p>
      </div>

      <ul className="observations">
        {result.observations.map((o, i) => (
          <li key={i} className="card observation">
            <span className="emoji" aria-hidden="true">{o.emoji}</span>
            <div>
              <h3>{o.title}</h3>
              <p className="muted">{o.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="card stack">
        <p>
          <strong>Balance:</strong> {result.balance}
        </p>
        <p className="punchline">{result.punchline}</p>
        <p className="muted small">— {personaName}</p>
      </div>

      <button className="button secondary" type="button" onClick={onReset}>
        Noch einen Chat checken
      </button>
    </section>
  );
}
