// Marchio di tipo per i primitivi (A-5): un `string` che è un `DeviceId` smette di essere
// intercambiabile con una stringa qualunque, ma a runtime resta esattamente lo stesso valore.
// Vive nel kernel perché non appartiene a nessun contesto: registry, monitoring e recovery
// marchiano tutti i propri identificatori, e nessuno di loro possiede l'idea di "marchio".

declare const witness: unique symbol;

// Il tipo base viaggia dentro il testimone insieme al tag, così `Unbrand` può recuperarlo:
// con un marchio che porta solo il tag, l'inferenza restituirebbe il tipo marchiato stesso.
export interface Branded<A, Tag extends string> {
  readonly [witness]: readonly [A, Tag];
}

export type Brand<A, Tag extends string> = A & Branded<A, Tag>;

export type Unbrand<B> = B extends Branded<infer A, string> ? A : never;

// L'unico punto in cui il marchio viene apposto. Ci si passa dopo aver validato il valore,
// mai prima: `brand` non controlla nulla, sono gli smart constructor dei singoli tipi a farlo.
export const brand = <B extends Branded<any, string>>(value: Unbrand<B>): B => value as unknown as B;
