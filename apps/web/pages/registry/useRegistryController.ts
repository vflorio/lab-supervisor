import * as Network from "@supervisor/core/network";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import { useServiceLogger } from "../../hooks/useServiceLogger";
import { trpc } from "../../trpc/client";
import { adbStatusFor, buildHierarchy, cameraSuitestCandidates, suitestVideoCaptureDeviceForTv } from "./hierarchy";
import { mutate, mutations } from "./mutations";
import type { CameraView, Database, DeviceKind, LinkingTarget, NewAdbTargetForm, TvView } from "./types";

// Estratto da Registry.tsx: cosi' Registry.tsx e RegistryTree.tsx riusano la stessa
// business logic e differiscono solo nel rendering.
//
// Il file e' diviso in un controller per feature: ognuno tiene il proprio stato e le proprie
// azioni, riceve le sole dipendenze condivise (`Deps`) e viene composto in fondo da
// `useRegistryController`, che ne aggrega i domini nel valore di ritorno.

// -------------------------------------------------------------------------------------
// Dipendenze condivise
// -------------------------------------------------------------------------------------

type MutationResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

// Mutation sul registry su disco: banner in caso di errore, reload() in caso di successo
type RunMutation = <T>(fn: () => Promise<MutationResult<T>>) => Promise<void>;

interface Deps {
  readonly db: Database;
  readonly log: ReturnType<typeof useServiceLogger>;
  readonly run: RunMutation;
  // Per gli interventi operatore, che non toccano il registry e quindi non passano da `run`
  readonly setError: (message: string | null) => void;
}

// Le mutation guidate da un dialog dipendono dal target ancora selezionato: se e' sparito si
// fallisce senza chiamare il servizio.
const invalid = (message: string) => ({ ok: false as const, error: { type: "ValidationError", message } });

function useErrorSink() {
  const [message, setMessage] = useState<string | null>(null);
  const run: RunMutation = (fn) => mutate(fn, setMessage);
  return { message, dismiss: () => setMessage(null), setError: setMessage, run };
}

// Stato comune a rinomina/assegnazione/link: un target selezionato, `null` = dialog chiuso.
function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return { target, open: (value: T) => setTarget(value), close: () => setTarget(null) };
}

// -------------------------------------------------------------------------------------
// Inventario: gerarchia e contatori, derivati puri dal db
// -------------------------------------------------------------------------------------

function useInventory(db: Database) {
  const { cuGroups, unallocatedTvs, orphanCameras } = buildHierarchy(db);

  const controlUnits = Object.keys(db.lab.candyboxes).length;
  const tvs = Object.keys(db.lab.tvs).length;
  const cameras = Object.keys(db.lab.cameras).length;

  const controlled =
    Object.values(db.lab.candyboxes).filter((d) => d.controlled).length +
    Object.values(db.lab.cameras).filter((d) => d.controlled).length +
    Object.values(db.lab.tvs).filter((d) => d.controlled).length;

  return {
    cuGroups,
    unallocatedTvs,
    orphanCameras,
    counts: { controlUnits, tvs, cameras, total: controlUnits + tvs + cameras, controlled },
  };
}

// -------------------------------------------------------------------------------------
// Controllo device: presa in carico e rimozione
// -------------------------------------------------------------------------------------

function useDeviceControl({ log, run }: Deps) {
  const toggle = (kind: DeviceKind, id: string, controlled: boolean) => {
    log(`User ${controlled ? "disabled" : "enabled"} control of ${kind} ${id}`);
    return run(() =>
      match(kind)
        .with("candybox", () => mutations.candybox.update.mutate({ id, controlled: !controlled }))
        .with("camera", () => mutations.camera.update.mutate({ id, controlled: !controlled }))
        .with("tv", () => mutations.tv.update.mutate({ deviceId: id, controlled: !controlled }))
        .exhaustive(),
    );
  };

  const remove = (kind: DeviceKind, id: string) => {
    log(`User deleted ${kind} ${id}`, "warn");
    return run(() =>
      match(kind)
        .with("candybox", () => mutations.candybox.remove.mutate(id))
        .with("camera", () => mutations.camera.remove.mutate(id))
        .with("tv", () => mutations.tv.remove.mutate(id))
        .exhaustive(),
    );
  };

  return { toggle, remove };
}

// -------------------------------------------------------------------------------------
// Rinomina: dialog con label in bozza
// -------------------------------------------------------------------------------------

function useRename({ log, run }: Deps) {
  const dialog = useDialogTarget<{ kind: DeviceKind; id: string; label: string }>();
  const [draft, setDraft] = useState("");

  const start = (kind: DeviceKind, id: string, label: string) => {
    dialog.open({ kind, id, label });
    setDraft(label);
  };

  const save = () =>
    run(async () => {
      const target = dialog.target;
      if (!target) return invalid("Nothing to edit");

      log(`User renamed ${target.kind} ${target.id} to "${draft}"`);
      const result = await match(target.kind)
        .with("candybox", () => mutations.candybox.update.mutate({ id: target.id, label: draft }))
        .with("camera", () => mutations.camera.update.mutate({ id: target.id, label: draft }))
        .with("tv", () => mutations.tv.update.mutate({ deviceId: target.id, label: draft }))
        .exhaustive();
      if (result.ok) dialog.close();
      return result;
    });

  return { target: dialog.target, draft, setDraft, start, cancel: dialog.close, save };
}

