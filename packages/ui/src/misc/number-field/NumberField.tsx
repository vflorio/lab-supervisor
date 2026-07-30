import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { FieldLabel } from "../FieldLabel";

export interface NumberFieldProps {
  readonly label?: string;
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly width?: number;
}

const Root = styled(BaseNumberField.Root)({
  display: "flex",
  width: "100%",
});

const Group = styled(BaseNumberField.Group)({
  display: "flex",
  alignItems: "stretch",
  width: "100%",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 4,
  "&:hover": { borderColor: "rgba(255,255,255,0.15)" },
  "&[data-focused]": { borderColor: "rgba(74,222,128,0.5)" },
  "&[data-disabled]": { opacity: 0.5 },
});

const Input = styled(BaseNumberField.Input)(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: theme.palette.text.primary,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  padding: "6px 8px",
}));

const Steppers = styled("div")({
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid rgba(255,255,255,0.07)",
});

const stepButtonStyle = ({ theme }: { theme: import("@mui/material/styles").Theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 15,
  border: "none",
  padding: 0,
  background: "transparent",
  color: theme.palette.text.secondary,
  cursor: "pointer",
  "&:hover": { color: theme.palette.text.primary, backgroundColor: "rgba(255,255,255,0.05)" },
  "&:disabled": { opacity: 0.3, cursor: "default" },
});

const Increment = styled(BaseNumberField.Increment)(stepButtonStyle);
const Decrement = styled(BaseNumberField.Decrement)(stepButtonStyle);

export function NumberField({ label, value, onChange, width }: NumberFieldProps) {
  return (
    <FieldLabel label={label} width={width}>
      <Root value={value} onValueChange={(next) => onChange(next ?? 0)}>
        <Group>
          <Input />
          <Steppers>
            <Increment>
              <KeyboardArrowUp sx={{ fontSize: 12 }} />
            </Increment>
            <Decrement>
              <KeyboardArrowDown sx={{ fontSize: 12 }} />
            </Decrement>
          </Steppers>
        </Group>
      </Root>
    </FieldLabel>
  );
}
