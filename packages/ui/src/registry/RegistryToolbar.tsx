import { Dns, Tv, Videocam } from "@mui/icons-material";
import { Chip, MenuItem, Select, type SelectChangeEvent, Stack, Tooltip, Typography } from "@mui/material";

export type SortBy = "name" | "ip";
export type VisibleType = "candybox" | "tv" | "camera" | "smartplug";
export type TriState = boolean | null;

const TYPE_CHIPS: { readonly type: VisibleType; readonly label: string; readonly icon: React.ReactElement }[] = [
  { type: "candybox", label: "CUs", icon: <Dns fontSize="small" /> },
  { type: "tv", label: "TVs", icon: <Tv fontSize="small" /> },
  { type: "camera", label: "Cameras", icon: <Videocam fontSize="small" /> },
  { type: "smartplug", label: "SmartPlugs", icon: <Dns fontSize="small" /> },
];

export interface RegistryToolbarProps {
  readonly sortBy: SortBy;
  readonly onSortByChange: (value: SortBy) => void;
  readonly visibleTypes: ReadonlySet<VisibleType>;
  readonly onToggleType: (type: VisibleType) => void;
  readonly controlled: TriState;
  readonly onToggleControlled: () => void;
  readonly inUse: TriState;
  readonly onToggleInUse: () => void;
  readonly errorKindOptions: readonly string[];
  readonly errorKinds: ReadonlySet<string>;
  readonly onToggleErrorKind: (kind: string) => void;
}

const triStateLabel = (base: string, value: TriState) => (value === null ? base : `${base}: ${value ? "Sì" : "No"}`);
const triStateColor = (value: TriState) => (value === true ? "success" : value === false ? "error" : "default");

// Toolbar della Homepage: sort + toggle di visibilità per tipo device + filtri. Stesso
// vocabolario visivo di LogFiltersPanel (Select per il sort, Chip per i toggle multi-stato) -
// nessuno stato interno, il chiamante (Registry.tsx) possiede sort/visibleTypes/filtri.
export function RegistryToolbar({
  sortBy,
  onSortByChange,
  visibleTypes,
  onToggleType,
  controlled,
  onToggleControlled,
  inUse,
  onToggleInUse,
  errorKindOptions,
  errorKinds,
  onToggleErrorKind,
}: RegistryToolbarProps) {
  return (
    <Stack sx={{ gap: 1.25, mt: 2 }}>
      <Stack direction="row" sx={{ gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
          <Typography sx={{ fontSize: 11 }} color="text.secondary">
            Ordina per
          </Typography>
          <Select
            size="small"
            variant="standard"
            value={sortBy}
            onChange={(event: SelectChangeEvent) => onSortByChange(event.target.value as SortBy)}
            sx={{ fontSize: 12, width: 80 }}
          >
            <MenuItem value="name" sx={{ fontSize: 12 }}>
              Nome
            </MenuItem>
            <MenuItem value="ip" sx={{ fontSize: 12 }}>
              IP
            </MenuItem>
          </Select>
        </Stack>

        <Stack direction="row" sx={{ gap: 0.5 }}>
          {TYPE_CHIPS.map(({ type, label, icon }) =>
            type === "smartplug" ? (
              <Tooltip key={type} title="Non ancora supportato">
                <span>
                  <Chip size="small" variant="outlined" icon={icon} label={label} disabled />
                </span>
              </Tooltip>
            ) : (
              <Chip
                key={type}
                size="small"
                icon={icon}
                label={label}
                variant={visibleTypes.has(type) ? "filled" : "outlined"}
                color={visibleTypes.has(type) ? "primary" : "default"}
                onClick={() => onToggleType(type)}
              />
            ),
          )}
        </Stack>

        <Stack direction="row" sx={{ gap: 0.5 }}>
          <Chip
            size="small"
            label={triStateLabel("Abilitato", controlled)}
            color={triStateColor(controlled)}
            variant={controlled === null ? "outlined" : "filled"}
            onClick={onToggleControlled}
          />
          <Chip
            size="small"
            label={triStateLabel("In Uso", inUse)}
            color={triStateColor(inUse)}
            variant={inUse === null ? "outlined" : "filled"}
            onClick={onToggleInUse}
          />
        </Stack>
      </Stack>

      {errorKindOptions.length > 0 && (
        <Stack direction="row" sx={{ gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 11 }} color="text.secondary">
            By error state
          </Typography>
          {errorKindOptions.map((kind) => (
            <Chip
              key={kind}
              size="small"
              label={kind}
              variant={errorKinds.has(kind) ? "filled" : "outlined"}
              color={errorKinds.has(kind) ? "error" : "default"}
              onClick={() => onToggleErrorKind(kind)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