// -------------------------------------------------------------------------------------
// Target ADB: registro degli host, unica entita' registrabile a mano dalla UI
// -------------------------------------------------------------------------------------

const emptyNewAdbTarget: NewAdbTargetForm = { label: "", target: "" };

function useAdbTargets({ db, log, run }: Deps, devices: readonly AdbDevice[]) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewAdbTargetForm>(emptyNewAdbTarget);

  const submit = () =>
    run(async () => {
      if (!form.label) return invalid("Label required");

      const decoded = Network.decode(form.target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = Network.format(decoded.right);
      log(`User added ADB target ${id} ("${form.label}")`);
      const result = await mutations.adb.add.mutate({ id, label: form.label, target: id });

      if (result.ok) {
        setOpen(false);
        setForm(emptyNewAdbTarget);
      }
      return result;
    });

  // Host gia' assegnati a una camera: esclusi dai candidati dell'assign dialog
  const usedTargets = new Set(
    Object.values(db.lab.cameras)
      .map((c) =>
        pipe(
          c.adbId,
          O.chain((id) => O.fromNullable(db.lab.adb[id])),
          O.map((entry) => Network.format(entry.target)),
        ),
      )
      .filter(O.isSome)
      .map((o) => o.value),
  );

  return {
    devices,
    usedTargets,
    statusFor: (target: Parameters<typeof adbStatusFor>[1]) => adbStatusFor(devices, target),
    add: { open, setOpen, form, setForm, submit },
  };
}

// -------------------------------------------------------------------------------------
// Assegnazione camera <-> host ADB
// -------------------------------------------------------------------------------------

