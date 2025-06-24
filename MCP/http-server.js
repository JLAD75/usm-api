import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { server } from "./server-logic.js"; // importe tes tools MCP ici

import chalk from "chalk";

const app = express();
app.use(express.json());

const transports = {};

// Middleware de log pour toutes les requêtes
app.use((req, res, next) => {
  next();
});

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport;

  try {
    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`[MCP] Session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };
      await server.connect(transport);
    } else {
      console.warn(`[MCP] Rejected request: No valid session`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("[MCP] MCP transport error:", e);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Internal MCP server error" },
        id: null,
      });
    }
  }
});

const MCP_PORT = process.env.MCP_PORT || 3100;
app.listen(MCP_PORT, () => {
  const sep = chalk.gray("──────────────────────────────────────────────");
  console.log(`\n${sep}`);
  console.log(chalk.bold.cyanBright("🤖  MCP Server prêt !"));
  console.log(
    chalk.yellowBright("🔗  MCP endpoint: ") +
      chalk.bold.white(`http://localhost:${MCP_PORT}/mcp`)
  );
  console.log(
    chalk.gray("📦  Node ") +
      process.version +
      chalk.gray(" | ") +
      chalk.cyan(`PID: ${process.pid}`)
  );
  console.log(`${sep}\n`);
});
