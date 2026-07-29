// https://vike.dev/Head

import logoUrl from "../assets/logo.svg";

export function Head() {
  return (
    <>
      <link rel="icon" href={logoUrl} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      />
    </>
  );
}
