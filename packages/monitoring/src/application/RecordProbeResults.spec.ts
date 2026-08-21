import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as FacetRef from "../domain/FacetRef";
import * as FlappingPolicy from "../domain/FlappingPolicy";
import * as HealthStatus from "../domain/HealthStatus";
import * as ProbeOutcome from "../domain/ProbeOutcome";
import * as InMemoryFacetHealthRepository from "../testing/InMemoryFacetHealthRepository";
import * as RecordProbeResults from "./RecordProbeResults";

const camera = DeviceId.of("cam-1");
const stream = FacetRef.make(camera, "StreamAvailable");
const transport = FacetRef.make(camera, "AdbTransport");
const t = (seconds: number) => Instant.plus(Instant.fromEpochMillis(0), Duration.seconds(seconds));

const run = async (
  outcomes: ReadonlyArray<ProbeOutcome.ProbeOutcome>,
  policy = FlappingPolicy.make(2, 1),
  repository = InMemoryFacetHealthRepository.make(),
) => {
  const result = await RecordProbeResults.execute(outcomes, policy)({ facetHealthRepository: repository })();
  if (E.isLeft(result)) throw new Error("impossibile: il canale d'errore è never");
  return { output: result.right, repository };
};

describe("RecordProbeResults", () => {
  it("una serie concorde dentro lo stesso lotto conta come serie", async () => {
    const { output } = await run([ProbeOutcome.make(stream, t(0), false), ProbeOutcome.make(stream, t(10), false)]);
    expect(output.events).toEqual([
      { _tag: "FacetBecameUnhealthy", at: t(10), deviceId: camera, facet: "StreamAvailable", since: t(0) },
    ]);
  });

  it("facce diverse dello stesso device non si contaminano (FATTO-8)", async () => {
    const { output, repository } = await run([
      ProbeOutcome.make(stream, t(0), false),
      ProbeOutcome.make(transport, t(0), true),
      ProbeOutcome.make(stream, t(10), false),
      ProbeOutcome.make(transport, t(10), true),
    ]);
    expect(output.events.map((event) => event._tag)).toEqual(["FacetBecameHealthy", "FacetBecameUnhealthy"]);
    expect(await repository.statusOf(transport)()).toEqual(E.right(HealthStatus.healthy(t(0))));
  });

  it("la salute confermata resta persistita fra un lotto e il successivo", async () => {
    const repository = InMemoryFacetHealthRepository.make();
    await run([ProbeOutcome.make(stream, t(0), false)], FlappingPolicy.make(2, 1), repository);
    const { output } = await run([ProbeOutcome.make(stream, t(10), false)], FlappingPolicy.make(2, 1), repository);
    expect(output.events.map((event) => event._tag)).toEqual(["FacetBecameUnhealthy"]);
  });

  it("non pubblica mai una decisione, solo fatti (§4.1)", async () => {
    const { output } = await run([ProbeOutcome.make(stream, t(0), false)], FlappingPolicy.immediate);
    expect(output.events.every((event) => event._tag.startsWith("FacetBecame"))).toBe(true);
  });
});
