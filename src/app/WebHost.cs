using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Janela própria sem barra de título (WebView2 = motor do Edge embutido)
static partial class WebHost
{
    static string BinDir;
    // janela sem borda, mas redimensionável pelas bordas (faixa de 6 px em volta)
    class HostForm : Form
    {
        const int G = 6;
        public HostForm() { MinimumSize = new Size(640, 420); }
        FormWindowState before = FormWindowState.Maximized;
        public bool Full;
        // tela cheia: sem bordas e cobrindo a tela toda (inclusive a barra de tarefas)
        public void ToggleFull()
        {
            if (!Full) { before = WindowState; WindowState = FormWindowState.Normal; FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Maximized; Full = true; }
            else { FormBorderStyle = FormBorderStyle.Sizable; WindowState = FormWindowState.Normal; WindowState = before; Full = false; }
        }
    }
    static HostForm form;
    static bool fxFull;
    static WebView2 view;
    static bool ready;
    static string pending;
    // a página é servida de um endereço virtual: o WebView2 entrega cada requisição direto ao C# (sem porta, sem servidor)
    public const string BaseUrl = "https://koru.example/";
    public static Action<Ctx> Handler;
    static CoreWebView2Environment env;

    // ---- jogos abrem no mesmo monitor do Koru ----
    static IntPtr FormHandle;
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out WRECT r);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [StructLayout(LayoutKind.Sequential)] struct WRECT { public int L, T, R, B; }
    static Screen AppScreen() { try { return FormHandle != IntPtr.Zero ? Screen.FromHandle(FormHandle) : Screen.PrimaryScreen; } catch { return Screen.PrimaryScreen; } }
    // move a janela para o monitor do Koru (tela cheia sem borda acompanha o tamanho do monitor)
    static void Place(IntPtr h)
    {
        if (h == IntPtr.Zero || h == FormHandle || !IsWindowVisible(h)) return;
        var dst = AppScreen(); var src = Screen.FromHandle(h);
        if (src.DeviceName == dst.DeviceName) return;
        WRECT r; if (!GetWindowRect(h, out r)) return;
        const uint NOZORDER = 0x4, NOACTIVATE = 0x10, NOSIZE = 0x1;
        bool full = r.L <= src.Bounds.Left && r.T <= src.Bounds.Top && r.R >= src.Bounds.Right && r.B >= src.Bounds.Bottom;
        if (full) SetWindowPos(h, IntPtr.Zero, dst.Bounds.X, dst.Bounds.Y, dst.Bounds.Width, dst.Bounds.Height, NOZORDER | NOACTIVATE);
        else
        {
            int w = r.R - r.L, hh = r.B - r.T, wa = dst.WorkingArea.Width, ha = dst.WorkingArea.Height;
            int x = dst.WorkingArea.X + Math.Max(0, Math.Min(wa - w, r.L - src.WorkingArea.X));
            int y = dst.WorkingArea.Y + Math.Max(0, Math.Min(ha - hh, r.T - src.WorkingArea.Y));
            SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, NOZORDER | NOACTIVATE | NOSIZE);
        }
    }
    // emulador: acompanha a janela principal do processo por 20 s (alguns recriam a janela ao entrar em tela cheia)
    public static void FollowToAppScreen(Process p)
    {
        if (p == null) return;
        new Thread(() =>
        {
            var until = DateTime.Now.AddSeconds(20);
            while (DateTime.Now < until)
            {
                try { if (p.HasExited) return; p.Refresh(); Place(p.MainWindowHandle); } catch { return; }
                Thread.Sleep(200);
            }
        }) { IsBackground = true }.Start();
    }
    // jogo de PC (Steam, Epic, atalho...): a janela nova em primeiro plano vai para o monitor do Koru
    public static void FollowForeground()
    {
        IntPtr start = GetForegroundWindow();
        new Thread(() =>
        {
            var until = DateTime.Now.AddSeconds(90); DateTime stopAt = DateTime.MaxValue; bool found = false;
            while (DateTime.Now < until && DateTime.Now < stopAt)
            {
                try
                {
                    IntPtr fg = GetForegroundWindow();
                    if (fg != IntPtr.Zero && fg != start && fg != FormHandle)
                    {
                        uint pid; GetWindowThreadProcessId(fg, out pid);
                        string n = ""; try { n = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { }
                        bool store = n.Contains("steam") || n.Contains("epicgames") || n == "explorer" || n.Contains("galaxyclient") || n.Contains("eadesktop") || n.Contains("ubisoftconnect") || n == "koru";
                        if (!store) { if (!found) { found = true; stopAt = DateTime.Now.AddSeconds(20); WatchGame((int)pid, fg); } Place(fg); }
                    }
                }
                catch { }
                Thread.Sleep(250);
            }
            if (!found) GameEnded();
        }) { IsBackground = true }.Start();
    }

    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int wp, int lp);

    // extrai as DLLs do WebView2 (embutidas no .exe) para %LOCALAPPDATA%
    public static void Prepare()
    {
        BinDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "bin");
        Directory.CreateDirectory(BinDir);
        Extract("Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Core.dll");
        Extract("Microsoft.Web.WebView2.WinForms.dll", "Microsoft.Web.WebView2.WinForms.dll");
        Extract(Environment.Is64BitProcess ? "WebView2Loader.x64.dll" : "WebView2Loader.x86.dll", "WebView2Loader.dll");
        AppDomain.CurrentDomain.AssemblyResolve += (s, e) =>
        {
            string f = Path.Combine(BinDir, new AssemblyName(e.Name).Name + ".dll");
            return File.Exists(f) ? Assembly.LoadFrom(f) : null;
        };
    }
    static void Extract(string res, string file)
    {
        string dest = Path.Combine(BinDir, file);
        using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(res))
        {
            if (File.Exists(dest) && new FileInfo(dest).Length == s.Length) return;
            try { using (var o = File.Create(dest)) s.CopyTo(o); } catch { }
        }
    }

    public static void Show(string path)
    {
        if (form == null || form.IsDisposed) Create();
        if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Maximized;
        form.Show(); form.Activate();
        if (path != null) Navigate(path);
    }

    static void Navigate(string path)
    {
        if (ready) view.CoreWebView2.Navigate(BaseUrl + path);
        else pending = path;
    }

    static void Create()
    {
        form = new HostForm
        {
            Text = "Koru",
            FormBorderStyle = FormBorderStyle.Sizable,
            BackColor = Color.FromArgb(18, 18, 18),
            StartPosition = FormStartPosition.CenterScreen,
            Size = new Size(1400, 860),
            Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location)
        };
        form.WindowState = FormWindowState.Maximized;
        view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(18, 18, 18) };
        form.Controls.Add(view);
        // o controle só funciona com o foco dentro da página: devolve o foco ao WebView sempre que a janela é ativada
        form.Activated += (s, e) => { try { if (PlayerOn) FocusPlayer(); else if (view != null && !GameOn) view.Focus(); } catch { } };
        // janela sem foco / minimizada: vídeo mudo e pausado, e o WebView2 usa menos memória
        form.Activated += (s, e) => { try { if (ready) { view.CoreWebView2.ExecuteScriptAsync("window.vidAwaySet&&vidAwaySet(false)"); view.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal; } } catch { } };
        form.Deactivate += (s, e) => { try { if (ready) { view.CoreWebView2.ExecuteScriptAsync("window.vidAwaySet&&vidAwaySet(true)"); view.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low; } } catch { } };
        form.FormClosing += (s, e) => { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; form.Hide(); } };
        form.Shown += async (s, e) =>
        {
            FormHandle = form.Handle;
            StartGuidePoll();
            try
            {
                CoreWebView2Environment.SetLoaderDllFolderPath(BinDir);
                string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "WebView2");
                // sem isso o Chromium "congela" a página enquanto o jogo cobre a janela (timers e imagens param e demoram a voltar)
                var opts = new CoreWebView2EnvironmentOptions("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required");
                env = await CoreWebView2Environment.CreateAsync(null, data, opts);
                await view.EnsureCoreWebView2Async(env);
                view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                view.CoreWebView2.Settings.IsStatusBarEnabled = false;
                view.CoreWebView2.WebMessageReceived += (o, m) => OnMessage(m.TryGetWebMessageAsString());
                // o motor da página caiu (falta de memória, driver de vídeo...): registra e recarrega em vez de a janela "sumir"
                view.CoreWebView2.ProcessFailed += (o, a) =>
                {
                    Central.CrashLog("webview", new Exception("ProcessFailed: " + a.ProcessFailedKind + " / " + a.Reason));
                    try { form.BeginInvoke((Action)(() => { try { if (a.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) { Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 2 >nul & start \"\" \"" + Application.ExecutablePath + "\"") { CreateNoWindow = true, UseShellExecute = false }); Environment.Exit(0); } else view.CoreWebView2.Reload(); } catch { } })); } catch { }
                };
                view.CoreWebView2.AddWebResourceRequestedFilter(BaseUrl + "*", CoreWebView2WebResourceContext.All);
                view.CoreWebView2.WebResourceRequested += OnRequest;
                // links externos (target=_blank) abrem no navegador padrão
                view.CoreWebView2.NewWindowRequested += (o, a) => { a.Handled = true; if (a.Uri.StartsWith("https://")) try { Process.Start(a.Uri); } catch { } };
                ready = true;
                view.CoreWebView2.Navigate(BaseUrl + (pending ?? ""));
                pending = null;
            }
            catch (Exception ex)
            {
                form.Hide();
                if (ex is WebView2RuntimeNotFoundException) ShowMissingRuntime(ex.Message);
                else MessageBox.Show("Não foi possível abrir a janela do Koru:\n" + ex.Message, "Koru", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };
    }

    public static void ShowMissingRuntime(string detail)
    {
        if (MessageBox.Show("O Koru precisa do Microsoft Edge WebView2 Runtime, que não foi encontrado neste PC (" + detail + ").\n\nAbrir a página de download agora?",
            "Koru", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
            try { Process.Start("https://developer.microsoft.com/microsoft-edge/webview2/#download-section"); } catch { }
    }

    // requisição da página → Central.Handle numa thread de fundo → resposta de volta na thread da interface
    static void OnRequest(object sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        string url = e.Request.Uri, method = e.Request.Method;
        byte[] body = null;
        try { var st = e.Request.Content; if (st != null) { var ms = new MemoryStream(); st.CopyTo(ms); body = ms.ToArray(); } } catch { }
        // abrir jogo / escolher emulador nunca esperam na fila (capas e vídeos podem estar ocupando as threads)
        if (url.Contains("/api/vfile?")) { ServeVideo(e, deferral); return; }
        bool urgent = url.Contains("/api/launch") || url.Contains("/api/setemu");
        Action work = () =>
        {
            var ctx = new Ctx { Request = new Req(url, method, body) };
            try { Handler(ctx); } catch (Exception ex) { ctx.Response.StatusCode = 500; ctx.Response.OutputStream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(ex.Message)); }
            var r = ctx.Response;
            byte[] bytes = r.OutputStream.ToArray();
            var hdr = new System.Text.StringBuilder("Content-Type: " + r.ContentType);
            if (!r.Headers.ContainsKey("Cache-Control")) r.Headers["Cache-Control"] = "no-store";
            foreach (var kv in r.Headers) hdr.Append("\r\n" + kv.Key + ": " + kv.Value);
            form.BeginInvoke((Action)(() =>
            {
                try { e.Response = env.CreateWebResourceResponse(new MemoryStream(bytes), r.StatusCode, r.StatusCode == 200 ? "OK" : "Error", hdr.ToString()); }
                catch { }
                finally { deferral.Complete(); }
            }));
        };
        if (urgent) new Thread(() => work()) { IsBackground = true }.Start();
        else Task.Run(work);
    }


    // ---------- jogo aberto: o foco vai para o jogo; o app só volta a aceitar comandos quando o jogo fecha ----------
    public static volatile bool GameOn;
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    static void Post(string m) { try { form.BeginInvoke((Action)(() => { try { view.CoreWebView2.PostWebMessageAsString(m); } catch { } })); } catch { } }
    static void ForceForeground(IntPtr h)
    {
        if (h == IntPtr.Zero) return;
        try { AllowSetForegroundWindow(-1); keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); if (IsIconic(h)) ShowWindow(h, 9); BringWindowToTop(h); SetForegroundWindow(h); } catch { }
    }
    // emulador: chamado logo após Process.Start
    public static void GameStarted(Process p)
    {
        GameOn = true; Post("game:on");
        if (p == null) return;   // jogo de PC: FollowForeground cuida
        new Thread(() =>
        {
            var until = DateTime.Now.AddSeconds(20); bool focused = false;
            try
            {
                while (!p.HasExited && DateTime.Now < until && !focused)
                {
                    p.Refresh(); IntPtr h = p.MainWindowHandle;
                    if (h != IntPtr.Zero && IsWindowVisible(h)) { ForceForeground(h); focused = true; }
                    else Thread.Sleep(150);
                }
                p.WaitForExit();
            }
            catch { }
            GameEnded();
        }) { IsBackground = true }.Start();
    }
    static void WatchGame(int pid, IntPtr h)
    {
        ForceForeground(h);
        new Thread(() => { try { Process.GetProcessById(pid).WaitForExit(); } catch { } GameEnded(); }) { IsBackground = true }.Start();
    }
    static void GameEnded()
    {
        if (!GameOn) return;
        GameOn = false; Post("game:off");
        // o jogo fechou: se nenhuma outra janela tomou a frente, o Koru volta a ter o foco
        try
        {
            IntPtr fg = GetForegroundWindow(); string n = "";
            if (fg != IntPtr.Zero) { uint pid; GetWindowThreadProcessId(fg, out pid); try { n = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { } }
            if (fg == IntPtr.Zero || n == "explorer" || fg == FormHandle) form.BeginInvoke((Action)(() => { ForceForeground(FormHandle); try { view.Focus(); } catch { } }));
        }
        catch { }
    }
    // ---------- botão Home do controle (Guide do Xbox / PS via Steam ou DS4Windows): traz o Koru para a frente ----------
    [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern int XInputGetStateEx14(int i, byte[] st);
    [DllImport("xinput1_3.dll", EntryPoint = "#100")] static extern int XInputGetStateEx13(int i, byte[] st);
    static void StartGuidePoll()
    {
        new Thread(() =>
        {
            int ver = 14; bool[] was = new bool[4]; var st = new byte[64];
            while (true)
            {
                bool padUsed = false;
                for (int i = 0; i < 4; i++)
                {
                    int r;
                    try { r = ver == 14 ? XInputGetStateEx14(i, st) : XInputGetStateEx13(i, st); }
                    catch { if (ver == 14) { ver = 13; continue; } return; }
                    if (r == 0 && PlayerOn && !padUsed) { padUsed = true; var b0 = BitConverter.ToUInt16(st, 4); byte l0 = st[6], r0 = st[7]; try { PadPlayer(b0, l0, r0); } catch { } }
                    bool down = r == 0 && (BitConverter.ToUInt16(st, 4) & 0x0400) != 0;
                    if (down && !was[i]) form.BeginInvoke((Action)ShowFromHome);
                    was[i] = down;
                }
                Thread.Sleep(PlayerOn ? 30 : 80);
            }
        }) { IsBackground = true, Priority = ThreadPriority.BelowNormal }.Start();
    }
    static void ShowFromHome()
    {
        try
        {
            if (GetForegroundWindow() == FormHandle && form.Visible) return;
            GameOn = false; Post("game:off");
            if (!form.Visible) form.Show();
            if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Maximized;
            ForceForeground(form.Handle); view.Focus();
        }
        catch { }
    }

    static void OnMessage(string msg)
    {
        switch (msg)
        {
            case "min": form.WindowState = FormWindowState.Minimized; break;
            case "max":
                form.WindowState = form.WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; break;
            case "close": form.Hide(); break;
            case "fs": form.ToggleFull(); fxFull = false; view.Focus(); break;
            // animação "Bom jogo.": o app vai para tela cheia de verdade e volta ao normal depois
            case "fxon": if (!form.Full && form.WindowState != FormWindowState.Minimized) { form.ToggleFull(); fxFull = true; view.Focus(); } break;
            case "fxoff": if (fxFull) { fxFull = false; if (form.Full) form.ToggleFull(); } if (!GameOn) view.Focus(); break;
            case "gameoff": GameOn = false; break;
            case "drag":
                // arrastar pela barra: o Windows cuida de encaixar nas laterais (Aero Snap) e de restaurar se estiver maximizada
                ReleaseCapture(); SendMessage(form.Handle, 0xA1, 2, 0); break;
        }
    }
}
