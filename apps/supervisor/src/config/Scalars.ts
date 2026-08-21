// I tipi elementari del file di configurazione: durate, ore del giorno, tap sullo schermo.
// Sono codec io-ts perché è qui il confine (A-9): da qui in giù il resto del servizio lavora su
// `Duration`, `TimeOfDay` e `Tap`, e nessuno riparla mai di stringhe.
// Le durate si scrivono `"30s"`, `"3m"`, `"90s"`, come sul branch `main`: un numero nudo in un file
// di configurazione non dice se sono secondi o millisecondi, e la volta che lo si sbaglia il
// servizio riavvia un device ogni trenta millisecondi.

import { AdbDeviceControl } from "@lab/hardware-control";
import * as Duration from "@lab/kernel/Duration";
import * as SupervisionWindow from "@lab/recovery/domain/SupervisionWindow";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";

const unit: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

export const parseDuration = (raw: string): E.Either<string, Duration.Duration> => {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  const factor = unit[match?.[2] ?? ""];
  return match === undefined || match === null || factor === undefined
    ? E.left(`durata non riconosciuta: "${raw}" (attese forme come "500ms", "30s", "3m", "1h")`)
    : E.right(Duration.millis(Number(match[1]) * factor));
};

export const DurationFromString = new t.Type<Duration.Duration, string, unknown>(
  "Duration",
  (value): value is Duration.Duration => typeof value === "number",
  (value, context) =>
    pipe(
      t.string.validate(value, context),
      E.flatMap((raw) =>
        pipe(
          parseDuration(raw),
          E.match(
            (reason) => t.failure<Duration.Duration>(value, context, reason),
            (duration) => t.success(duration),
          ),
        ),
      ),
    ),
  (duration) => `${Duration.toMillis(duration)}ms`,
);

export const parseTimeOfDay = (raw: string): E.Either<string, SupervisionWindow.TimeOfDay> => {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  return match === null || hour > 24 || minute > 59
    ? E.left(`ora non riconosciuta: "${raw}" (attesa la forma "09:00")`)
    : E.right(SupervisionWindow.time(hour, minute));
};

export const TimeOfDayFromString = new t.Type<SupervisionWindow.TimeOfDay, string, unknown>(
  "TimeOfDay",
  (value): value is SupervisionWindow.TimeOfDay =>
    typeof value === "object" && value !== null && "hour" in value && "minute" in value,
  (value, context) =>
    pipe(
      t.string.validate(value, context),
      E.flatMap((raw) =>
        pipe(
          parseTimeOfDay(raw),
          E.match(
            (reason) => t.failure<SupervisionWindow.TimeOfDay>(value, context, reason),
            (time) => t.success(time),
          ),
        ),
      ),
    ),
  (time) => `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`,
);

export const DayOfWeekCodec = t.keyof({
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
});

// Un tap dichiara la sua unità, e non è pedanteria: sul branch `main` pixel e frazioni vivevano
// nello stesso campo e le frazioni non venivano mai risolte, cioè `input tap 0.9 0.1` — un tocco
// nell'angolo in alto a sinistra invece che sul bottone di connect.
const TapShape = t.type({
  unit: t.keyof({ pixels: null, fraction: null }),
  x: t.number,
  y: t.number,
});

export const TapCodec = new t.Type<AdbDeviceControl.Tap, t.TypeOf<typeof TapShape>, unknown>(
  "Tap",
  (value): value is AdbDeviceControl.Tap => typeof value === "object" && value !== null && "_tag" in value,
  (value, context) =>
    pipe(
      TapShape.validate(value, context),
      E.map((tap) =>
        tap.unit === "pixels" ? AdbDeviceControl.pixels(tap.x, tap.y) : AdbDeviceControl.fraction(tap.x, tap.y),
      ),
    ),
  (tap) => ({ unit: tap._tag === "Pixels" ? "pixels" : "fraction", x: tap.x, y: tap.y }),
);
