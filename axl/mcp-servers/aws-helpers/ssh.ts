// axl/mcp-servers/aws-helpers/ssh.ts
//
// Minimal ssh2 wrapper: connect with a private-key file, run a single command,
// return stdout/stderr/exitCode. Used by install_nanoclaw to run the install script
// on the EC2 instance just launched by launch_instance.

import { Client as SshClient } from "ssh2";
import { readFileSync } from "node:fs";

export interface RemoteResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RemoteOptions {
  host: string;
  user?: string;
  keyPath: string;
  command: string;
  timeoutMs?: number;
  retries?: number;
}

export async function runRemote(opts: RemoteOptions): Promise<RemoteResult> {
  const retries = opts.retries ?? 6;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runRemoteOnce(opts);
    } catch (err) {
      lastErr = err;
      // Fresh EC2 instances often refuse SSH for the first 30-60s while sshd starts.
      // Retry with backoff before giving up.
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function runRemoteOnce(opts: RemoteOptions): Promise<RemoteResult> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error("ssh exec timeout"));
    }, opts.timeoutMs ?? 60_000);

    conn.on("ready", () => {
      conn.exec(opts.command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          return reject(err);
        }
        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout, stderr, code });
        });
        stream.on("data", (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    conn.connect({
      host: opts.host,
      username: opts.user ?? "ec2-user",
      privateKey: readFileSync(opts.keyPath),
      readyTimeout: 30_000,
    });
  });
}
