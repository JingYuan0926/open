import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import nodemailer from "nodemailer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const server = new McpServer({
  name: "axl-email-tools",
  version: "1.0.0",
});

server.tool(
  "send_email",
  "Send an email via Gmail SMTP on behalf of the AXL Email Bridge",
  {
    to: z.string().email().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Plain text email body"),
  },
  async ({ to, subject, body }) => {
    console.error(`[MCP-SERVER] Tool called: send_email → ${to}`);
    await transporter.sendMail({
      from: `"AXL Email Bridge" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: body,
    });
    console.error(`[MCP-SERVER] Email delivered to ${to}`);
    return {
      content: [{ type: "text", text: `Email delivered to ${to}` }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP-SERVER] axl-email-tools MCP server running (stdio)");
}

main().catch(console.error);
