// open_project: Ctrl+O, type the path in the file dialog, Enter, then confirm through the window title.
import { existsSync } from "node:fs";
import { LiveError } from "../errors.ts";
import { hasUnsavedMarker, normaliseProjectPath, projectName, titleShowsProject } from "../paths.ts";
import { readProjectName } from "../project-meta.ts";
import { ensureFocused, requireWindow, type Ctx } from "../context.ts";
import { parseKeys } from "../keys.ts";
import { sleep, waitFor } from "../util.ts";

interface Dialog {
  hwnd: number;
  title: string;
  has_text_field: boolean;
  foreground: boolean;
}

const dialogs = async (ctx: Ctx, pid: number) => (await ctx.worker.call<{ dialogs: Dialog[] }>("dialogs", { pid })).dialogs;
const fileDialog = async (ctx: Ctx, pid: number) => (await dialogs(ctx, pid)).find((d) => d.has_text_field);

const DIALOG_TIMEOUT_MS = 6000;
const CLOSE_TIMEOUT_MS = 5000;
const TITLE_TIMEOUT_MS = 20_000;
const SAVE_TIMEOUT_MS = 15_000;

export async function openProject(ctx: Ctx, args: { path: string; if_unsaved?: "refuse" | "save" }) {
  const path = normaliseProjectPath(args.path);
  if (!existsSync(path)) throw new LiveError("NOT_FOUND", `No such file: ${path}`);
  // The title shows the name stored inside the file, which can differ from the file name.
  const names = [readProjectName(path), projectName(path)];
  const name = names[0] ?? names[1];
  const t0 = Date.now();

  const w = await ensureFocused(ctx);
  const titleBefore = w.title;
  const send = (keys: string) => ctx.worker.call("keys", { pid: w.pid, chords: parseKeys(keys).map((c) => ({ mods: c.mods, key: c.key })) });

  if (hasUnsavedMarker(titleBefore)) {
    if (args.if_unsaved !== "save") {
      throw new LiveError(
        "UNSAVED_CHANGES",
        `The open project has unsaved changes (title "${titleBefore}"). Mine-imator would ask to save, and later keys could answer it. Nothing was sent. Save it yourself, or call again with if_unsaved "save" to press Ctrl+S first.`,
        { title: titleBefore },
      );
    }
    await send("ctrl+s");
    const saved = await waitFor(async () => (hasUnsavedMarker((await requireWindow(ctx)).title) ? undefined : true), SAVE_TIMEOUT_MS, 250);
    if (!saved) throw new LiveError("SAVE_NOT_CONFIRMED", `Ctrl+S was sent but the title still shows unsaved changes after ${SAVE_TIMEOUT_MS / 1000} s. Nothing else was sent.`);
  }

  await send("ctrl+o");
  const dialog = await waitFor(() => fileDialog(ctx, w.pid), DIALOG_TIMEOUT_MS, 150);
  const dialogMs = Date.now() - t0;
  if (!dialog) {
    const seen = await dialogs(ctx, w.pid);
    throw new LiveError(
      "DIALOG_NOT_FOUND",
      seen.length
        ? `A dialog "${seen[0].title}" is open but it is not a file dialog (probably "save changes?"). Nothing was typed; answer it by hand or with press/click.`
        : `No file dialog appeared within ${DIALOG_TIMEOUT_MS} ms of Ctrl+O. Mine-imator may be busy, a text box may have the keyboard, or Ctrl+O was rebound.`,
      { title: (await requireWindow(ctx)).title, dialogs: seen },
    );
  }

  // The dialog has the keyboard focus on its file-name box; type the full path and confirm.
  await sleep(150);
  await ctx.worker.call("text", { pid: w.pid, text: path });
  await sleep(100);
  await send("enter");
  const closed = await waitFor(async () => ((await fileDialog(ctx, w.pid)) ? undefined : true), CLOSE_TIMEOUT_MS, 150);
  const closeMs = Date.now() - t0 - dialogMs;

  const confirmed = await waitFor(async () => {
    const now = await requireWindow(ctx);
    return titleShowsProject(now.title, names) ? now.title : undefined;
  }, TITLE_TIMEOUT_MS, 250);
  const final = await requireWindow(ctx);

  return {
    path,
    confirmed: Boolean(confirmed),
    confirmed_by: confirmed ? "window title" : "none",
    title_before: titleBefore,
    title_after: final.title,
    dialog_closed: Boolean(closed),
    note: confirmed
      ? `Title now shows "${name}".`
      : `NOT confirmed: the title never showed "${name}" within ${TITLE_TIMEOUT_MS / 1000} s. Take a screenshot to see what happened.`,
    steps_ms: { dialog_appeared: dialogMs, dialog_closed: closeMs, total: Date.now() - t0 },
  };
}
