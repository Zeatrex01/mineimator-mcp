// Win32 helpers compiled once by worker.ps1 (Add-Type). Windows PowerShell 5.1 compiles C# 5: no string
// interpolation, no ?. , no expression-bodied members. Every op takes and returns flat JSON (see Handle).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class Win
{
    public delegate bool EnumProc(IntPtr h, IntPtr l);

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsHungAppWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);

    static Win()
    {
        // Physical pixels everywhere (window rects, cursor, screen capture) so they agree with each other.
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
        catch (Exception) { try { SetProcessDPIAware(); } catch (Exception) { } }
    }

    // ---------- JSON plumbing ----------

    static string Str(Dictionary<string, object> a, string k)
    {
        object v;
        return a.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : "";
    }

    static long Num(Dictionary<string, object> a, string k, long dflt)
    {
        object v;
        return a.TryGetValue(k, out v) && v != null ? Convert.ToInt64(v) : dflt;
    }

    static Dictionary<string, object> Ok()
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["ok"] = true;
        return d;
    }

    static Dictionary<string, object> Err(string code, string message)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["ok"] = false;
        d["code"] = code;
        d["error"] = message;
        return d;
    }

    static Dictionary<string, object> RectDict(int x, int y, int w, int h)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["x"] = x; d["y"] = y; d["w"] = w; d["h"] = h;
        return d;
    }

    static string Ascii(string s)
    {
        StringBuilder sb = new StringBuilder(s.Length);
        foreach (char c in s)
        {
            if (c > 126) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.ToString();
    }

    public static string Handle(string json)
    {
        JavaScriptSerializer ser = new JavaScriptSerializer();
        ser.MaxJsonLength = int.MaxValue;
        Dictionary<string, object> res;
        try
        {
            Dictionary<string, object> a = (Dictionary<string, object>)ser.DeserializeObject(json);
            string op = Str(a, "op");
            switch (op)
            {
                case "ping": res = Ok(); break;
                case "find": res = Find(a); break;
                case "focus": res = Focus(a); break;
                case "keys": res = Keys(a); break;
                case "text": res = TypeText(a); break;
                case "click": res = Click(a); break;
                case "dialogs": res = Dialogs(a); break;
                case "shot": res = Shot(a); break;
                case "sample": res = Sample(a); break;
                default: res = Err("unknown_op", "Unknown op: " + op); break;
            }
        }
        catch (Exception ex)
        {
            res = Err("worker_exception", ex.GetType().Name + ": " + ex.Message);
        }
        return Ascii(ser.Serialize(res));
    }

    // ---------- windows ----------

    static string TitleOf(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static string ClassOf(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static uint PidOf(IntPtr h)
    {
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        return pid;
    }

    static List<IntPtr> TopWindowsOf(uint pid)
    {
        List<IntPtr> list = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (PidOf(h) == pid && IsWindowVisible(h)) list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    static IntPtr MainWindowOf(uint pid)
    {
        foreach (IntPtr h in TopWindowsOf(pid))
        {
            if (GetWindow(h, 4) != IntPtr.Zero) continue; // owned window (dialog)
            if (ClassOf(h) == "#32770") continue;
            if (TitleOf(h).Length == 0) continue;
            return h;
        }
        return IntPtr.Zero;
    }

    static Dictionary<string, object> Info(IntPtr h, uint pid)
    {
        Dictionary<string, object> d = Ok();
        RECT wr, cr;
        GetWindowRect(h, out wr);
        GetClientRect(h, out cr);
        POINT origin = new POINT();
        ClientToScreen(h, ref origin);
        uint dpi = 96;
        try { dpi = GetDpiForWindow(h); } catch (Exception) { }
        d["found"] = true;
        d["pid"] = (int)pid;
        d["hwnd"] = h.ToInt64();
        d["title"] = TitleOf(h);
        d["minimized"] = IsIconic(h);
        d["foreground"] = GetForegroundWindow() == h;
        d["hung"] = IsHungAppWindow(h);
        d["dpi"] = (int)dpi;
        d["window"] = RectDict(wr.Left, wr.Top, wr.Right - wr.Left, wr.Bottom - wr.Top);
        d["client"] = RectDict(origin.X, origin.Y, cr.Right - cr.Left, cr.Bottom - cr.Top);
        return d;
    }

    static Dictionary<string, object> Find(Dictionary<string, object> a)
    {
        string exe = Str(a, "exe");
        foreach (Process p in Process.GetProcessesByName("Mine-imator"))
        {
            if (exe.Length > 0)
            {
                try
                {
                    if (!string.Equals(p.MainModule.FileName, exe, StringComparison.OrdinalIgnoreCase)) continue;
                }
                catch (Exception) { /* cannot read the path: accept by name */ }
            }
            IntPtr h = p.MainWindowHandle;
            if (h == IntPtr.Zero) h = MainWindowOf((uint)p.Id);
            if (h == IntPtr.Zero)
            {
                Dictionary<string, object> d = Ok();
                d["found"] = false;
                d["process_running"] = true;
                d["pid"] = p.Id;
                return d;
            }
            return Info(h, (uint)p.Id);
        }
        Dictionary<string, object> none = Ok();
        none["found"] = false;
        none["process_running"] = false;
        return none;
    }

    static Dictionary<string, object> Focus(Dictionary<string, object> a)
    {
        IntPtr h = new IntPtr(Num(a, "hwnd", 0));
        if (h == IntPtr.Zero) return Err("bad_hwnd", "No window handle.");
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        string method = "none";
        if (GetForegroundWindow() != h)
        {
            IntPtr fg = GetForegroundWindow();
            uint fgThread = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out PidSink);
            uint me = GetCurrentThreadId();
            bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
            BringWindowToTop(h);
            SetForegroundWindow(h);
            if (attached) AttachThreadInput(me, fgThread, false);
            method = "attach";
            Thread.Sleep(80);
            if (GetForegroundWindow() != h)
            {
                // Last resort: a synthetic Alt tap lets this process take the foreground.
                keybd_event(0x12, 0, 0, UIntPtr.Zero);
                keybd_event(0x12, 0, 2, UIntPtr.Zero);
                SetForegroundWindow(h);
                method = "alt-tap";
                Thread.Sleep(80);
            }
        }
        else method = "already";
        Dictionary<string, object> d = Ok();
        d["foreground"] = GetForegroundWindow() == h;
        d["method"] = method;
        return d;
    }

    static uint PidSink;

    static bool ForegroundIsPid(uint pid)
    {
        IntPtr fg = GetForegroundWindow();
        return fg != IntPtr.Zero && PidOf(fg) == pid;
    }

    static Dictionary<string, object> Dialogs(Dictionary<string, object> a)
    {
        uint pid = (uint)Num(a, "pid", 0);
        ArrayList list = new ArrayList();
        foreach (IntPtr h in TopWindowsOf(pid))
        {
            if (ClassOf(h) != "#32770") continue;
            bool field = false;
            EnumChildWindows(h, delegate(IntPtr c, IntPtr l)
            {
                string cls = ClassOf(c);
                if (cls == "Edit" || cls == "ComboBoxEx32") field = true;
                return true;
            }, IntPtr.Zero);
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["hwnd"] = h.ToInt64();
            d["title"] = TitleOf(h);
            d["has_text_field"] = field;
            d["foreground"] = GetForegroundWindow() == h;
            list.Add(d);
        }
        Dictionary<string, object> res = Ok();
        res["dialogs"] = list;
        return res;
    }

    // ---------- input ----------

    static bool IsExtended(uint vk)
    {
        return (vk >= 0x21 && vk <= 0x28) || vk == 0x2d || vk == 0x2e;
    }

    static INPUT KeyInput(uint vk, bool up)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.u.ki.wVk = (ushort)vk;
        i.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        i.u.ki.dwFlags = (up ? 2u : 0u) | (IsExtended(vk) ? 1u : 0u);
        return i;
    }

    static void Send(INPUT[] inputs)
    {
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != inputs.Length) throw new Exception("SendInput sent " + sent + " of " + inputs.Length + " (blocked by another window or an elevated app?).");
    }

    static Dictionary<string, object> Keys(Dictionary<string, object> a)
    {
        uint pid = (uint)Num(a, "pid", 0);
        if (!ForegroundIsPid(pid)) return Err("not_foreground", "The foreground window does not belong to Mine-imator; keys not sent.");
        int hold = (int)Num(a, "hold_ms", 50);
        int gap = (int)Num(a, "gap_ms", 60);
        int sentChords = 0;
        foreach (object o in (IEnumerable)a["chords"])
        {
            Dictionary<string, object> c = (Dictionary<string, object>)o;
            List<uint> mods = new List<uint>();
            foreach (object m in (IEnumerable)c["mods"]) mods.Add(Convert.ToUInt32(m));
            uint key = Convert.ToUInt32(c["key"]);
            foreach (uint m in mods) Send(new INPUT[] { KeyInput(m, false) });
            Send(new INPUT[] { KeyInput(key, false) });
            Thread.Sleep(hold);
            Send(new INPUT[] { KeyInput(key, true) });
            for (int i = mods.Count - 1; i >= 0; i--) Send(new INPUT[] { KeyInput(mods[i], true) });
            sentChords++;
            Thread.Sleep(gap);
        }
        Dictionary<string, object> d = Ok();
        d["chords_sent"] = sentChords;
        return d;
    }

    static Dictionary<string, object> TypeText(Dictionary<string, object> a)
    {
        uint pid = (uint)Num(a, "pid", 0);
        if (!ForegroundIsPid(pid)) return Err("not_foreground", "The foreground window does not belong to Mine-imator; text not sent.");
        string text = Str(a, "text");
        INPUT[] inputs = new INPUT[text.Length * 2];
        for (int i = 0; i < text.Length; i++)
        {
            INPUT down = new INPUT();
            down.type = 1;
            down.u.ki.wScan = text[i];
            down.u.ki.dwFlags = 4; // KEYEVENTF_UNICODE
            INPUT up = down;
            up.u.ki.dwFlags = 4 | 2;
            inputs[2 * i] = down;
            inputs[2 * i + 1] = up;
        }
        Send(inputs);
        Dictionary<string, object> d = Ok();
        d["chars"] = text.Length;
        return d;
    }

    static Dictionary<string, object> Click(Dictionary<string, object> a)
    {
        uint pid = (uint)Num(a, "pid", 0);
        if (!ForegroundIsPid(pid)) return Err("not_foreground", "The foreground window does not belong to Mine-imator; click not sent.");
        int x = (int)Num(a, "x", 0), y = (int)Num(a, "y", 0);
        bool right = Str(a, "button") == "right";
        SetCursorPos(x, y);
        Thread.Sleep(40);
        POINT p;
        GetCursorPos(out p);
        INPUT down = new INPUT();
        down.type = 0;
        down.u.mi.dwFlags = right ? 8u : 2u;
        INPUT up = down;
        up.u.mi.dwFlags = right ? 16u : 4u;
        Send(new INPUT[] { down });
        Thread.Sleep(50);
        Send(new INPUT[] { up });
        Dictionary<string, object> d = Ok();
        d["cursor_x"] = p.X;
        d["cursor_y"] = p.Y;
        return d;
    }

    // ---------- capture ----------

    static Bitmap CaptureClient(IntPtr h)
    {
        if (IsIconic(h)) throw new Exception("The window is minimized; nothing to capture.");
        RECT cr;
        GetClientRect(h, out cr);
        POINT origin = new POINT();
        ClientToScreen(h, ref origin);
        int w = cr.Right - cr.Left, hh = cr.Bottom - cr.Top;
        if (w <= 0 || hh <= 0) throw new Exception("The window has no visible client area.");
        Bitmap bmp = new Bitmap(w, hh, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.CopyFromScreen(origin.X, origin.Y, 0, 0, new Size(w, hh), CopyPixelOperation.SourceCopy);
        }
        return bmp;
    }

    static Bitmap Resize(Bitmap src, int w, int h)
    {
        Bitmap dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
        using (Graphics g = Graphics.FromImage(dst))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, new Rectangle(0, 0, w, h), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel);
        }
        return dst;
    }

    static Dictionary<string, object> Shot(Dictionary<string, object> a)
    {
        IntPtr h = new IntPtr(Num(a, "hwnd", 0));
        int outW = (int)Num(a, "width", 0), outH = (int)Num(a, "height", 0);
        using (Bitmap full = CaptureClient(h))
        {
            Bitmap img = (outW > 0 && outH > 0 && (outW != full.Width || outH != full.Height)) ? Resize(full, outW, outH) : full;
            try
            {
                using (MemoryStream ms = new MemoryStream())
                {
                    img.Save(ms, ImageFormat.Png);
                    Dictionary<string, object> d = Ok();
                    d["png_base64"] = Convert.ToBase64String(ms.ToArray());
                    d["width"] = img.Width;
                    d["height"] = img.Height;
                    d["client_w"] = full.Width;
                    d["client_h"] = full.Height;
                    return d;
                }
            }
            finally
            {
                if (!object.ReferenceEquals(img, full)) img.Dispose();
            }
        }
    }

    // A 192x108 grayscale sample of the client area, used only to tell whether the picture is changing.
    static Dictionary<string, object> Sample(Dictionary<string, object> a)
    {
        IntPtr h = new IntPtr(Num(a, "hwnd", 0));
        const int W = 192, H = 108;
        using (Bitmap full = CaptureClient(h))
        using (Bitmap small = Resize(full, W, H))
        {
            BitmapData bd = small.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            byte[] raw = new byte[bd.Stride * H];
            Marshal.Copy(bd.Scan0, raw, 0, raw.Length);
            small.UnlockBits(bd);
            byte[] gray = new byte[W * H];
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    int o = y * bd.Stride + x * 3; // BGR
                    gray[y * W + x] = (byte)((raw[o + 2] * 30 + raw[o + 1] * 59 + raw[o] * 11) / 100);
                }
            Dictionary<string, object> d = Ok();
            d["gray_base64"] = Convert.ToBase64String(gray);
            return d;
        }
    }
}
