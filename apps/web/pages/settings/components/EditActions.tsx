import { Check, Close, Edit } from "@mui/icons-material";
import { Button, Stack } from "@mui/material";

// Modifica/Salva/Annulla passato come `actions` a DomainCardHeader - nascosto mentre è
// attivo il toggle JSON (nessun senso editare mentre si guarda il JSON raw).
export function EditActions({
  editing,
  saving,
  onStartEdit,
  onCancel,
  onSave,
}: {
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return editing ? (
    <Stack direction="row" sx={{ gap: 0.75 }}>
      <Button
        size="small"
        variant="contained"
        startIcon={<Check sx={{ fontSize: 14 }} />}
        onClick={onSave}
        disabled={saving}
      >
        Salva
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Close sx={{ fontSize: 14 }} />}
        onClick={onCancel}
        disabled={saving}
      >
        Annulla
      </Button>
    </Stack>
  ) : (
    <Button size="small" variant="outlined" startIcon={<Edit sx={{ fontSize: 14 }} />} onClick={onStartEdit}>
      Modifica
    </Button>
  );
}
