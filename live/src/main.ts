// Entry point: `node src/main.ts`. Serves the live-control tools over MCP stdio.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.ts";
import { Worker } from "./ps/client.ts";
import { buildServer } from "./server.ts";

const worker = new Worker();
process.on("exit", () => worker.stop());
await buildServer({ cfg: loadConfig(), worker }).connect(new StdioServerTransport());
