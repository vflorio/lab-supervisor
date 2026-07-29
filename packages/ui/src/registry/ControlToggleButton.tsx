import { Button } from "@mui/material";

// Sostituisce il Checkbox "controlled" di EntryRow con una label esplicita.
export interface ControlToggleButtonProps {
  readonly controlled: boolean;
  readonly onToggle: () => void;
  readonly controlledLabel?: string;
  readonly notControlledLabel?: string;
}

export function ControlToggleButton({
  controlled,
  onToggle,
  controlledLabel = "Controlled",
  notControlledLabel = "Not controlled",
}: ControlToggleButtonProps) {
  return (
    <Button
      size="small"
      variant={controlled ? "contained" : "outlined"}
      color={controlled ? "primary" : "inherit"}
      onClick={onToggle}
    >
      {controlled ? controlledLabel : notControlledLabel}
    </Button>
  );
}
