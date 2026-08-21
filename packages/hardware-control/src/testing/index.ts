// Il kit con cui si mette alla prova l'ACL, e con cui si monta il supervisore senza un lab a cui
// parlare. Entrypoint separato da `index.ts` per la stessa ragione degli altri package (A-2): un
// finto non deve poter finire in produzione per distrazione di un import.

export * as FakeAdb from "./FakeAdb";
export * as FakeSuitest from "./FakeSuitest";
