import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

const config: Config = {
  // https://vike.dev/head-tags
  title: "Lab Supervisor",
  description: "Monitor and recover lab devices",

  passToClient: ["user"],
  extends: [vikeReact],
};

export default config;
