using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Koru — atalho global da busca rápida (padrão Win+F; configurável). Usa um "gancho" de teclado para poder
// usar até combinações que o Windows já reserva (o Win+F normal abre o Hub de Comentários).
static partial class WebHost
{
    delegate IntPtr LLProc(int code, IntPtr wp, IntPtr lp);
    [StructLayout(LayoutKind.Sequential)] struct KBD { public uint vk, scan, flags, time; public IntPtr extra; }
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, LLProc fn, IntPtr mod, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
    static IntPtr hook; static LLProc hookFn; static uint hkVk; static bool hkWin, hkCtrl, hkAlt, hkShift;

    // "Win+F", "Ctrl+Alt+Espaço", "Win+Shift+F12"... ("" desliga)
    public static void SetHotkey(string combo)
    {
        hkVk = 0; hkWin = hkCtrl = hkAlt = hkShift = false;
        foreach (var raw in (combo ?? "").Split('+'))
        {
            string p = raw.Trim().ToUpperInvariant(); if (p == "") continue;
            if (p == "WIN") hkWin = true; else if (p == "CTRL") hkCtrl = true; else if (p == "ALT") hkAlt = true; else if (p == "SHIFT") hkShift = true;
            else if (p == "ESPAÇO" || p == "SPACE") hkVk = 0x20;
            else if (p.Length == 1 && char.IsLetterOrDigit(p[0])) hkVk = p[0];
            else if (p.StartsWith("F") && p.Length <= 3) { int n; if (int.TryParse(p.Substring(1), out n) && n >= 1 && n <= 24) hkVk = (uint)(0x6F + n); }
        }
        if (hkVk == 0 || !(hkWin || hkCtrl || hkAlt)) hkVk = 0;   // precisa de pelo menos Win, Ctrl ou Alt
        if (hkVk != 0 && hook == IntPtr.Zero)
        {
            hookFn = HookProc;
            using (var p = Process.GetCurrentProcess()) using (var m = p.MainModule) hook = SetWindowsHookEx(13, hookFn, GetModuleHandle(m.ModuleName), 0);
        }
    }
    static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
    static IntPtr HookProc(int code, IntPtr wp, IntPtr lp)
    {
        try
        {
            if (code >= 0 && hkVk != 0 && ((int)wp == 0x100 || (int)wp == 0x104))
            {
                var k = (KBD)Marshal.PtrToStructure(lp, typeof(KBD));
                if (k.vk == hkVk)
                {
                    bool win = Down(0x5B) || Down(0x5C), ctrl = Down(0x11), alt = Down(0x12), shift = Down(0x10);
                    if (win == hkWin && ctrl == hkCtrl && alt == hkAlt && shift == hkShift)
                    {
                        // tecla "vazia" antes de soltar o Win: assim o menu Iniciar não abre
                        if (hkWin) { keybd_event(0xE8, 0, 0, UIntPtr.Zero); keybd_event(0xE8, 0, 2, UIntPtr.Zero); }
                        try { if (form != null) form.BeginInvoke((Action)(() => ToggleMini(true))); else miniUi.BeginInvoke((Action)(() => ToggleMini(true))); } catch { }
                        return (IntPtr)1;   // engole a tecla (o Windows não recebe o Win+F)
                    }
                }
            }
        }
        catch { }
        return CallNextHookEx(hook, code, wp, lp);
    }
    public static Control miniUi;
}
