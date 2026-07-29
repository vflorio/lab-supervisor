import { reload } from "vike/client/router";
import { trpc } from "../../trpc/client";

// -------------------------------------------------------------------------------------
// tRPC dispatch (per-kind, identità diversa: `id` per control unit/camera/adb, `deviceId`
// per la TV)
// -------------------------------------------------------------------------------------

export const mutations = {
  candybox: trpc.registry.candyboxes,
  camera: trpc.registry.cameras,
  tv: trpc.registry.tvs,
  adb: trpc.registry.adb,
} as const;

export async function mutate<T>(
  fn: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>,
  setError: (msg: string | null) => void,
) {
  const result = await fn();
  if (result.ok) {
    setError(null);
    await reload();
  } else {
    setError(result.error.message);
  }
}
