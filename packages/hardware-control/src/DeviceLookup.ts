// Una porta riceve un `DeviceId`, mai un indirizzo: `Endpoints` è dato opaco per il dominio, che
// non deve nemmeno sapere che esiste una cosa chiamata "host:porta" (NO-9). Qualcuno però quella
// traduzione la deve fare, e quel qualcuno è l'ACL: è precisamente il suo mestiere.
// È una funzione e non `DeviceRepository` intero perché un adapter non ha niente da farsene di
// `save` né di `topology` (A-8): al composition root la si soddisfa con `deviceRepository.findById`.

import type { Device } from "@lab/registry/domain/Device";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type * as O from "fp-ts/Option";
import type * as TE from "fp-ts/TaskEither";

export type DeviceLookup = (id: DeviceId) => TE.TaskEither<never, O.Option<Device>>;
