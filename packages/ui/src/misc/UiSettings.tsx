import { createContext, type ReactNode, useContext } from "react";

export interface UiSettings {
  readonly defaultExpanded?: boolean;
}

const UiSettingsContext = createContext<UiSettings>({});

export function UiSettingsProvider({ value, children }: { readonly value: UiSettings; readonly children: ReactNode }) {
  return <UiSettingsContext.Provider value={value}>{children}</UiSettingsContext.Provider>;
}

export function useUiSettings(): UiSettings {
  return useContext(UiSettingsContext);
}
