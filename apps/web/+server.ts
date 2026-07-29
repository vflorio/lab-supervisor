import vike, { toFetchHandler } from "@vikejs/express";
import express from "express";
import type { Server } from "vike/types";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function getHandler() {
  const app = express();
  vike(app);
  return toFetchHandler(app);
}

// https://vike.dev/server
export default {
  fetch: getHandler(),
  prod: { port },
} as Server;
