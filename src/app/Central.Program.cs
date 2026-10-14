using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

// Koru — ponto de entrada e instância única
static partial class Central
{
    static void KillOldScriptServer()
    {
        try
        {
            using (var q = new ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'powershell.exe' OR Name = 'pwsh.exe' OR Name LIKE '.central-antigo%' OR Name = 'Central de Jogos.exe' OR Name = 'Koru.exe' OR Name = 'Jogo.exe' OR Name = 'Joggo.exe'"))
                foreach (ManagementObject p in q.Get())
                {
                    var cl = (p["CommandLine"] ?? "").ToString();
                    int pid = Convert.ToInt32(p["ProcessId"]);
                    if (pid != Process.GetCurrentProcess().Id && (cl.Contains("CENTRAL_BAT") || cl.Contains(".central-antigo") || cl.Contains("Central de Jogos.exe") || cl.Contains("\\Koru.exe") || cl.Contains("\\Jogo.exe") || cl.Contains("\\Joggo.exe")))
                        try { Process.GetProcessById(Convert.ToInt32(p["ProcessId"])).Kill(); } catch { }
                }
            Thread.Sleep(800);
        }
        catch { }
        foreach (var old in Directory.GetFiles(Path.GetDirectoryName(ExePath), ".central-antigo*.exe")) { try { File.Delete(old); } catch { } }
        try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) { } } catch { }
    }

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    public static void CrashLog(string kind, Exception ex)
    {
        try { string d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos"); Directory.CreateDirectory(d); File.AppendAllText(Path.Combine(d, "koru-erros.log"), DateTime.Now.ToString("s") + " [" + kind + "] " + ex + "\r\n\r\n"); } catch { }
    }
    [STAThread]
    static void Main(string[] argv)
    {
        // nitidez em telas com escala (125%/150%, ex.: 1440p): o app desenha em pixels reais em vez de o Windows "esticar" a janela
        try { if (!SetProcessDpiAwarenessContext((IntPtr)(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch { } }
        bool silent = argv.Any(a => a.Equals("silent", StringComparison.OrdinalIgnoreCase));

        if (argv.Any(a => a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase))) { Uninstall(); return; }
        try { if (!NeedsSetup) ApplyAutostart(LoadConfig()); } catch { }

        foreach (var old in Directory.GetFiles(Path.GetDirectoryName(ExePath), ".central-antigo*.exe")) { try { File.Delete(old); } catch { } }
        // uma instância só: se já estiver rodando, pede para a outra mostrar a janela e sai
        bool first;
        var mutex = new Mutex(true, @"Local\Koru.Instance", out first);
        var showEvt = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Koru.Show");
        if (!first) { if (!silent) showEvt.Set(); return; }
        if (Process.GetProcesses().Any(pr => { try { var n = pr.ProcessName; return pr.Id != Process.GetCurrentProcess().Id && (n == "Koru" || n == "Joggo" || n == "Jogo" || n == "Central de Jogos" || n.StartsWith(".central-antigo")); } catch { return false; } }))
            KillOldScriptServer();          // versão antiga (com servidor local) ainda aberta
        ThreadPool.SetMinThreads(48, 48);   // várias capas/vídeos baixando ao mesmo tempo não travam a interface
        try { WebHost.Prepare(); } catch { }
        WebHost.Handler = Handle;

        // nada derruba o app sem deixar registro: erros inesperados vão para %LOCALAPPDATA%\CentralDeJogos\koru-erros.log
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (s, e) => CrashLog("ui", e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (s, e) => CrashLog("fatal", e.ExceptionObject as Exception);
        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (s, e) => { CrashLog("task", e.Exception); e.SetObserved(); };
        Application.EnableVisualStyles();
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir o Koru", null, (s, e) => OpenBrowser());
        menu.Items.Add("Editar configuração", null, (s, e) =>
        {
            OpenBrowser("config");
        });
        menu.Items.Add("Abrir pasta dos emuladores", null, (s, e) => { try { Process.Start("explorer.exe", "\"" + Root(LoadConfig()) + "\""); } catch { } });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Sair", null, (s, e) => Application.Exit());

        var tray = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(ExePath),
            Text = "Koru",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) try { WebHost.ToggleMini(); } catch (Exception ex) { CrashLog("mini", ex); } };   // um clique: mini busca
        tray.DoubleClick += (s, e) => OpenBrowser();
        var ui = new Control(); var h = ui.Handle;   // para voltar à thread da interface
        WebHost.miniUi = ui;
        try { var c0 = LoadConfig(); WebHost.SetHotkey(c0.ContainsKey("miniHotkey") ? S(c0, "miniHotkey") : "Win+F"); } catch { }
        new Thread(() => { while (true) { showEvt.WaitOne(); try { ui.BeginInvoke((Action)(() => OpenBrowser())); } catch { } } }) { IsBackground = true }.Start();
        if (!silent) OpenBrowser();
        Application.Run();
        GC.KeepAlive(mutex);
        tray.Visible = false;
    }
}
