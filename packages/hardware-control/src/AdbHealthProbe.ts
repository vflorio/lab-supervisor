// La sonda del transport adb (M-3). `AdbTransport` è la faccia che risponde alla domanda "l'host
// `host:porta` risponde davvero?" (FATTO-8). È indipendente dallo stream e cade separatamente: un
// transport incastrato con lo stream ancora attivo è il caso normale, non l'eccezione, ed è la
// ragione per cui le due facce sono due.
// Travaso di `legacy/core/src/adapters/adb/target-resolution.ts`, con una scelta diversa e
// deliberata: qui **non** si risolve via mDNS. Quella risoluzione a volte non rileva un device
// tornato online (FATTO-12), e una sonda che sbaglia rende malato un device sano — l'endpoint
// riconciliato in anagrafica è la fonte più affidabile che abbiamo (FATTO-9).
// `adb devices` da solo non basta: elenca anche i transport incastrati come `device`. Serve un
// comando che il device debba davvero **eseguire**, ed è per questo che la sonda ne manda uno — il
// più a buon mercato che esista, `wm size`.

import type { Clock } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import type { FacetRef } from "@lab/monitoring/domain/FacetRef";
import * as ProbeOutcome from "@lab/monitoring/domain/ProbeOutcome";
import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import type { Device } from "@lab/registry/domain/Device";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";
import * as Cli from "./internal/adb/Cli";
import * as Shell from "./internal/adb/Shell";

export type { AdbConfig } from "./internal/adb/Cli";

export type Options = {
  readonly lookup: DeviceLookup;
  readonly clock: Clock.Clock;
  readonly spawn?: Shell.Spawn;
};

const negative = (ref: FacetRef, at: Instant, reason: string): ProbeOutcome.ProbeOutcome =>
  ProbeOutcome.make(ref, at, false, O.some(reason));

export const make = (config: Cli.AdbConfig, options: Options): HealthProbePort => {
  const cli = Cli.make(config, options.spawn);

  // Due letture, e servono entrambe. `adb devices` dice se il transport esiste ed è in stato utile;
  // `wm size` è il comando più a buon mercato che il device deve *eseguire*, e distingue un
  // transport vivo da uno elencato ma incastrato — che è precisamente il guasto da rilevare.
  const observe = (ref: FacetRef, endpoint: string): T.Task<ProbeOutcome.ProbeOutcome> =>
    pipe(
      cli.devices,
      TE.flatMap((attached): TE.TaskEither<Shell.ShellFailure, O.Option<string>> => {
        const found = attached.find((entry) => entry.endpoint === endpoint);
        if (found === undefined) return TE.right(O.some("transport assente da `adb devices`"));
        if (found.state !== "device") return TE.right(O.some(`transport in stato ${found.state}`));
        return pipe(
          cli.screenSize(endpoint),
          TE.map(() => O.none),
        );
      }),
      TE.matchW(
        (failure: Shell.ShellFailure) => negative(ref, options.clock.now(), Shell.describe(failure)),
        O.match(
          () => ProbeOutcome.make(ref, options.clock.now(), true),
          (reason) => negative(ref, options.clock.now(), reason),
        ),
      ),
    );

  const outcomeFor = (ref: FacetRef, device: Device): T.Task<ProbeOutcome.ProbeOutcome> => {
    if (ref.facet !== "AdbTransport")
      return T.of(
        negative(ref, options.clock.now(), `faccia ${ref.facet} non si osserva via adb: instradamento sbagliato`),
      );

    return pipe(
      device.endpoints.adb,
      O.match(
        () => T.of(negative(ref, options.clock.now(), "nessun endpoint adb per questo device")),
        (endpoint) => observe(ref, String(endpoint)),
      ),
    );
  };

  return {
    probe: (ref) =>
      pipe(
        options.lookup(ref.deviceId),
        TE.flatMapTask(
          O.match(
            () => T.of(negative(ref, options.clock.now(), "device non presente in anagrafica")),
            (device: Device) => outcomeFor(ref, device),
          ),
        ),
      ),
  };
};
