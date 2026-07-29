import type { PageContextServer } from "vike/types";
import { trpc } from "../../trpc/client";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(_pageContext: PageContextServer) {
  const [registry, adbDevices] = await Promise.all([trpc.registry.getAll.query(), trpc.android.devices.query()]);
  return { registry, adbDevices };
}
