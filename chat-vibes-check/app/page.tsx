import { persona } from "@/persona.config.ts";
import VibeCheck from "./vibe-check.tsx";

export default function Home() {
  return (
    <main>
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        {persona.appName}
      </div>

      <header className="hero">
        <h1>Hi, ich bin {persona.name}.</h1>
        <p className="tagline">{persona.tagline}</p>
        <p className="intro">{persona.intro}</p>
      </header>

      <VibeCheck personaName={persona.name} />

      <footer>
        Nur zur Unterhaltung. Keine Beratung, keine Diagnose. Dein Chat wird nicht gespeichert.
      </footer>
    </main>
  );
}
