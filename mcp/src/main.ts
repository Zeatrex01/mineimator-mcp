// Entry point: `node src/main.ts`. Reads the configuration, builds the server and serves MCP over stdio.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.ts";
import { buildServer } from "./mcp/server.ts";
import { createTools } from "./mcp/tools.ts";

await buildServer(createTools(loadConfig())).connect(new StdioServerTransport());
