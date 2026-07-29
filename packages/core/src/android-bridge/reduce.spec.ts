import { describe, expect, it } from "vitest";
import type * as Network from "../network";
import * as Machine from "../state-machine/machine";
import * as Model from "./model";
import { reduce } from "./reduce";

const ID = "tablet";
const HOST = { ip: "192.168.1.4" } as Network.Host;
const TARGET = { ip: "192.168.1.4", port: 5555 } as Network.Endpoint;

describe("android-bridge reduce", () => {
  it("connects from Disconnected on ReconnectRequested, emitting Connect", () => {
    const state = Model.disconnected(ID, HOST, "not yet connected");
    expect(reduce(state, { _tag: "ReconnectRequested" })).toStrictEqual(
      Machine.transition(Model.connecting(ID, HOST), [{ _tag: "Connect", host: HOST }]),
    );
  });

  it("reaches Idle carrying the live target on ConnectionEstablished", () => {
    const state = Model.connecting(ID, HOST);
    expect(reduce(state, { _tag: "ConnectionEstablished", target: TARGET })).toStrictEqual(
      Machine.transition(Model.idle(ID, TARGET)),
    );
  });

  it("drops to Disconnected on ConnectionLost, projecting the target back to a host", () => {
    const state = Model.idle(ID, TARGET);
    expect(reduce(state, { _tag: "ConnectionLost", reason: "unreachable" })).toStrictEqual(
      Machine.transition(Model.disconnected(ID, HOST, "unreachable")),
    );
  });

  // Disconnessione ATTESA: nessun `adb disconnect` da fare, il device sta già andando giù
  it("invalidates Idle immediately on RebootDispatched, with no command", () => {
    const state = Model.idle(ID, TARGET);
    expect(reduce(state, { _tag: "RebootDispatched" })).toStrictEqual(
      Machine.transition(Model.disconnected(ID, HOST, "reboot dispatched")),
    );
  });

  // Disconnessione SOSPETTA: il transport locale di adb va ripulito, quindi si passa da
  // Disconnecting e si torna Disconnected solo col follow-up dell'intent
  it("goes through Disconnecting on TransportSuspect, emitting Disconnect on the live target", () => {
    const state = Model.idle(ID, TARGET);
    expect(reduce(state, { _tag: "TransportSuspect", reason: "command timed out" })).toStrictEqual(
      Machine.transition(Model.disconnecting(ID, HOST), [
        { _tag: "Disconnect", target: TARGET, reason: "command timed out" },
      ]),
    );
  });

  it("settles Disconnecting into Disconnected on the Disconnect follow-up", () => {
    const state = Model.disconnecting(ID, HOST);
    expect(reduce(state, { _tag: "ConnectionLost", reason: "command timed out" })).toStrictEqual(
      Machine.transition(Model.disconnected(ID, HOST, "command timed out")),
    );
  });

  // Il reducer è l'unica autorità sulla pertinenza di un evento: i chiamanti dispatchano senza
  // pre-filtrare sullo stato (vedi orchestrator), quindi questi casi devono essere no-op qui.
  describe("no-op for events not applicable to the current state", () => {
    const cases: ReadonlyArray<readonly [string, Model.AndroidBridgeState, Model.AndroidBridgeEvent]> = [
      [
        "RebootDispatched while already Disconnected",
        Model.disconnected(ID, HOST, "gone"),
        { _tag: "RebootDispatched" },
      ],
      [
        "TransportSuspect while Connecting",
        Model.connecting(ID, HOST),
        { _tag: "TransportSuspect", reason: "command timed out" },
      ],
      [
        "a second TransportSuspect while already Disconnecting",
        Model.disconnecting(ID, HOST),
        { _tag: "TransportSuspect", reason: "command timed out" },
      ],
      // Una riconnessione non va tentata mentre un disconnect esplicito è ancora in volo
      ["ReconnectRequested while Disconnecting", Model.disconnecting(ID, HOST), { _tag: "ReconnectRequested" }],
      [
        "ConnectionLost while Disconnected",
        Model.disconnected(ID, HOST, "gone"),
        { _tag: "ConnectionLost", reason: "x" },
      ],
    ];

    it.each(cases)("%s", (_label, state, event) => {
      expect(reduce(state, event)).toStrictEqual(Machine.transition(state));
    });
  });
});
