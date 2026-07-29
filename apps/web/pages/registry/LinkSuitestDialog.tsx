import { SelectDialog } from "@supervisor/ui/SelectDialog";
import type { LinkingTarget } from "./types";

export function LinkSuitestDialog({
  target,
  candidates,
  onLink,
  onClose,
}: {
  target: LinkingTarget | null;
  candidates: readonly { id: string; primary: string; secondary?: string }[];
  onLink: (videoCaptureDeviceId: string) => void;
  onClose: () => void;
}) {
  return (
    <SelectDialog
      open={target !== null}
      title="Link Suitest video capture device"
      selectedId={target?.currentVideoCaptureDeviceId}
      options={candidates}
      emptyMessage={
        <>
          Nessun device Suitest disponibile per il collegamento.
          <br />
          Verifica che la sync con Suitest sia andata a buon fine.
        </>
      }
      onSelect={onLink}
      onClose={onClose}
    />
  );
}
