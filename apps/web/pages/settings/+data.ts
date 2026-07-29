import type { PageContextServer } from "vike/types";
import { trpc } from "../../trpc/client";

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(_pageContext: PageContextServer) {
  const config = await trpc.settings.getConfig.query();
  return { config };
}
