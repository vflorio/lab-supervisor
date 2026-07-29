import { Stack } from "@mui/material";
import { Fragment, type ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Lista di card pura e generica su T (candybox/tv/camera/...): non conosce alcun tipo di
// dominio, il chiamante mappa gli item e decide via `children` (render prop) come popolare
// ogni <DeviceCard>. Questo è il punto in cui la logica complessa (hook, tRPC, stato live)
// entra nel layer generico, sempre e solo dal chiamante.
// -------------------------------------------------------------------------------------

export interface DeviceCardListProps<T> {
  readonly items: readonly T[];
  readonly getKey: (item: T) => string;
  readonly children: (item: T) => ReactNode;
}

export function DeviceCardList<T>({ items, getKey, children }: DeviceCardListProps<T>) {
  return (
    <Stack sx={{ gap: 1.5 }}>
      {items.map((item) => (
        <Fragment key={getKey(item)}>{children(item)}</Fragment>
      ))}
    </Stack>
  );
}
