// The PowerShell helper: it must compile win.cs and answer read-only questions. Windows only; touches no window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "../src/ps/client.ts";

test("the helper compiles, answers ping and reports a missing window without error", { skip: process.platform !== "win32" }, async () => {
  const worker = new Worker();
  try {
    assert.equal((await worker.call("ping")).ok, true);
    assert.ok(worker.lastStartMs >= 0);
    const r = await worker.call<{ found: boolean }>("find", { exe: "C:\\no\\such\\Mine-imator.exe" });
    assert.equal(r.found, false);
    await assert.rejects(worker.call("nope"), (e: { code?: string }) => e.code === "unknown_op");
    const d = await worker.call<{ dialogs: unknown[] }>("dialogs", { pid: 0 });
    assert.deepEqual(d.dialogs, []);
  } finally {
    worker.stop();
  }
});
