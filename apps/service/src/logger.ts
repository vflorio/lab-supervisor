import type * as Config from "@supervisor/core/config";
import * as Logger from "@supervisor/core/logger/logger";
import pino from "pino";

const PINO_METHOD_LEVELS = ["debug", "info", "warn", "error"] as const;
type PinoMethodLevel = (typeof PINO_METHOD_LEVELS)[number];

const isPinoMethodLevel = (level: Logger.LogLevel): level is PinoMethodLevel =>
  (PINO_METHOD_LEVELS as readonly string[]).includes(level);

const pinoTransport = (config: Config.Log): Logger.Transport => {
  const targets: pino.TransportTargetOptions[] = [];

  if (config.path) {
    targets.push({ target: "pino/file", options: { destination: config.path, mkdir: true }, level: "trace" });
  }

  const logger = pino({ level: "trace" }, config.path ? pino.transport({ targets }) : pino.destination(1));

  return (record) => {
    if (!isPinoMethodLevel(record.level)) return;
    logger[record.level](record.tag ? { tag: record.tag, depth: record.depth } : {}, record.message);
  };
};

export const create = (config: Config.Log, extraTransports: readonly Logger.Transport[] = []): Logger.Tagged => {
  const transports: Logger.Transport[] = [Logger.consoleTransport, ...extraTransports];

  if (config.path) {
    transports.push(pinoTransport(config));
  }

  return Logger.create(config.level as Logger.LogLevel, transports, config.network);
};
