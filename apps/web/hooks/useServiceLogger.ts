import { useCallback } from "react";
import { trpc } from "../trpc/client";

export type ServiceLogLevel = "debug" | "info" | "warn" | "error";

export function useServiceLogger() {
  return useCallback((message: string, level: ServiceLogLevel = "info") => {
    trpc.logs.record.mutate({ level, message }).catch(() => {});
  }, []);
}
