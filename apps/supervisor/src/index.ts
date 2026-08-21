// L'entrypoint: legge gli argomenti, legge il file, monta il servizio, lo avvia e resta in ascolto
// dei segnali. È l'unico file che conosce `process`, ed è l'unico che ha il diritto di terminare.
// Una configurazione sbagliata ferma qui: meglio un servizio che non parte, e dice quale riga
// riscrivere, di uno che parte e sorveglia un lab che non è quello descritto.
// L'health-check del processo (PM2, Docker) non è affare di questo file né del modello: è
// infrastruttura, e lo è per scelta (FATTO-17).

import { readFileSync } from "node:fs";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as Args from "./Args";
import * as Config from "./config/Config";
import * as Logger from "./Logger";
import * as Supervisor from "./Supervisor";

const fail = (logger: Logger.Logger, message: string): never => {
  logger.error(message);
  return process.exit(1);
};

const main = async (): Promise<void> => {
  const startup = Logger.make("info");

  const args = pipe(
    Args.parse(process.argv),
    E.getOrElseW((message) => fail(startup, message)),
  );

  const text = pipe(
    E.tryCatch(
      () => readFileSync(args.configPath, "utf-8"),
      (error) => `configurazione illeggibile (${args.configPath}): ${String(error)}`,
    ),
    E.getOrElseW((message) => fail(startup, message)),
  );

  const config = pipe(
    Config.parse(text),
    E.getOrElseW((error) => fail(startup, Config.describe(error))),
  );

  const logger = Logger.make(config.log.level);
  logger.info(`configurazione letta da ${args.configPath}`);

  const created = await Supervisor.create(config, logger)();
  if (E.isLeft(created)) return void fail(logger, created.left.detail);

  const service = created.right;
  service.start();

  // Uscita ordinata: si fermano i ticker, così un giro in corso non viene tagliato a metà e il
  // prossimo non parte mai.
  const shutdown = (signal: string) => () => {
    logger.info(`ricevuto ${signal}: arresto`);
    service.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));
};

await main();
