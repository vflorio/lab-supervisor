import * as E from "fp-ts/Either";

export type ConfigSource = { type: "file"; path: string } | { type: "url"; url: string };

export const parse = (argv: string[]): E.Either<string, { config: ConfigSource }> => {
  const args = argv.slice(2);

  let configFile: string | undefined;
  let configUrl: string | undefined;

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--config" && args[index + 1]) {
      configFile = args[++index];
    } else if (args[index] === "--config-url" && args[index + 1]) {
      configUrl = args[++index];
    }
  }

  if (configUrl) return E.right({ config: { type: "url", url: configUrl } });
  if (configFile) return E.right({ config: { type: "file", path: configFile } });

  return E.left("Usage: service --config <path> | --config-url <url>");
};