function useAdbAssignment({ log, run }: Deps) {
  const dialog = useDialogTarget<CameraView>();

  // Upsert (idempotente, chiave = target stesso) del target nel registro `adb`, poi collega
  // la camera via foreign key `adbId`.
  const submit = (target: string) =>
    run(async () => {
      const camera = dialog.target;
      if (!camera) return invalid("No camera");

      const decoded = Network.decode(target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = Network.format(decoded.right);
      log(`User assigned ADB host ${id} to camera ${camera.id}`);
      const addResult = await mutations.adb.add.mutate({ id, label: id, target: id });
      if (!addResult.ok) return addResult;

      const result = await mutations.camera.update.mutate({ id: camera.id, adbId: id });
      if (result.ok) dialog.close();
      return result;
    });

  return { camera: dialog.target, start: dialog.open, cancel: dialog.close, submit };
}

// -------------------------------------------------------------------------------------
// Riconciliazione manuale: camera -> video-capture-device Suitest
// -------------------------------------------------------------------------------------

function useSuitestLinking({ db, log, run }: Deps) {
  const dialog = useDialogTarget<LinkingTarget>();

  const start = (camera: CameraView) =>
    dialog.open({ id: camera.id, currentVideoCaptureDeviceId: O.toUndefined(camera.videoCaptureDeviceId) });

  const submit = (videoCaptureDeviceId: string) =>
    run(async () => {
      const target = dialog.target;
      if (!target) return invalid("Nothing to link");

      log(`User linked Suitest video-capture-device ${videoCaptureDeviceId} to camera ${target.id}`);
      const result = await mutations.camera.update.mutate({ id: target.id, videoCaptureDeviceId });
      if (result.ok) dialog.close();
      return result;
    });

  return {
    target: dialog.target,
    candidates: dialog.target ? cameraSuitestCandidates(db, dialog.target.currentVideoCaptureDeviceId) : [],
    start,
    cancel: dialog.close,
    submit,
  };
}

// -------------------------------------------------------------------------------------
// Riconciliazione manuale invertita: TV -> camera locale orfana
// -------------------------------------------------------------------------------------

function useTvCameraLinking({ db, log, run }: Deps, orphanCameras: readonly CameraView[]) {
  const dialog = useDialogTarget<TvView>();

  // Parte dal video-capture-device che Suitest ha gia' assegnato a questa TV (non scrivibile
  // da noi), poi collega la camera scelta con la stessa mutation di sempre.
  const submit = (cameraId: string) =>
    run(async () => {
      const tv = dialog.target;
      if (!tv) return invalid("Nothing to link");

      const videoCaptureDeviceId = suitestVideoCaptureDeviceForTv(db, tv.deviceId);
      if (!videoCaptureDeviceId) return invalid("No Suitest video-capture-device assigned to this TV");

      log(`User linked camera ${cameraId} to TV ${tv.deviceId} via video-capture-device ${videoCaptureDeviceId}`);
      const result = await mutations.camera.update.mutate({ id: cameraId, videoCaptureDeviceId });
      if (result.ok) dialog.close();
      return result;
    });

  // Camere locali orfane, mostrate solo se Suitest ha effettivamente assegnato un
  // video-capture-device a questa TV (altrimenti non c'e' nulla da collegare).
  const candidates =
    dialog.target && suitestVideoCaptureDeviceForTv(db, dialog.target.deviceId)
      ? orphanCameras.map((c) => ({ id: c.id, primary: c.label, secondary: O.toUndefined(c.adbId) }))
      : [];

  return { target: dialog.target, candidates, start: dialog.open, cancel: dialog.close, submit };
}

// -------------------------------------------------------------------------------------
// Interventi operatore: non toccano il registry su disco, l'esito arriva dai feed live
// -------------------------------------------------------------------------------------

function useInterventions({ log, setError }: Deps, workflows: readonly { name: string }[]) {
  // Riarma un tripwire "exhausted": a differenza delle mutation del registry non fa reload(),
  // l'esito arriva dallo stream di recovery/activity gia' sottoscritto (RecoveryIntervention.tsx).
  const resetRecovery = (policy: string, entityId: string, tripwireIndex: number) => {
    log(`User reset recovery tripwire for ${entityId} (policy "${policy}")`, "warn");
    trpc.recovery.reset.mutate({ policy, entityId, tripwireIndex }).then((succeeded) => {
      if (!succeeded) setError(`Reset failed: no active recovery runner for "${entityId}"`);
    });
  };

  // Lancio manuale di un workflow: l'esito arriva dallo stream di activity (source
  // "manual-workflow").
  const runWorkflow = (cameraId: string, workflowName: string) => {
    log(`User launched workflow "${workflowName}" on camera ${cameraId}`);
    trpc.workflow.run.mutate({ cameraId, workflowName }).then((result) => {
      if (!result.ok) setError(`Workflow failed: ${result.error.message}`);
    });
  };

  return { workflows, resetRecovery, runWorkflow };
}

// -------------------------------------------------------------------------------------
// Provisioning dell'agent
// -------------------------------------------------------------------------------------

function useProvisioning({ log, setError }: Deps) {
  // Lo stato aggiornato non arriva dalla risposta ma dai fatti del dominio `agent`, che il
  // servizio pubblica durante la convergenza sul feed gia' sottoscritto - qui si tiene solo il
  // "busy" locale, che nessun feed puo' conoscere.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  // Senza `provisioning` in config non c'e' alcun APK da installare: si legge una volta sola
  // (e' una proprieta' della config del servizio, non uno stato che evolve) e finche' la
  // risposta non arriva il bottone resta nascosto.
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    trpc.provisioning.isConfigured.query().then(setConfigured);
  }, []);

  const start = (adbTarget: string) => {
    log(`User started agent provisioning on ${adbTarget}`, "warn");
    setBusy((current) => new Set(current).add(adbTarget));

    trpc.provisioning.provision
      .mutate(adbTarget)
      .then((result) => {
        if (!result.ok) setError(`Provisioning failed: ${result.error.message}`);
      })
      .finally(() =>
        setBusy((current) => {
          const next = new Set(current);
          next.delete(adbTarget);
          return next;
        }),
      );
  };

  return { configured, isBusy: (adbTarget: string) => busy.has(adbTarget), start };
}

// -------------------------------------------------------------------------------------
// Composizione
// -------------------------------------------------------------------------------------

export function useRegistryController(
  db: Database,
  adbDevices: readonly AdbDevice[],
  workflows: readonly { name: string }[],
) {
  const log = useServiceLogger();
  const { message, dismiss, setError, run } = useErrorSink();
  const deps: Deps = { db, log, run, setError };

  const inventory = useInventory(db);
  const devices = useDeviceControl(deps);
  const rename = useRename(deps);
  const adb = useAdbTargets(deps, adbDevices);
  const assignAdb = useAdbAssignment(deps);
  const linkSuitest = useSuitestLinking(deps);
  const linkTvCamera = useTvCameraLinking(deps, inventory.orphanCameras);
  const interventions = useInterventions(deps, workflows);
  const provisioning = useProvisioning(deps);

  return {
    error: { message, dismiss },
    inventory,
    devices,
    rename,
    adb,
    assignAdb,
    linkSuitest,
    linkTvCamera,
    interventions,
    provisioning,
  };
}

export type RegistryController = ReturnType<typeof useRegistryController>;

// Sottoinsieme che i container di riga inoltrano lungo la gerarchia control unit -> TV ->
// camera: un tipo solo al posto di un `Pick` duplicato per container.
export type RegistryRowActions = Pick<
  RegistryController,
  "devices" | "rename" | "assignAdb" | "linkSuitest" | "linkTvCamera" | "interventions" | "provisioning"
>;
