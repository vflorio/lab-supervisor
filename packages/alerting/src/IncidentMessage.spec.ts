import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as FacetHealth from "@lab/monitoring/domain/FacetHealth";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as AttemptRecord from "@lab/recovery/domain/AttemptRecord";
import * as GiveUpReason from "@lab/recovery/domain/GiveUpReason";
import type { Incident } from "@lab/recovery/domain/Incident";
import * as Playbook from "@lab/recovery/domain/Playbook";
import * as RecoverySessionId from "@lab/recovery/domain/RecoverySessionId";
import * as RecoveryTarget from "@lab/recovery/domain/RecoveryTarget";
import * as Remedy from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import * as RetryPolicy from "@lab/recovery/domain/RetryPolicy";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as IncidentMessage from "./IncidentMessage";

const t0 = Instant.fromEpochMillis(1_700_000_000_000);
const at = (minutes: number) => Instant.plus(t0, Duration.minutes(minutes));

const camera = DeviceId.of("cam-1");

const health = (facet: "AdbTransport" | "StreamAvailable", status: HealthStatus.HealthStatus) => ({
  ...FacetHealth.initial(FacetRef.make(camera, facet)),
  status,
});

const incident = (overrides: Partial<Incident> = {}): Incident => ({
  sessionId: RecoverySessionId.of("sess-1"),
  target: RecoveryTarget.device(camera),
  criticality: "NotifyWhenExhausted",
  outageSince: t0,
  raisedAt: at(12),
  reason: O.some(GiveUpReason.playbookExhausted),
  history: [],
  facets: [],
  lastFailures: [],
  closedAt: O.none,
  ...overrides,
});

const text = (blocks: ReadonlyArray<IncidentMessage.MessageBlock>) => blocks.map((block) => block.text).join("\n");

describe("IncidentMessage", () => {
  it("dice cosa è caduto e da quanto, in parole (FATTO-16)", () => {
    const rendered = text(IncidentMessage.render(incident()));

    expect(rendered).toContain("cam-1 non recuperato");
    expect(rendered).toContain("Giù da 12 min");
    expect(rendered).toContain("scala di escalation esaurita");
  });

  it("fotografa tutte le facce, perché una camera muta su entrambe è un'altra storia (FATTO-8)", () => {
    const rendered = text(
      IncidentMessage.render(
        incident({
          facets: [
            health("AdbTransport", HealthStatus.healthy(at(2))),
            health("StreamAvailable", HealthStatus.unhealthy(t0)),
          ],
        }),
      ),
    );

    expect(rendered).toContain("cam-1 · AdbTransport: sana da 10 min");
    expect(rendered).toContain("cam-1 · StreamAvailable: giù da 12 min");
  });

  it("elenca i tentativi con esito e verdetto, e dice quali gradini sono stati scartati (INV-4)", () => {
    const dispatched = AttemptRecord.close(
      AttemptRecord.withOutcome(
        AttemptRecord.dispatched(
          Playbook.stepIndex(1),
          RetryPolicy.first,
          Remedy.restartApp(Remedy.appRef("st.suite.camera")),
          at(3),
        ),
        RemedyOutcome.accepted,
      ),
      "NotRecovered",
      at(5),
    );
    const rendered = text(
      IncidentMessage.render(
        incident({
          history: [
            AttemptRecord.skipped(Playbook.firstStep, Remedy.reconnectTransport, at(1), RetryPolicy.first),
            dispatched,
          ],
        }),
      ),
    );

    expect(rendered).toContain("#0 ReconnectTransport — scartato (precondizione falsa)");
    expect(rendered).toContain("#1 tentativo 1 RestartApp(st.suite.camera) — comando preso in carico → NotRecovered");
  });

  it("riporta l'ultimo esito per rimedio: è la risposta a «cosa ha detto l'hardware»", () => {
    const rendered = text(
      IncidentMessage.render(
        incident({
          lastFailures: [{ remedy: Remedy.rebootHardware, outcome: RemedyOutcome.unreachable, at: at(8) }],
        }),
      ),
    );

    expect(rendered).toContain("RebootHardware: device irraggiungibile");
  });

  it("una resa immediata per capability mancante si legge come tale, non come una scala esaurita (FL-2)", () => {
    const rendered = text(IncidentMessage.render(incident({ reason: O.some(GiveUpReason.remedyUnsupported) })));

    expect(rendered).toContain("resa immediata: il device non dichiara la capability richiesta");
  });

  it("un incidente alzato in anticipo per criticità dice che il recupero è ancora in corso (FATTO-16)", () => {
    const rendered = text(IncidentMessage.render(incident({ reason: O.none, criticality: "NotifyImmediately" })));

    expect(rendered).toContain("segnalato subito per criticità: il recupero è ancora in corso");
  });

  it("un cluster nomina la CU e quanti dipendenti coinvolge (FL-3)", () => {
    const cu = DeviceId.of("cu-1");
    const rendered = text(
      IncidentMessage.render(
        incident({
          target: RecoveryTarget.controlUnitCluster(cu, [DeviceId.of("tv-1"), DeviceId.of("tv-2")]),
        }),
      ),
    );

    expect(rendered).toContain("cu-1 + 2 dipendenti");
  });

  it("un incidente chiuso è la buona notizia, non una nuova segnalazione", () => {
    const blocks = IncidentMessage.render(incident({ closedAt: O.some(at(20)) }));

    expect(text(blocks)).toContain("Rientrato");
    expect(text(blocks)).toContain("durava da 20 min");
    expect(IncidentMessage.summary(incident({ closedAt: O.some(at(20)) }))).toBe("Rientrato: cam-1");
  });
});
