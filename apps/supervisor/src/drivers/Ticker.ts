// L'adapter driving del servizio: un intervallo, e nient'altro. Il modello ha un `Clock` (che ora
// è) e il servizio ha un ticker (ogni quanto si guarda): tenerli separati è ciò che fa scorrere sei
// ore simulate in millisecondi dentro un test (M-9).
// Due proprietà che non sono dettagli. Non si accavalla: se un giro dura più dell'intervallo, il
// successivo non parte — un adapter appeso (FATTO-12) accumulerebbe giri e il servizio finirebbe a
// parlare con l'hardware in parallelo con se stesso. E non muore: un'eccezione di un giro si logga
// e il ticker continua, perché un supervisore che si spegne al primo errore è peggio di nessun
// supervisore.

import * as Duration from "@lab/kernel/Duration";

export interface Ticker {
  readonly start: () => void;
  readonly stop: () => void;
  // Un giro, aspettandolo: è così che i test guidano il servizio senza aspettare l'orologio vero.
  readonly runOnce: () => Promise<void>;
}

export type Options = {
  readonly interval: Duration.Duration;
  readonly task: () => Promise<void>;
  readonly onError: (error: unknown) => void;
  // Il primo giro subito, invece che dopo un intervallo: la prima osservazione del lab non deve
  // aspettare, e la prima è quella che dice se il servizio è montato bene.
  readonly immediate?: boolean;
};

export const make = (options: Options): Ticker => {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const runOnce = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await options.task();
    } catch (error) {
      options.onError(error);
    } finally {
      running = false;
    }
  };

  return {
    runOnce,
    start: () => {
      if (timer !== undefined) return;
      timer = setInterval(() => void runOnce(), Duration.toMillis(options.interval));
      if (options.immediate === true) void runOnce();
    },
    stop: () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
};
