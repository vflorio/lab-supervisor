import { SelectDialog } from "@supervisor/ui/misc/SelectDialog";
import type { TvView } from "./types";

// Riconciliazione inversa rispetto a LinkSuitestDialog: qui si parte dalla TV (il
// video-capture-device Suitest è già assegnato, non scrivibile da noi) e si sceglie quale
// camera locale orfana collegarci.
export function LinkCameraToTvDialog({
  tv,
  candidates,
  onLink,
  onClose,
}: {
  tv: TvView | null;
  candidates: readonly { id: string; primary: string; secondary?: string }[];
  onLink: (cameraId: string) => void;
  onClose: () => void;
}) {
  return (
    <SelectDialog
      open={tv !== null}
      title={`Link camera${tv ? ` - ${tv.label}` : ""}`}
      options={candidates}
      emptyMessage={
        <>
          Nessuna camera locale orfana da collegare a questa TV.
          <br />
          Verifica che Suitest abbia già assegnato un video-capture-device a questa TV e che esista una camera locale
          non ancora collegata.
        </>
      }
      onSelect={onLink}
      onClose={onClose}
    />
  );
}
