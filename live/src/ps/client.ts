// Talks to worker.ps1: one JSON request line in, one JSON line out, strictly one at a time.
// The worker starts on the first call (compiling win.cs takes about a second) and stops after a quiet period.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { LiveError } from "../errors.ts";

const SCRIPT = join(import.meta.dirname, "worker.ps1");
const START_TIMEOUT_MS = 60_000;
const CALL_TIMEOUT_MS = 20_000;
const IDLE_MS = 120_000;

/** JSON with every non-ASCII character escaped, so the worker never depends on console encodings. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

export type WorkerReply = Record<string, unknown> & { ok: boolean };

export class Worker {
  #proc?: ChildProcessWithoutNullStreams;
  #waiters: Array<(line: string | undefined) => void> = [];
  #stderr = "";
  #queue: Promise<unknown> = Promise.resolve();
  #idle?: NodeJS.Timeout;
  /** How long the last start took (ms); 0 if the worker was already running. */
  lastStartMs = 0;

  call<T = Record<string, unknown>>(op: string, args: Record<string, unknown> = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<T & { ok: true }> {
    const run = () => this.#round<T & { ok: true }>({ op, ...args }, timeoutMs);
    const p = this.#queue.then(run, run);
    this.#queue = p.catch(() => undefined);
    return p;
  }

  stop(): void {
    clearTimeout(this.#idle);
    this.#proc?.kill();
    this.#proc = undefined;
  }

  async #round<T>(request: Record<string, unknown>, timeoutMs: number): Promise<T> {
    clearTimeout(this.#idle);
    this.lastStartMs = 0;
    if (!this.#proc) await this.#start();
    const line = await this.#readLine(() => this.#proc?.stdin.write(asciiJson(request) + "\n"), timeoutMs);
    this.#idle = setTimeout(() => this.stop(), IDLE_MS);
    this.#idle.unref();
    const reply = JSON.parse(line) as WorkerReply;
    if (!reply.ok) throw new LiveError(String(reply.code ?? "WORKER_ERROR"), String(reply.error ?? "Worker failed."));
    return reply as T;
  }

  async #start(): Promise<void> {
    const t0 = Date.now();
    this.#stderr = "";
    const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#proc = proc;
    proc.stderr.on("data", (d: Buffer) => (this.#stderr = (this.#stderr + d.toString()).slice(-2000)));
    createInterface({ input: proc.stdout }).on("line", (l) => this.#waiters.shift()?.(l));
    proc.on("exit", () => {
      if (this.#proc === proc) this.#proc = undefined;
      for (const w of this.#waiters.splice(0)) w(undefined);
    });
    const ready = await this.#readLine(() => undefined, START_TIMEOUT_MS);
    if (!ready.includes('"ready"')) throw new LiveError("WORKER_START", `PowerShell helper did not start: ${ready}`);
    this.lastStartMs = Date.now() - t0;
  }

  #readLine(send: () => void, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w !== waiter);
        this.stop(); // a stuck helper is dropped; the next call starts a fresh one
        reject(new LiveError("WORKER_TIMEOUT", `PowerShell helper gave no answer within ${timeoutMs} ms.`));
      }, timeoutMs);
      const waiter = (line: string | undefined) => {
        clearTimeout(timer);
        if (line === undefined) reject(new LiveError("WORKER_EXIT", `PowerShell helper stopped. ${this.#stderr.trim().slice(-600)}`));
        else resolve(line);
      };
      this.#waiters.push(waiter);
      send();
    });
  }
}
