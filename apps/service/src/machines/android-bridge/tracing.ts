import * as Network from "@supervisor/core/network";
import type * as Machine from "@supervisor/core/state-machine/machine";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { AndroidBridgeMachineEnv } from "./interpret";
import type { AndroidBridgeEvent, AndroidBridgeState } from "./model";

// -------------------------------------------------------------------------------------
// Tracing - visibilità automatica sulle transizioni di fase (debugging)
// -------------------------------------------------------------------------------------
// Stesso principio di adb-connection/tracing.ts: logga solo quando cambia la "fase" (`_tag`),
// livello error quando si regredisce a Disconnected da una fase più avanzata.
// -------------------------------------------------------------------------------------

const describeState = (state: AndroidBridgeState): string =>
  match(state)
    .with({ _tag: "Connecting" }, (s) => `Connecting(${s.id}, ${Network.formatHost(s.host)})`)
    .with({ _tag: "Idle" }, (s) => `Idle(${s.id}, ${Network.format(s.target)})`)
    .with({ _tag: "Disconnected" }, (s) => `Disconnected(${s.id}, ${Network.formatHost(s.host)})`)
    .exhaustive();

const describeEvent = (event: AndroidBridgeEvent): string =>
  match(event)
    .with({ _tag: "ReconnectRequested" }, () => "ReconnectRequested")
    .with({ _tag: "ConnectionEstablished" }, (e) => `ConnectionEstablished(${Network.format(e.target)})`)
    .with({ _tag: "ConnectionFailed" }, (e) => `ConnectionFailed(${e.reason})`)
    .with({ _tag: "ConnectionLost" }, (e) => `ConnectionLost(${e.reason})`)
    .exhaustive();

const isRegression = (from: AndroidBridgeState, to: AndroidBridgeState): boolean =>
  from._tag !== "Disconnected" && to._tag === "Disconnected";

export const onTransition: Machine.TransitionHook<
  AndroidBridgeMachineEnv,
  never,
  AndroidBridgeState,
  AndroidBridgeEvent
> = (from, event, to) => (env) =>
  from._tag === to._tag
    ? TE.right(undefined)
    : TE.fromIO(
        (isRegression(from, to) ? env.logger.child("AndroidBridge").error : env.logger.child("AndroidBridge").info)(
          `Event = [${describeEvent(event)}]\nTransition = [${describeState(from)} -> ${describeState(to)}]`,
        ),
      );
