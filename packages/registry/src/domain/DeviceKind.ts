// I tre tipi di device che il lab contiene oggi. Lo smart plug non è ancora un kind: il suo
// controllo è fuori scope in questo giro, non vietato (FATTO-5, NF-3). Quando arriverà, questa
// union cresce di un caso e il resto del modello non se ne accorge.

export type DeviceKind = "ControlUnit" | "Tv" | "AndroidCamera";

export const all: ReadonlyArray<DeviceKind> = ["ControlUnit", "Tv", "AndroidCamera"];
