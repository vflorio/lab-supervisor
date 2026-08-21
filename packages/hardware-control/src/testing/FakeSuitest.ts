// Suitest finto: un trasporto HTTP che risponde dalle liste che gli si scrivono e registra ogni
// comando ricevuto. È così che si mette alla prova un ACL — non simulando `fetch`, ma sostituendo
// l'unica cosa che l'ACL sa fare verso la rete.
// Serve anche fuori dai test di questo package: chi monta il supervisore in locale, senza un
// Suitest a cui parlare, monta questo e vede il ciclo intero girare.

import * as TE from "fp-ts/TaskEither";
import type * as Http from "../internal/Http";
import type { ControlUnit, Device, VideoCaptureDevice } from "../internal/suitest/Codecs";

// L'unica scrittura che la Public API espone: il reboot di una control unit (FATTO-10).
export type Dispatched = { readonly unitId: string };

export type Lab = {
  readonly devices: ReadonlyArray<Device>;
  readonly controlUnits: ReadonlyArray<ControlUnit>;
  readonly videoCaptureDevices: ReadonlyArray<VideoCaptureDevice>;
};

export const emptyLab: Lab = { devices: [], controlUnits: [], videoCaptureDevices: [] };

export interface FakeSuitest {
  readonly transport: Http.Transport;
  readonly setLab: (lab: Lab) => void;
  // Fa fallire ogni chiamata successiva. Il modo per mettere alla prova "Suitest è giù" senza
  // staccare un cavo.
  readonly breakWith: (failure: Http.HttpFailure | undefined) => void;
  readonly dispatched: () => ReadonlyArray<Dispatched>;
  readonly reads: () => ReadonlyArray<string>;
}

const path = (url: string): string => {
  const withoutQuery = url.split("?")[0] ?? url;
  const marker = withoutQuery.indexOf("/api/");
  return marker >= 0 ? withoutQuery.slice(marker) : withoutQuery;
};

const isControlUnitReboot = (segments: ReadonlyArray<string>): boolean =>
  segments.length >= 3 &&
  segments[segments.length - 1] === "reboot" &&
  segments[segments.length - 3] === "control-units";

export const make = (initial: Lab = emptyLab): FakeSuitest => {
  let lab = initial;
  let broken: Http.HttpFailure | undefined;
  const commands: Dispatched[] = [];
  const gets: string[] = [];

  // Le liste non sono paginate nel finto: `next` assente chiude il ciclo al primo giro, che è
  // esattamente ciò che fa l'API vera quando il lab sta in una pagina.
  const respond = (body: unknown): TE.TaskEither<Http.HttpFailure, Http.HttpResponse> =>
    TE.right({ status: 200, body: JSON.stringify(body) });

  const notFound = (url: string): TE.TaskEither<Http.HttpFailure, Http.HttpResponse> =>
    TE.right({ status: 404, body: `no route for ${url}` });

  // Pigro come il trasporto vero: una `TaskEither` è una promessa di fare, non un fare. Registrare
  // la chiamata alla costruzione invece che all'esecuzione farebbe contare letture che non
  // avvengono, e nasconderebbe proprio il difetto che il mirror esiste per evitare.
  const transport: Http.Transport = (request) =>
    TE.flatten(
      TE.fromIO(() => (broken !== undefined ? TE.left<Http.HttpFailure, Http.HttpResponse>(broken) : serve(request))),
    );

  const serve = (request: Http.HttpRequest): TE.TaskEither<Http.HttpFailure, Http.HttpResponse> => {
    const route = path(request.url);
    const segments = route.split("/").filter((segment) => segment !== "");

    if (request.method === "POST") {
      // Ogni altra POST è un 404, ed è la verità: non esiste un endpoint pubblico per accendere o
      // riavviare una TV.
      if (!isControlUnitReboot(segments)) return notFound(request.url);
      commands.push({ unitId: decodeURIComponent(segments[segments.length - 2] ?? "") });
      return respond({ ok: true });
    }

    gets.push(route);
    if (route.endsWith("/devices")) return respond({ values: lab.devices });
    if (route.endsWith("/control-units")) return respond(lab.controlUnits);
    if (route.endsWith("/video-capture-devices")) return respond({ values: lab.videoCaptureDevices });
    return notFound(request.url);
  };

  return {
    transport,
    setLab: (next) => {
      lab = next;
    },
    breakWith: (failure) => {
      broken = failure;
    },
    dispatched: () => [...commands],
    reads: () => [...gets],
  };
};

// Costruttori minimi: nei test conta un campo per volta, e scrivere a mano venti campi obbligatori
// per cambiarne uno rende illeggibile lo scenario.
export const device = (deviceId: string, overrides: Partial<Device> = {}): Device => ({
  deviceId,
  manufacturer: "acme",
  model: "tv",
  owner: "lab",
  firmware: "1.0",
  customName: deviceId,
  ipAddress: "10.0.0.1",
  controlUnitIds: [],
  status: "READY",
  modelId: "acme-tv",
  platforms: ["hbbtv"],
  ...overrides,
});

export const controlUnit = (id: string, overrides: Partial<ControlUnit> = {}): ControlUnit => ({
  id,
  name: id,
  online: true,
  type: "candybox",
  reboot: true,
  shutdown: true,
  ...overrides,
});

export const videoCaptureDevice = (id: string, overrides: Partial<VideoCaptureDevice> = {}): VideoCaptureDevice => ({
  id,
  type: "android-app",
  name: id,
  assignedDeviceId: "tv-1",
  online: true,
  recordingActive: false,
  streamActive: true,
  ...overrides,
});
