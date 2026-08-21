// Riallinea i numeri di `docs/anatomia.html` a quello che il repository contiene davvero.
// Un documento vivo comincia a mentire il giorno dopo che è stato scritto: qui i due blocchi
// marcati con `<!--stats:*-->` sono gli unici punti che citano una quantità, e questo script è
// l'unico che li scrive.
//
//   bun run docs:refresh   riscrive i blocchi
//   bun run docs:check     non scrive nulla, esce 1 se sono disallineati (utile in CI o in un hook)

const root = new URL("..", import.meta.url);
const page = new URL("docs/anatomia.html", root);

const read = async (glob: string): Promise<ReadonlyArray<string>> => {
  const files: string[] = [];
  for await (const path of new Bun.Glob(glob).scan({ cwd: root.pathname })) files.push(path);
  return files.sort();
};

const textOf = (path: string) => Bun.file(new URL(path, root)).text();

const countDistinct = (haystack: string, pattern: RegExp): number =>
  new Set([...haystack.matchAll(pattern)].map((match) => match[1])).size;

const stats = async () => {
  const packages = await read("packages/*/package.json");
  const sources = (await read("packages/*/src/**/*.ts")).filter((path) => !path.endsWith(".spec.ts"));
  const specs = [...(await read("packages/*/src/**/*.spec.ts")), ...(await read("packages/*/test/**/*.test.ts"))];

  const bodies = await Promise.all(specs.map(textOf));
  const tests = bodies.reduce((total, body) => total + [...body.matchAll(/(?:^|\s)it\(/g)].length, 0);

  const spec = await textOf("MODEL-PROMPT.md");

  return {
    packages: packages.length,
    sources: sources.length,
    tests,
    invariants: countDistinct(spec, /\bINV-(\d+)\b/g),
    scenarios: countDistinct(spec, /\*\*S(\d+)\*\*/g),
  };
};

const blocks = (counted: Awaited<ReturnType<typeof stats>>) => ({
  meta: [
    `<span>${counted.packages} package</span>`,
    `      <span>${counted.invariants} invarianti</span>`,
    `      <span>${counted.scenarios} scenari</span>`,
    `      <span>${counted.tests} test</span>`,
    "      <span>zero hardware</span>",
  ].join("\n"),
  colophon: `${counted.packages} package, ${counted.sources} file sorgente, ${counted.tests} test verdi`,
});

const replace = (html: string, name: string, body: string) => {
  const marker = new RegExp(`(<!--stats:${name}-->)[\\s\\S]*?(<!--/stats:${name}-->)`);
  if (!marker.test(html)) throw new Error(`marcatore stats:${name} assente da docs/anatomia.html`);
  return html.replace(marker, `$1${body}$2`);
};

const counted = await stats();
const current = await Bun.file(page).text();
const updated = Object.entries(blocks(counted)).reduce((html, [name, body]) => replace(html, name, body), current);

const check = Bun.argv.includes("--check");

if (updated === current) {
  console.log(`docs/anatomia.html allineato — ${counted.packages} package · ${counted.tests} test`);
} else if (check) {
  console.error("docs/anatomia.html è disallineato dal repository. Esegui `bun run docs:refresh`.");
  process.exit(1);
} else {
  await Bun.write(page, updated);
  console.log(
    `docs/anatomia.html aggiornato — ${counted.packages} package · ${counted.sources} sorgenti · ` +
      `${counted.invariants} invarianti · ${counted.scenarios} scenari · ${counted.tests} test`,
  );
}
