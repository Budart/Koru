using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Media;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Koru - Instalador")]
[assembly: AssemblyProduct("Koru")]
[assembly: AssemblyVersion("1.6.16.0")]

class Setup : Form
{
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int wp, int lp);

    static readonly Color Bg = Color.FromArgb(20, 22, 28), Panel2 = Color.FromArgb(35, 38, 46), Txt = Color.FromArgb(229, 231, 235), Muted = Color.FromArgb(148, 163, 184);
    static readonly Color Cyan = Color.FromArgb(61, 123, 255), Pink = Color.FromArgb(47, 107, 255);

    SoundPlayer player; bool muted;
    TextBox pathBox; CheckBox cDesk, cStart, cAuto, cRun;
    Button installBtn, browseBtn, muteBtn; Label status; ProgressBar bar; Panel art;
    Image logo; float phase; bool done;

    // WebView2 Runtime (motor do Edge usado pela janela do Koru): instala sozinho se faltar
    static bool HasWebView2()
    {
        const string id = @"\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        foreach (var p in new[] { @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients" + id, @"SOFTWARE\Microsoft\EdgeUpdate\Clients" + id })
            foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
                try { using (var k = hive.OpenSubKey(p)) { var v = k == null ? null : k.GetValue("pv") as string; if (!string.IsNullOrEmpty(v) && v != "0.0.0.0") return true; } } catch { }
        return false;
    }
    static void EnsureWebView2()
    {
        if (HasWebView2()) return;
        try
        {
            System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)3072;
            string f = Path.Combine(Path.GetTempPath(), "MicrosoftEdgeWebview2Setup.exe");
            Log("WebView2 ausente: baixando");
            using (var wc = new System.Net.WebClient()) wc.DownloadFile("https://go.microsoft.com/fwlink/p/?LinkId=2124703", f);
            var p = Process.Start(new ProcessStartInfo(f, "/silent /install") { UseShellExecute = true });
            if (p != null) { p.WaitForExit(10 * 60 * 1000); Log("WebView2: instalador terminou" + (p.HasExited ? " (código " + p.ExitCode + ")" : " (ainda rodando)")); }
        }
        catch (Exception e) { Log("WebView2: " + e.Message); }
    }
    static Stream Res(string n) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(n); }

    // registro da instalação (para descobrir onde parou se algo der errado): %TEMP%\Koru-instalacao.log
    static readonly string LogFile = Path.Combine(Path.GetTempPath(), "Koru-instalacao.log");
    static void Log(string m) { try { File.AppendAllText(LogFile, DateTime.Now.ToString("HH:mm:ss.fff") + "  " + m + Environment.NewLine); } catch { } }
    static void Crash(object ex)
    {
        Log("ERRO FATAL: " + ex);
        try { MessageBox.Show("A instalação parou por um erro inesperado:\n\n" + ((ex as Exception) != null ? ((Exception)ex).Message : "" + ex) + "\n\nDetalhes em:\n" + LogFile, "Koru - Instalador", MessageBoxButtons.OK, MessageBoxIcon.Error); } catch { }
    }

    [STAThread]
    static void Main()
    {
        try { File.WriteAllText(LogFile, ""); } catch { }
        Log("Instalador " + Assembly.GetExecutingAssembly().GetName().Version + " · Windows " + Environment.OSVersion + " · .NET " + Environment.Version + " · " + (Environment.Is64BitOperatingSystem ? "64" : "32") + " bits");
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (s, e) => Crash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (s, e) => Crash(e.ExceptionObject);
        try { Application.EnableVisualStyles(); Application.Run(new Setup()); }
        catch (Exception ex) { Crash(ex); }
        Log("Instalador fechado");
    }

    Setup()
    {
        Text = "Koru - Instalador"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(780, 470); BackColor = Bg; ForeColor = Txt; Font = new Font("Segoe UI", 10f);
        Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        DoubleBuffered = true;
        logo = Image.FromStream(Res("logo.png"));

        // painel da esquerda: arte animada + logo
        art = new DBPanel { Location = new Point(0, 0), Size = new Size(300, 470) };
        art.Paint += PaintArt; art.MouseDown += Drag;
        Controls.Add(art);
        var t = new System.Windows.Forms.Timer { Interval = 33 };
        t.Tick += (s, e) => { phase += 0.012f; art.Invalidate(); };
        t.Start();

        // barra superior: mute e fechar
        var close = TopBtn("\uE8BB", 735); close.Click += (s, e) => Close();
        close.FlatAppearance.MouseOverBackColor = Color.FromArgb(196, 43, 28);
        var dragBar = new Panel { Location = new Point(300, 0), Size = new Size(390, 40), BackColor = Color.Transparent };
        dragBar.MouseDown += Drag; Controls.Add(dragBar);

        int x = 336;
        Controls.Add(new Label { Text = "Instalar o Koru", Font = new Font("Segoe UI Semibold", 20f), Location = new Point(x - 2, 44), AutoSize = true });
        Controls.Add(new Label { Text = "Todos os seus emuladores e jogos num só lugar.", ForeColor = Muted, Location = new Point(x, 88), AutoSize = true });

        Controls.Add(new Label { Text = "Pasta de instalação", ForeColor = Muted, Font = new Font("Segoe UI", 9f), Location = new Point(x, 130), AutoSize = true });
        pathBox = new TextBox { Location = new Point(x, 152), Width = 300, BackColor = Panel2, ForeColor = Txt, BorderStyle = BorderStyle.FixedSingle,
            Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Koru") };
        Controls.Add(pathBox);
        browseBtn = Btn("Procurar...", new Point(x + 308, 150), 96, false);
        browseBtn.Click += (s, e) => { var p = FolderPicker.Pick(this, "Onde instalar o Koru", Directory.Exists(Path.GetDirectoryName(pathBox.Text) ?? "") ? Path.GetDirectoryName(pathBox.Text) : null); if (p != null) pathBox.Text = Path.Combine(p, "Koru"); };

        cDesk = Chk("Criar atalho na Área de Trabalho", 196);
        cStart = Chk("Criar atalho no menu Iniciar", 224);
        cAuto = Chk("Abrir na inicialização do Windows", 252);
        cRun = Chk("Abrir o Koru ao terminar", 280);

        bar = new ProgressBar { Location = new Point(x, 330), Size = new Size(404, 8), Style = ProgressBarStyle.Continuous, Visible = false };
        Controls.Add(bar);
        status = new Label { Text = "", ForeColor = Muted, Font = new Font("Segoe UI", 9f), Location = new Point(x, 344), Size = new Size(404, 20) };
        Controls.Add(status);

        installBtn = Btn("Instalar", new Point(x + 244, 400), 160, true);
        installBtn.Click += (s, e) => { if (done) { if (cRun.Checked) Launch(); Close(); } else Install(); };
        Controls.Add(new Label { Text = "v1.6.16", ForeColor = Muted, Font = new Font("Segoe UI", 8.5f), Location = new Point(x, 412), AutoSize = true });

        MouseDown += Drag;
    }

    void Drag(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, 2, 0); } }

    void ToggleMute()
    {
        muted = !muted;
        try { if (muted) player.Stop(); else player.PlayLooping(); } catch { }
        muteBtn.Text = muted ? "\uE74F" : "\uE767";
    }

    Button TopBtn(string glyph, int left)
    {
        var b = new Button { Text = glyph, Font = new Font("Segoe MDL2 Assets", 10f), Location = new Point(left, 0), Size = new Size(45, 34),
            FlatStyle = FlatStyle.Flat, BackColor = Bg, ForeColor = Txt, TabStop = false };
        b.FlatAppearance.BorderSize = 0; b.FlatAppearance.MouseOverBackColor = Color.FromArgb(40, 43, 52);
        Controls.Add(b); return b;
    }
    Button Btn(string text, Point p, int w, bool primary)
    {
        var b = new Button { Text = text, Location = p, Size = new Size(w, primary ? 42 : 27), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
            BackColor = primary ? Color.FromArgb(47, 107, 255) : Panel2, ForeColor = Color.White,
            Font = primary ? new Font("Segoe UI Semibold", 11f) : new Font("Segoe UI", 9f) };
        b.FlatAppearance.BorderSize = primary ? 0 : 1; b.FlatAppearance.BorderColor = Color.FromArgb(60, 63, 72);
        b.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(47, 107, 255) : Color.FromArgb(45, 48, 56);
        Controls.Add(b); return b;
    }
    CheckBox Chk(string text, int y)
    {
        var c = new CheckBox { Text = text, Checked = true, Location = new Point(336, y), AutoSize = true, ForeColor = Txt, FlatStyle = FlatStyle.Flat };
        Controls.Add(c); return c;
    }

    void PaintArt(object s, PaintEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        var r = art.ClientRectangle;
        using (var br = new LinearGradientBrush(r, Color.FromArgb(28, 32, 40), Color.FromArgb(20, 22, 28), 90f)) g.FillRectangle(br, r);
        // bolhas de luz se movendo
        for (int i = 0; i < 3; i++)
        {
            float a = phase * (1 + i * .3f) + i * 2.1f;
            float cx = 150 + (float)Math.Cos(a) * 90, cy = 230 + (float)Math.Sin(a * 1.3) * 140, rad = 170 - i * 30;
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(cx - rad, cy - rad, rad * 2, rad * 2);
                using (var pb = new PathGradientBrush(path))
                {
                    pb.CenterColor = i == 0 ? Color.FromArgb(60, 30, 70, 200) : i == 1 ? Color.FromArgb(70, 47, 107, 255) : Color.FromArgb(50, 61, 123, 255);
                    pb.SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) };
                    g.FillPath(pb, path);
                }
            }
        }
        // linhas de "scanline"
        using (var p = new Pen(Color.FromArgb(14, 255, 255, 255))) for (int y = 0; y < r.Height; y += 4) g.DrawLine(p, 0, y, r.Width, y);
        float bob = (float)Math.Sin(phase * 3) * 6;
        g.DrawImage(logo, new RectangleF(70, 110 + bob, 160, 160));
        using (var f = new Font("Segoe UI", 30f, FontStyle.Bold))
        using (var white = new SolidBrush(Color.White))
        {   // "KORU" em creme, letras espaçadas, como no logo
            string w = "KORU"; float sp = 12f, tw = -sp; var ws = new float[w.Length];
            for (int i = 0; i < w.Length; i++) { ws[i] = g.MeasureString(w[i].ToString(), f, 999, StringFormat.GenericTypographic).Width; tw += ws[i] + sp; }
            float x = (r.Width - tw) / 2;
            using (var cr = new SolidBrush(Color.FromArgb(244, 239, 230))) for (int i = 0; i < w.Length; i++) { g.DrawString(w[i].ToString(), f, cr, x, 292, StringFormat.GenericTypographic); x += ws[i] + sp; }
        }
        using (var f = new Font("Segoe UI", 9f)) using (var b2 = new SolidBrush(Color.FromArgb(160, 200, 205, 215)))
        {
            string t = "TODOS OS SEUS JOGOS, EM UM SÓ LUGAR";
            var sz = g.MeasureString(t, f); g.DrawString(t, f, b2, (r.Width - sz.Width) / 2, 350);
        }
    }

    void SetStatus(string t, int p) { Log(p + "% · " + t); if (IsDisposed) return; Invoke((Action)(() => { status.Text = t; bar.Value = Math.Min(100, p); })); Thread.Sleep(220); }

    string InstallDir()
    {
        string d = pathBox.Text.Trim();
        if (!Path.GetFileName(d.TrimEnd('\\')).Equals("Koru", StringComparison.OrdinalIgnoreCase)) d = Path.Combine(d, "Koru");   // sempre numa pasta própria
        return d;
    }

    void Install()
    {
        string dir = InstallDir();
        bool desk = cDesk.Checked, start = cStart.Checked, auto = cAuto.Checked;
        installBtn.Enabled = false; browseBtn.Enabled = false; pathBox.Enabled = false; bar.Visible = true;
        new Thread(() =>
        {
            try
            {
                SetStatus("Fechando versões abertas...", 8);
                int me = Process.GetCurrentProcess().Id;   // nunca fecha o próprio instalador (ex.: se o arquivo foi salvo como "Koru.exe")
                foreach (var n in new[] { "Koru", "PlayLoop", "Joggo", "Jogo", "Central de Jogos" }) foreach (var p in Process.GetProcessesByName(n)) try { if (p.Id != me) { Log("fechando " + n + " (" + p.Id + ")"); p.Kill(); p.WaitForExit(3000); } } catch (Exception e) { Log("não fechou " + n + ": " + e.Message); }
                foreach (var p in Process.GetProcesses()) try { if (p.Id != me && p.ProcessName.StartsWith(".central-antigo")) p.Kill(); } catch { }
                Thread.Sleep(500);

                SetStatus("Copiando arquivos...", 30);
                Directory.CreateDirectory(dir);
                string exe = Path.Combine(dir, "Koru.exe");
                Log("destino: " + exe);
                using (var s = Res("Koru.exe")) using (var o = File.Create(exe)) s.CopyTo(o);
                Log("copiado: " + new FileInfo(exe).Length + " bytes");

                SetStatus("Criando atalhos...", 50);
                if (desk) Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Koru.lnk"), exe);
                // menu Iniciar: pasta "Koru" com o app e o desinstalador
                string sm = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Koru");
                if (start) { Directory.CreateDirectory(sm); Shortcut(Path.Combine(sm, "Koru.lnk"), exe); Shortcut(Path.Combine(sm, "Desinstalar Koru.lnk"), exe, "--uninstall", "Desinstalar o Koru"); }
                try { var old = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Koru.lnk"); if (File.Exists(old)) File.Delete(old); } catch { }
                // desinstalador também na pasta de instalação
                Shortcut(Path.Combine(dir, "Desinstalar Koru.lnk"), exe, "--uninstall", "Desinstalar o Koru");

                SetStatus("Verificando o componente WebView2...", 60);
                EnsureWebView2();

                SetStatus("Registrando no Windows...", 68);
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Koru"))
                {
                    k.SetValue("DisplayName", "Koru"); k.SetValue("DisplayIcon", exe); k.SetValue("DisplayVersion", "1.6.16");
                    k.SetValue("Publisher", "Koru"); k.SetValue("InstallLocation", dir);
                    k.SetValue("UninstallString", "\"" + exe + "\" --uninstall"); k.SetValue("NoModify", 1); k.SetValue("NoRepair", 1);
                }
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))   // em PCs novos a chave pode não existir
                {
                    try { k.DeleteValue("CentralDeJogos", false); k.DeleteValue("Jogo", false); } catch { }
                    if (auto) k.SetValue("Koru", "\"" + exe + "\" silent"); else k.DeleteValue("Koru", false);
                }
                SaveAutostart(auto);

                SetStatus("Removendo a versão antiga...", 86);
                // versão anterior com o nome "PlayLoop" (renomeado para Koru): remove app, atalhos, registro e início automático
                try {
                    string pd = null; using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\PlayLoop")) if (k != null) pd = k.GetValue("InstallLocation") as string;
                    if (string.IsNullOrEmpty(pd)) pd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "PlayLoop");
                    if (!pd.TrimEnd('\\').Equals(dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) { foreach (var f in new[] { "PlayLoop.exe", "Desinstalar PlayLoop.lnk" }) { var p = Path.Combine(pd, f); if (File.Exists(p)) File.Delete(p); } try { Directory.Delete(pd); } catch { } }
                    else { foreach (var f in new[] { "PlayLoop.exe", "Desinstalar PlayLoop.lnk" }) { var p = Path.Combine(pd, f); if (File.Exists(p)) File.Delete(p); } }
                    Log("PlayLoop antigo removido de " + pd);
                } catch (Exception ex) { Log("falha ao remover PlayLoop: " + ex.Message); }
                try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\PlayLoop", false); } catch { }
                try { var l = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "PlayLoop.lnk"); if (File.Exists(l)) File.Delete(l); } catch { }
                try { var sm0 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "PlayLoop"); if (Directory.Exists(sm0)) Directory.Delete(sm0, true); } catch { }
                try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) k.DeleteValue("PlayLoop", false); } catch { }
                // versões anteriores ("Joggo")
                try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Joggo", false); } catch { }
                foreach (var l in new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Joggo.lnk") }) try { if (File.Exists(l)) File.Delete(l); } catch { }
                try { var sm0 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Joggo"); if (Directory.Exists(sm0)) Directory.Delete(sm0, true); } catch { }
                try { var od = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Joggo"); foreach (var f in new[] { "Joggo.exe", "Desinstalar Joggo.lnk" }) { var p = Path.Combine(od, f); if (File.Exists(p)) File.Delete(p); } try { Directory.Delete(od); } catch { } } catch { }
                try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) k.DeleteValue("Joggo", false); } catch { }
                // versão anterior com o nome "Jogo"
                try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Jogo", false); } catch { }
                foreach (var l in new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Jogo.lnk"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Jogo.lnk") }) try { if (File.Exists(l)) File.Delete(l); } catch { }
                try { var od = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Jogo"); var oe = Path.Combine(od, "Jogo.exe"); if (File.Exists(oe)) { File.Delete(oe); try { Directory.Delete(od); } catch { } } } catch { }
                string dsk = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                foreach (var f in new[] { "Central de Jogos.exe" }) try { var p = Path.Combine(dsk, f); if (File.Exists(p)) File.Delete(p); } catch { }
                try { foreach (var f in Directory.GetFiles(dsk, ".central-antigo*.exe")) try { File.Delete(f); } catch { } } catch { }

                SetStatus("Pronto! O Koru foi instalado.", 100);
                Invoke((Action)(() => { done = true; installBtn.Text = cRun.Checked ? "Abrir o Koru" : "Concluir"; installBtn.Enabled = true; }));
            }
            catch (Exception ex)
            {
                Log("ERRO: " + ex);
                if (IsDisposed) return;
                Invoke((Action)(() => { status.Text = "Erro: " + ex.Message; status.ForeColor = Color.FromArgb(255, 120, 140); installBtn.Enabled = true; browseBtn.Enabled = true; pathBox.Enabled = true; }));
            }
        }) { IsBackground = true }.Start();
    }

    // grava a opção na configuração do app (para ele respeitar a escolha)
    static void SaveAutostart(bool on)
    {
        try
        {
            string app = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "config.json");
            string f = app;
            if (!File.Exists(f)) return;   // primeira instalação: o app pergunta as pastas na primeira abertura
            var js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var cfg = (Dictionary<string, object>)js.DeserializeObject(File.ReadAllText(f));
            cfg["autostart"] = on;
            File.WriteAllText(f, js.Serialize(cfg));
        }
        catch { }
    }

    void Launch() { try { Process.Start(new ProcessStartInfo(Path.Combine(InstallDir(), "Koru.exe")) { UseShellExecute = true }); } catch { } }

    static void Shortcut(string lnk, string target, string args = "", string desc = "Koru")
    {
        try
        {
            var t = Type.GetTypeFromProgID("WScript.Shell");
            object sh = Activator.CreateInstance(t);
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { lnk });
            var st = sc.GetType();
            st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { Path.GetDirectoryName(target) });
            st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
            st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { desc });
            if (args != "") st.InvokeMember("Arguments", BindingFlags.SetProperty, null, sc, new object[] { args });
            st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
        }
        catch { }
    }

    class DBPanel : Panel { public DBPanel() { DoubleBuffered = true; } }
}
