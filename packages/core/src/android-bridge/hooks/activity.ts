import type * as Machine from "@supervisor/core/state-machine/machine";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { AndroidBridgeMachineEnv } from "../interpret";
import type { AndroidBridgeEvent, AndroidBridgeState } from "../model";

const describeStatus = (state: AndroidBridgeState): string =>
  match(state)
    .with({ _tag: "Connecting" }, () => "connecting")
    .with({ _tag: "Idle" }, () => "connected")
    .with({ _tag: "Disconnecting" }, () => "disconnecting")
    .with({ _tag: "Disconnected" }, (s) => `disconnected (${s.reason})`)
    .exhaustive();

export const forwardToActivity: Machine.TransitionHook<
  AndroidBridgeMachineEnv,
  never,
  AndroidBridgeState,
  AndroidBridgeEvent
> = (from, _event, to) => (env) => {
  if (from._tag === to._tag) return TE.right(undefined);

  env.activityStream.emit({ entityId: to.id, source: "adb", status: describeStatus(to) });
  return TE.right(undefined);
};
