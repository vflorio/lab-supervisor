// Il logger del servizio: livelli, un tag per sottosistema, e nient'altro. Non è una dipendenza
// nuova (NO-17) e non deve diventarlo: quello che serve a un supervisore che gira in un terminale o
// sotto PM2 è una riga per fatto, con l'ora davanti.
// Il modello non logga: emette eventi. Qui si decide come si leggono, ed è per questo che il logger
// non attraversa nessuna porta.

export type Level = "error" | "warn" | "info" | "debug";

const rank: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  readonly error: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly info: (message: string) => void;
  readonly debug: (message: string) => void;
  readonly child: (tag: string) => Logger;
}

export type Sink = (line: string) => void;

export const make = (level: Level, tag = "Supervisor", sink: Sink = console.log): Logger => {
  const write = (at: Level, message: string) => {
    if (rank[at] > rank[level]) return;
    sink(`${new Date().toISOString()} ${at.toUpperCase().padEnd(5)} [${tag}] ${message}`);
  };

  return {
    error: (message) => write("error", message),
    warn: (message) => write("warn", message),
    info: (message) => write("info", message),
    debug: (message) => write("debug", message),
    child: (name) => make(level, `${tag}:${name}`, sink),
  };
};

// Un logger che non scrive. Serve ai test, che verificano il comportamento del servizio e non le
// sue righe di log.
export const silent: Logger = make("error", "", () => {});
