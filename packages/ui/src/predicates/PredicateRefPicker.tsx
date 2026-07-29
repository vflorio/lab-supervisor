import { Autocomplete, Box, Chip, Stack, TextField, Typography } from "@mui/material";

// Un predicato osservato dal tracking live (vedi trpc.tracking.snapshot) - il chiamante
// fornisce la lista, questo componente resta puro/senza IO.
export interface PredicateOption {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
}

// Picker con ricerca per un singolo nome di predicato, usato dallo step "Predicate" del
// TripwireWizard - equivalente del PredicatePicker "server-driven" del mockup figma, qui
// alimentato dai predicati realmente osservati invece di una lista mock.
export interface PredicateRefPickerProps {
  readonly options: readonly PredicateOption[];
  readonly value: string;
  readonly onChange: (name: string) => void;
}

export function PredicateRefPicker({ options, value, onChange }: PredicateRefPickerProps) {
  const uniqueByName = Array.from(new Map(options.map((option) => [option.name, option])).values());
  const selected = uniqueByName.find((option) => option.name === value) ?? null;

  return (
    <Autocomplete
      options={uniqueByName}
      value={selected}
      onChange={(_, option) => onChange(option?.name ?? "")}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, current) => option.name === current.name}
      renderInput={(params) => (
        <TextField {...params} size="small" label="predicate" placeholder="Cerca predicate..." />
      )}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.name}>
          <Stack sx={{ gap: 0.25 }}>
            <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
              <Typography variant="body2">{option.name}</Typography>
              <Chip label={option.domain} size="small" />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {option.entityId}
            </Typography>
          </Stack>
        </Box>
      )}
    />
  );
}
