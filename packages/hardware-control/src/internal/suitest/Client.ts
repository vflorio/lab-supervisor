// Il client Suitest: la Public API v4, e non ne esiste un'altra. Travaso di
// `legacy/core/src/adapters/suitest.ts` e `suitest-paginate.ts`, che sono scritti contro l'API vera;
// qui cambiano solo tre cose: il trasporto è iniettato, il logger sparisce (non è mestiere dell'ACL
// decidere come si logga) e gli errori sono `HttpFailure` invece di un ADT per modulo.
// La sola scrittura hardware disponibile è il reboot di una control unit. Accendere, spegnere e
// riavviare una TV non si può fare da qui (FATTO-10): quel canale sarà lo smart plug, e finché non
// arriva la risposta giusta è `Unsupported` (FATTO-5, NF-3).
// Non conosce né `Facet` né `Remedy`: parla solo suitestese. La traduzione avviene un piano sopra.

import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as t from "io-ts";
import * as Http from "../Http";
import * as Codecs from "./Codecs";

export type SuitestConfig = {
  // Public API v4, autenticazione basic con coppia token.
  readonly baseUrl: string;
  readonly tokenId: string;
  readonly tokenPassword: string;
  // Vale per ogni chiamata. Senza, una richiesta appesa terrebbe fermo un tick intero (INV-10).
  readonly timeoutMs: number;
};

export const defaultBaseUrl = "https://the.suite.st/api/public/v4";

export interface SuitestClient {
  readonly devices: TE.TaskEither<Http.HttpFailure, ReadonlyArray<Codecs.Device>>;
  readonly controlUnits: TE.TaskEither<Http.HttpFailure, ReadonlyArray<Codecs.ControlUnit>>;
  readonly videoCaptureDevices: TE.TaskEither<Http.HttpFailure, ReadonlyArray<Codecs.VideoCaptureDevice>>;
  // L'unica operazione di scrittura dell'intera API. Il campo `reboot` per unità dice se quella
  // singola CU la espone davvero (FATTO-1), e non tutte lo fanno.
  readonly rebootControlUnit: (unitId: string) => TE.TaskEither<Http.HttpFailure, void>;
}

const headers = (config: SuitestConfig): Record<string, string> => Http.basicAuth(config.tokenId, config.tokenPassword);

// Accumula tutte le pagine seguendo `next`, come `legacy/core/src/adapters/suitest-paginate.ts`.
// Il numero di pagine è quello del lab (decine di device), quindi la ricorsione è sicura.
const fetchAllPages = <A>(
  transport: Http.Transport,
  config: SuitestConfig,
  initialUrl: string,
  itemCodec: t.Mixed & t.Decoder<unknown, A>,
): TE.TaskEither<Http.HttpFailure, ReadonlyArray<A>> => {
  const pageCodec = Codecs.PaginatedCodec(itemCodec);

  const go = (url: string, acc: ReadonlyArray<A>): TE.TaskEither<Http.HttpFailure, ReadonlyArray<A>> =>
    pipe(
      Http.getJson(transport, url, headers(config), config.timeoutMs),
      TE.flatMapEither(Http.decode(pageCodec)),
      TE.flatMap((page) => {
        const merged = [...acc, ...(page.values as ReadonlyArray<A>)];
        return page.next ? go(page.next, merged) : TE.right(merged);
      }),
    );

  return go(initialUrl, []);
};

export const make = (config: SuitestConfig, transport: Http.Transport = Http.fetchTransport): SuitestClient => ({
  devices: fetchAllPages(transport, config, `${config.baseUrl}/devices`, Codecs.DeviceCodec),

  // Le control unit non sono paginate: l'endpoint risponde con l'array intero.
  controlUnits: pipe(
    Http.getJson(transport, `${config.baseUrl}/control-units`, headers(config), config.timeoutMs),
    TE.flatMapEither(Http.decode(Codecs.ControlUnitsResponseCodec)),
    TE.map((units): ReadonlyArray<Codecs.ControlUnit> => units),
  ),

  videoCaptureDevices: fetchAllPages(
    transport,
    config,
    `${config.baseUrl}/video-capture-devices`,
    Codecs.VideoCaptureDeviceCodec,
  ),

  rebootControlUnit: (unitId) =>
    pipe(
      Http.postJson(
        transport,
        `${config.baseUrl}/control-units/${encodeURIComponent(unitId)}/reboot`,
        headers(config),
        config.timeoutMs,
      ),
      TE.asUnit,
    ),
});
