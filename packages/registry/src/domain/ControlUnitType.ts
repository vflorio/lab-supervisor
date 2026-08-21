// I quattro tipi di ControlUnit distinti da Suitest (FATTO-1). Nel lab esistono solo Raspberry
// Pi (`candybox`), ma il tipo resta completo perché è ciò che l'anagrafica legge dall'esterno.
// Non è una capability: quali comandi quella singola unità accetti lo dice `Device.capabilities`.

export type ControlUnitType = "candybox" | "drive" | "personal-pi" | "solo-candy";

export const all: ReadonlyArray<ControlUnitType> = ["candybox", "drive", "personal-pi", "solo-candy"];
