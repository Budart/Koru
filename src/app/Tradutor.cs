using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Koru — Tradutor de Tela (integrado): janela translúcida que lê o texto que está atrás dela
// (OCR nativo do Windows) e desenha a tradução por cima, no mesmo lugar (estilo câmera do Google Tradutor)
static class Tradutor
{
    static readonly string[][] Langs = {
        new[] { "Detectar automaticamente", "auto", "" }, new[] { "Português", "pt", "pt-BR" }, new[] { "Inglês", "en", "en-US" }, new[] { "Espanhol", "es", "es-ES" },
        new[] { "Francês", "fr", "fr-FR" }, new[] { "Alemão", "de", "de-DE" }, new[] { "Italiano", "it", "it-IT" }, new[] { "Japonês", "ja", "ja-JP" },
        new[] { "Coreano", "ko", "ko-KR" }, new[] { "Chinês (simpl.)", "zh-CN", "zh-CN" }, new[] { "Chinês (trad.)", "zh-TW", "zh-TW" }, new[] { "Russo", "ru", "ru-RU" },
        new[] { "Árabe", "ar", "ar-SA" }, new[] { "Holandês", "nl", "nl-NL" }, new[] { "Polonês", "pl", "pl-PL" }, new[] { "Turco", "tr", "tr-TR" } };
    static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "tradutor");
    static Overlay win;
    public static void Open()
    {
        if (win != null && !win.IsDisposed) { win.Show(); if (win.WindowState == FormWindowState.Minimized) win.WindowState = FormWindowState.Normal; win.Activate(); return; }
        win = new Overlay(); win.Show();
    }
    public static void Close() { try { if (win != null && !win.IsDisposed) win.Close(); } catch { } Ocr.Stop(); }

    // ---------- configuração (últimos idiomas) ----------
    static string CfgFile { get { return Path.Combine(Dir, "config.json"); } }
    static Dictionary<string, object> LoadCfg() { try { return (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(File.ReadAllText(CfgFile)); } catch { return new Dictionary<string, object>(); } }
    static void SaveCfg(string src, string dst) { try { Directory.CreateDirectory(Dir); File.WriteAllText(CfgFile, new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "src", src }, { "dst", dst } })); } catch { } }

    // ---------- OCR nativo do Windows (Windows.Media.Ocr), por um PowerShell que fica aberto ----------
    class MissingLang : Exception { public string Tag; public MissingLang(string t) : base(t) { Tag = t; } }
    static class Ocr
    {
        static Process ps; static StreamWriter inW; static StreamReader outR; static readonly object L = new object();
        const string Script = @"$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asT = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asT.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$engines = @{}
while ($true) {
  $line = [Console]::In.ReadLine(); if ($line -eq $null) { break }
  try {
    $req = $line | ConvertFrom-Json
    $tag = [string]$req.lang
    if (-not $engines.ContainsKey($tag)) {
      if ($tag -eq '') { $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
      else { $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($tag)); if ($e -eq $null) { $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($tag.Split('-')[0])) } }
      if ($e -eq $null) { [Console]::Out.WriteLine((@{ missing = $tag } | ConvertTo-Json -Compress)); [Console]::Out.Flush(); continue }
      $engines[$tag] = $e
    }
    $f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($req.path)) ([Windows.Storage.StorageFile])
    $s = Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $d = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $b = Await ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r = Await ($engines[$tag].RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
    $out = @()
    foreach ($ln in $r.Lines) {
      $x0 = 1e9; $y0 = 1e9; $x1 = -1; $y1 = -1
      foreach ($w in $ln.Words) { $q = $w.BoundingRect; if ($q.X -lt $x0) { $x0 = $q.X }; if ($q.Y -lt $y0) { $y0 = $q.Y }; if ($q.X + $q.Width -gt $x1) { $x1 = $q.X + $q.Width }; if ($q.Y + $q.Height -gt $y1) { $y1 = $q.Y + $q.Height } }
      if ($x1 -ge 0) { $out += @{ t = $ln.Text; x = $x0; y = $y0; w = $x1 - $x0; h = $y1 - $y0 } }
    }
    $s.Dispose(); $b.Dispose()
    [Console]::Out.WriteLine((@{ lines = @($out) } | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush()
  } catch { [Console]::Out.WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
}";
        static void Start()
        {
            Directory.CreateDirectory(Dir); string sf = Path.Combine(Dir, "ocr.ps1"); File.WriteAllText(sf, Script, new UTF8Encoding(true));
            var psi = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"), "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + sf + "\"")
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, StandardOutputEncoding = Encoding.UTF8 };
            ps = Process.Start(psi); WebHost.Tie(ps);
            inW = ps.StandardInput; inW.AutoFlush = true; outR = ps.StandardOutput;
        }
        public static void Stop() { lock (L) { try { if (ps != null && !ps.HasExited) ps.Kill(); } catch { } ps = null; } }
        public static List<Tuple<string, RectangleF>> Recognize(Bitmap img, string tag)
        {
            lock (L)
            {
                if (ps == null || ps.HasExited) Start();
                // o OCR do Windows tem tamanho máximo de imagem: reduz se precisar
                double scale = 1; int maxd = 2600; Bitmap use = img;
                if (Math.Max(img.Width, img.Height) > maxd) { scale = (double)maxd / Math.Max(img.Width, img.Height); use = new Bitmap(img, (int)(img.Width * scale), (int)(img.Height * scale)); }
                string f = Path.Combine(Dir, "shot.png"); use.Save(f, ImageFormat.Png); if (use != img) use.Dispose();
                inW.WriteLine(new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "path", f }, { "lang", tag ?? "" } }));
                string line = outR.ReadLine(); if (line == null) { Stop(); throw new Exception("o leitor de texto do Windows fechou"); }
                var o = (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(line);
                if (o.ContainsKey("missing")) throw new MissingLang(tag);
                if (o.ContainsKey("error")) throw new Exception("OCR: " + o["error"]);
                var res = new List<Tuple<string, RectangleF>>();
                if (o["lines"] is object[])
                    foreach (Dictionary<string, object> l in (object[])o["lines"])
                    {
                        Func<string, float> n = k => (float)(Convert.ToDouble(l[k]) / scale);
                        res.Add(Tuple.Create(Convert.ToString(l["t"]), new RectangleF(n("x"), n("y"), n("w"), n("h"))));
                    }
                return res;
            }
        }
    }

    // ---------- tradução (Google Tradutor, endpoint público) com cache e ritmo ----------
    static class Tr
    {
        static readonly Dictionary<string, string> cache = new Dictionary<string, string>(); static DateTime last = DateTime.MinValue, blocked = DateTime.MinValue;
        static string Call(string text, string src, string dst)
        {
            var wait = 400 - (DateTime.Now - last).TotalMilliseconds; if (wait > 0) Thread.Sleep((int)wait);
            if (DateTime.Now < blocked) throw new Exception("O Google limitou as traduções; tentando de novo em instantes…");
            last = DateTime.Now;
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
            using (var wc = new WebClient { Encoding = Encoding.UTF8 })
            {
                wc.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"; wc.Headers[HttpRequestHeader.ContentType] = "application/x-www-form-urlencoded;charset=UTF-8";
                string r;
                try { r = wc.UploadString("https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=" + src + "&tl=" + dst, "q=" + Uri.EscapeDataString(text)); }
                catch (WebException ex) { var hr = ex.Response as HttpWebResponse; if (hr != null && (int)hr.StatusCode == 429) { blocked = DateTime.Now.AddSeconds(30); throw new Exception("O Google limitou as traduções; tentando de novo em 30 s…"); } throw; }
                var j = (object[])new JavaScriptSerializer().DeserializeObject(r); var sb = new StringBuilder();
                foreach (var seg in (object[])j[0]) { var a = seg as object[]; if (a != null && a.Length > 0 && a[0] != null) sb.Append(a[0]); }
                return sb.ToString();
            }
        }
        public static List<string> Translate(List<string> lines, string src, string dst)
        {
            Func<string, string> K = l => src + "|" + dst + "|" + l;
            var todo = lines.Distinct().Where(l => !cache.ContainsKey(K(l))).ToList();
            var chunks = new List<List<string>>(); var cur = new List<string>(); int len = 0;
            foreach (var l in todo) { if (cur.Count > 0 && len + l.Length > 4500) { chunks.Add(cur); cur = new List<string>(); len = 0; } cur.Add(l); len += l.Length + 1; }
            if (cur.Count > 0) chunks.Add(cur);
            foreach (var ch in chunks)
            {
                var parts = Call(string.Join("\n", ch), src, dst).Split('\n').ToList();
                if (parts.Count != ch.Count) parts = ch.Take(15).Select(x => Call(x, src, dst)).Concat(ch.Skip(15)).ToList();   // o Google juntou/quebrou linhas: uma a uma
                for (int i = 0; i < ch.Count; i++) cache[K(ch[i])] = parts[i].Trim() == "" ? ch[i] : parts[i].Trim();
            }
            return lines.Select(l => { string v; return cache.TryGetValue(K(l), out v) ? v : l; }).ToList();
        }
    }

    class Item { public string Text; public Rectangle R; public Color Bg, Fg; }

    // ---------- janela ----------
    class Overlay : Form
    {
        [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr h, uint a);
        [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dst, ref Point pd, ref Size sz, IntPtr src, ref Point ps, int key, ref Blend bl, int flags);
        [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h); [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
        [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc); [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o); [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i); [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
        [StructLayout(LayoutKind.Sequential, Pack = 1)] struct Blend { public byte Op, Flags, Alpha, Format; }

        List<Item> items = new List<Item>(); string status = ""; bool ghost, busy, paused; string lastHash;
        string src, dst; readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer { Interval = 700 }, topT = new System.Windows.Forms.Timer { Interval = 500 }, moveT = new System.Windows.Forms.Timer { Interval = 250 };
        LangPanel panel; Form unghost; bool menuOpen;
        Rectangle bIcon, bGhost, bMin, bMax, bClose; string hot = "";

        public Overlay()
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = true; TopMost = true; StartPosition = FormStartPosition.Manual; Text = "Tradutor de Tela";
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            MinimumSize = new Size(160, 60);
            var ag = Screen.PrimaryScreen.WorkingArea; int w = (int)(ag.Width * .7), h = Math.Max((int)(ag.Height * .21), 130);
            Bounds = new Rectangle(ag.X + (ag.Width - w) / 2, ag.Bottom - h - (int)(ag.Height * .04), w, h);
            var c = LoadCfg(); src = c.ContainsKey("src") ? c["src"] as string : null; dst = c.ContainsKey("dst") ? c["dst"] as string : null;
            tick.Tick += (s, e) => Tick(); topT.Tick += (s, e) => KeepTop(); moveT.Tick += (s, e) => { moveT.Stop(); lastHash = null; Tick(); };
            topT.Start(); if (src != null && dst != null) tick.Start(); else status = "Clique em 文A e escolha os idiomas.";
            KeyPreview = true; KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) Close(); };
        }
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x80000; /* WS_EX_LAYERED */ return cp; } }
        protected override void OnShown(EventArgs e) { base.OnShown(e); try { SetWindowDisplayAffinity(Handle, 0x11); } catch { } Render(); KeepTop(); if (src != null && dst != null) Force(); }
        protected override void OnSizeChanged(EventArgs e) { base.OnSizeChanged(e); Invalidate2(); }
        protected override void OnLocationChanged(EventArgs e) { base.OnLocationChanged(e); Invalidate2(); }
        void Invalidate2() { if (items.Count > 0) items = new List<Item>(); Render(); moveT.Stop(); moveT.Start(); }
        protected override void OnFormClosed(FormClosedEventArgs e) { tick.Stop(); topT.Stop(); try { if (unghost != null) unghost.Close(); if (panel != null) panel.Close(); } catch { } base.OnFormClosed(e); }
        void KeepTop() { if (WindowState == FormWindowState.Minimized || menuOpen || (panel != null && !panel.IsDisposed && panel.Visible)) return; SetWindowPos(Handle, (IntPtr)(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); if (unghost != null && unghost.Visible) SetWindowPos(unghost.Handle, (IntPtr)(-1), 0, 0, 0, 0, 0x13); }

        // borda para redimensionar, botões, resto arrasta a janela
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x84 && WindowState == FormWindowState.Normal)   // WM_NCHITTEST
            {
                var p = PointToClient(new Point((short)(m.LParam.ToInt64() & 0xFFFF), (short)((m.LParam.ToInt64() >> 16) & 0xFFFF)));
                int b = 8; bool l = p.X < b, r = p.X >= Width - b, t = p.Y < b, bo = p.Y >= Height - b;
                if (t && l) m.Result = (IntPtr)13; else if (t && r) m.Result = (IntPtr)14; else if (bo && l) m.Result = (IntPtr)16; else if (bo && r) m.Result = (IntPtr)17;
                else if (l) m.Result = (IntPtr)10; else if (r) m.Result = (IntPtr)11; else if (t) m.Result = (IntPtr)12; else if (bo) m.Result = (IntPtr)15;
                else if (!ghost && Buttons().Any(x => x.Value.Contains(p))) m.Result = (IntPtr)1; else m.Result = (IntPtr)2;   // HTCLIENT / HTCAPTION
                return;
            }
            if (m.Msg == 0xA5) { ShowMenu(Cursor.Position); return; }   // WM_NCRBUTTONUP: botão direito na área de arrastar
            base.WndProc(ref m);
        }
        Dictionary<string, Rectangle> Buttons() { return new Dictionary<string, Rectangle> { { "icon", bIcon }, { "ghost", bGhost }, { "min", bMin }, { "max", bMax }, { "close", bClose } }; }
        protected override void OnMouseMove(MouseEventArgs e) { string h = Buttons().Where(x => x.Value.Contains(e.Location)).Select(x => x.Key).FirstOrDefault() ?? ""; if (h != hot) { hot = h; Render(); } Cursor = h != "" ? Cursors.Hand : Cursors.Default; }
        protected override void OnMouseLeave(EventArgs e) { if (hot != "") { hot = ""; Render(); } }
        protected override void OnMouseUp(MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right) { ShowMenu(Cursor.Position); return; }
            var k = Buttons().Where(x => x.Value.Contains(e.Location)).Select(x => x.Key).FirstOrDefault();
            if (k == "close") Close(); else if (k == "min") WindowState = FormWindowState.Minimized;
            else if (k == "max") { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; Render(); }
            else if (k == "ghost") SetGhost(true); else if (k == "icon") TogglePanel();
        }
        void ShowMenu(Point at) { var m = new ContextMenuStrip { Renderer = new ToolStripProfessionalRenderer(new DarkColors()), ForeColor = Color.White, ShowImageMargin = false, Font = new Font("Segoe UI", 9.5f) }; menuOpen = true; m.Closed += (s, e) => { menuOpen = false; BeginInvoke((Action)(() => m.Dispose())); }; m.Items.Add("Idiomas…", null, (s, e) => TogglePanel()); m.Items.Add("Modo fantasma", null, (s, e) => SetGhost(true)); m.Items.Add(new ToolStripSeparator()); m.Items.Add("Fechar", null, (s, e) => Close()); m.Show(at); }

        void TogglePanel()
        {
            if (panel == null || panel.IsDisposed) { panel = new LangPanel(src, dst); panel.Changed += (a, b) => { src = a; dst = b; LangsChanged(); }; }
            if (panel.Visible) { panel.Hide(); return; }
            panel.Location = PointToScreen(new Point(6, 32)); panel.Show(this); try { SetWindowDisplayAffinity(panel.Handle, 0x11); } catch { }
        }
        void LangsChanged()
        {
            if (src != null && dst != null) SaveCfg(src, dst);
            items = new List<Item>(); status = ""; lastHash = null; paused = false;
            if (src != null && dst != null) { tick.Start(); Force(); } else tick.Stop();
            Render();
        }
        void SetGhost(bool on)
        {
            ghost = on; if (panel != null) panel.Hide();
            int st = GetWindowLong(Handle, -20); st = on ? (st | 0x80000 | 0x20) : (st & ~0x20); SetWindowLong(Handle, -20, st);
            if (on)
            {
                if (unghost == null || unghost.IsDisposed)
                {
                    unghost = new GhostBack(); unghost.Click += (s, e) => SetGhost(false);
                }
                var g = Bounds; unghost.Location = new Point(g.Right - unghost.Width - 164, g.Top > 40 ? g.Top - unghost.Height - 2 : g.Top + 4);
                unghost.Show(); try { SetWindowDisplayAffinity(unghost.Handle, 0x11); } catch { }
            }
            else if (unghost != null) unghost.Hide();
            Render(); KeepTop();
        }

        // ---------- ciclo: captura → OCR → tradução ----------
        void Force() { lastHash = null; Tick(); }
        void Tick()
        {
            if (src == null || dst == null || WindowState == FormWindowState.Minimized || busy || paused) return;
            busy = true; var r = Bounds; string s = src, d = dst;
            new Thread(() =>
            {
                try
                {
                    using (var img = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb))
                    {
                        using (var g = Graphics.FromImage(img)) g.CopyFromScreen(r.Location, Point.Empty, r.Size);   // a própria janela não aparece na captura
                        string h = Hash(img) + s + d + r.Width + "x" + r.Height; if (h == lastHash) return; lastHash = h;
                        string tag = Langs.First(x => x[1] == s)[2];
                        List<Tuple<string, RectangleF>> lines;
                        try { lines = Ocr.Recognize(img, tag); }
                        catch (MissingLang) { paused = true; BeginInvoke((Action)(() => Missing(tag))); return; }
                        lines = lines.Where(x => x.Item1.Trim() != "" && x.Item2.Width > 2 && x.Item2.Height > 2).ToList();
                        var res = new List<Item>();
                        if (lines.Count > 0)
                        {
                            var texts = Tr.Translate(lines.Select(x => x.Item1).ToList(), s, d);
                            var px = Pixels(img);
                            for (int i = 0; i < lines.Count; i++)
                            {
                                var q = lines[i].Item2; Color bg, fg; Colors(px, img.Width, img.Height, (int)q.X, (int)q.Y, (int)q.Width, (int)q.Height, out bg, out fg);
                                float pad = q.Height * .15f;
                                res.Add(new Item { Text = texts[i], R = new Rectangle((int)(q.X - pad), (int)(q.Y - pad), (int)(q.Width + 2 * pad) + 1, (int)(q.Height + 2 * pad) + 1), Bg = bg, Fg = fg });
                            }
                        }
                        BeginInvoke((Action)(() => { items = res; status = ""; Render(); }));
                    }
                }
                catch (Exception ex) { lastHash = null; try { BeginInvoke((Action)(() => { status = ex.Message; Render(); })); } catch { } }
                finally { busy = false; }
            }) { IsBackground = true }.Start();
        }
        static string Hash(Bitmap b) { using (var sm = new Bitmap(b, 48, 48)) { var sb = new StringBuilder(); for (int y = 0; y < 48; y += 3) for (int x = 0; x < 48; x += 3) sb.Append(sm.GetPixel(x, y).ToArgb().ToString("x")); return sb.ToString().GetHashCode().ToString(); } }
        static int[] Pixels(Bitmap b) { var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb); var a = new int[b.Width * b.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length); b.UnlockBits(d); return a; }
        // cor de fundo = mediana da borda da linha; cor do texto = média dos pontos mais diferentes do fundo
        static void Colors(int[] px, int W, int H, int x, int y, int w, int h, out Color bg, out Color fg)
        {
            int x0 = Math.Max(x - 3, 0), y0 = Math.Max(y - 3, 0), x1 = Math.Min(x + w + 3, W), y1 = Math.Min(y + h + 3, H);
            if (x1 <= x0 || y1 <= y0) { bg = Color.Black; fg = Color.White; return; }
            var border = new List<int>();
            for (int i = x0; i < x1; i++) { border.Add(px[y0 * W + i]); border.Add(px[(y1 - 1) * W + i]); }
            for (int j = y0; j < y1; j++) { border.Add(px[j * W + x0]); border.Add(px[j * W + x1 - 1]); }
            Func<Func<Color, int>, int> med = f => { var l = border.Select(c => f(Color.FromArgb(c))).OrderBy(v => v).ToList(); return l[l.Count / 2]; };
            int br = med(c => c.R), bgG = med(c => c.G), bb = med(c => c.B); bg = Color.FromArgb(br, bgG, bb);
            var dist = new List<Tuple<int, int>>(); int step = Math.Max(1, (x1 - x0) * (y1 - y0) / 4000);
            for (int j = y0; j < y1; j++) for (int i = x0; i < x1; i += step) { int c = px[j * W + i]; var cc = Color.FromArgb(c); dist.Add(Tuple.Create(Math.Abs(cc.R - br) + Math.Abs(cc.G - bgG) + Math.Abs(cc.B - bb), c)); }
            dist.Sort((a, b2) => a.Item1.CompareTo(b2.Item1)); var far = dist.Skip((int)(dist.Count * .85)).ToList();
            if (far.Count > 0) { var cs = far.Select(t => Color.FromArgb(t.Item2)).ToList(); fg = Color.FromArgb((int)cs.Average(c => c.R), (int)cs.Average(c => c.G), (int)cs.Average(c => c.B)); } else fg = Color.FromArgb(255 - br, 255 - bgG, 255 - bb);
            if (Math.Abs(fg.R - br) + Math.Abs(fg.G - bgG) + Math.Abs(fg.B - bb) < 120) fg = (br + bgG + bb) / 3 > 128 ? Color.Black : Color.White;   // pouco contraste
        }
        void Missing(string tag)
        {
            status = "Idioma '" + tag + "' não instalado no Windows."; Render(); topT.Stop();
            string name = Langs.First(x => x[2] == tag)[0];
            var ans = MessageBox.Show(this, "O Windows ainda não sabe ler textos em " + name + " (" + tag + ").\n\nÉ preciso instalar o reconhecimento de texto (OCR) desse idioma.\n\nSim = instalar agora (o Windows pede permissão de administrador)\nNão = abrir Configurações → Idioma e região\n\nDepois de instalar, a tradução volta sozinha.", "Tradutor de Tela", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Information);
            topT.Start();
            if (ans == DialogResult.Yes)
            {
                string cap = "Language.OCR~~~" + tag + "~0.0.1.0";
                try { Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"Add-WindowsCapability -Online -Name '" + cap + "'; Write-Host 'Concluido!'; Start-Sleep 3\"") { Verb = "runas", UseShellExecute = true }); status = "Instalando o idioma… a tradução volta sozinha quando terminar."; }
                catch { status = "A permissão de administrador não foi concedida."; }
            }
            else if (ans == DialogResult.No) { try { Process.Start("ms-settings:regionlanguage"); } catch { } }
            Render();
            // tenta de novo a cada 15 s (o pacote pode ter sido instalado)
            var t = new System.Windows.Forms.Timer { Interval = 15000 }; t.Tick += (s, e) => { t.Stop(); t.Dispose(); paused = false; Force(); }; t.Start();
        }

        // ---------- desenho (janela com transparência por pixel) ----------
        void Render()
        {
            if (!IsHandleCreated || Width <= 0 || Height <= 0) return;
            using (var bmp = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit; g.Clear(Color.Transparent);
                    var r = new Rectangle(1, 1, Width - 3, Height - 3);
                    using (var path = Round(r, 8))
                    {
                        if (ghost) { using (var b = new SolidBrush(Color.FromArgb(6, 20, 20, 30))) g.FillPath(b, path); using (var p = new Pen(Color.FromArgb(30, 90, 160, 255))) g.DrawPath(p, path); }
                        else
                        {
                            using (var b = new SolidBrush(Color.FromArgb(45, 20, 20, 30))) g.FillPath(b, path);
                            using (var p = new Pen(Color.FromArgb(140, 0, 0, 0), 3)) g.DrawPath(p, path);
                            using (var p = new Pen(Color.FromArgb(230, 61, 123, 255), 1.5f)) g.DrawPath(p, path);
                        }
                    }
                    foreach (var it in items)
                    {
                        using (var b = new SolidBrush(it.Bg)) using (var pth = Round(it.R, 3)) g.FillPath(b, pth);
                        FitText(g, it.Text, it.R, it.Fg);
                    }
                    if (!ghost)
                    {
                        int w = Width, off = w > 420 ? 160 : Math.Max(0, w - 260);
                        bClose = new Rectangle(w - off - 32, 6, 26, 22); bMax = new Rectangle(w - off - 60, 6, 26, 22); bMin = new Rectangle(w - off - 88, 6, 26, 22); bGhost = new Rectangle(w - off - 124, 6, 26, 22); bIcon = new Rectangle(6, 6, 30, 22);
                        Btn(g, bIcon, "文A", hot == "icon", Color.FromArgb(70, 0, 0, 0)); Btn(g, bGhost, "", hot == "ghost", Color.FromArgb(210, 90, 70, 200)); GhostIcon(g, bGhost, hot == "ghost" ? Color.Black : Color.White);
                        Btn(g, bMin, "—", hot == "min", Color.FromArgb(70, 0, 0, 0)); Btn(g, bMax, WindowState == FormWindowState.Maximized ? "❐" : "□", hot == "max", Color.FromArgb(70, 0, 0, 0));
                        Btn(g, bClose, "✕", hot == "close", hot == "close" ? Color.FromArgb(232, 17, 35) : Color.FromArgb(70, 0, 0, 0));
                    }
                    else bIcon = bGhost = bMin = bMax = bClose = Rectangle.Empty;
                    if (status != "") using (var f = new Font("Segoe UI", 9f)) using (var b = new SolidBrush(Color.FromArgb(255, 200, 80))) g.DrawString(status, f, b, new RectangleF(8, 34, Width - 16, Height - 42));
                }
                Apply(bmp);
            }
        }
        static void Btn(Graphics g, Rectangle r, string t, bool hot, Color bg)
        {
            using (var b = new SolidBrush(hot && bg.A < 200 ? Color.FromArgb(200, 255, 255, 255) : bg)) using (var p = Round(r, 5)) g.FillPath(b, p);
            using (var f = new Font("Segoe UI", 9.5f, FontStyle.Bold)) using (var b = new SolidBrush(hot && bg.A < 200 ? Color.Black : Color.White))
            using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center }) g.DrawString(t, f, b, r, sf);
        }
        // fantasminha desenhado (emoji não aparece no desenho da janela)
        internal static void GhostIcon(Graphics g, Rectangle r, Color c)
        {
            float h = r.Height * .72f, w = h * .8f, x = r.X + (r.Width - w) / 2f, y = r.Y + (r.Height - h) / 2f;
            var sm = g.SmoothingMode; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var p = new GraphicsPath())
            {
                p.AddArc(x, y, w, w, 180, 180);
                float b = y + h, step = w / 3f;
                p.AddLine(x + w, y + w / 2f, x + w, b);
                p.AddLine(x + w, b, x + w - step / 2f, b - h * .14f); p.AddLine(x + w - step / 2f, b - h * .14f, x + w - step, b);
                p.AddLine(x + w - step, b, x + w - step * 1.5f, b - h * .14f); p.AddLine(x + w - step * 1.5f, b - h * .14f, x + w - step * 2f, b);
                p.AddLine(x + w - step * 2f, b, x + step / 2f, b - h * .14f); p.AddLine(x + step / 2f, b - h * .14f, x, b);
                p.CloseFigure();
                using (var br = new SolidBrush(c)) g.FillPath(br, p);
            }
            Color eye = c.GetBrightness() > .5f ? Color.FromArgb(90, 70, 200) : Color.White; float e = w * .2f;
            using (var br = new SolidBrush(eye)) { g.FillEllipse(br, x + w * .24f, y + w * .38f, e, e * 1.25f); g.FillEllipse(br, x + w * .56f, y + w * .38f, e, e * 1.25f); }
            g.SmoothingMode = sm;
        }
        static void FitText(Graphics g, string text, Rectangle r, Color fg)
        {
            float size = Math.Max(r.Height * .62f, 6f); Font f = null;
            while (size > 5) { f = new Font("Segoe UI", size, GraphicsUnit.Pixel); if (g.MeasureString(text, f).Width <= r.Width + 4) break; f.Dispose(); f = null; size -= .5f; }
            if (f == null) f = new Font("Segoe UI", 5f, GraphicsUnit.Pixel);
            using (f) using (var b = new SolidBrush(fg)) using (var sf = new StringFormat(StringFormatFlags.NoWrap | StringFormatFlags.NoClip) { LineAlignment = StringAlignment.Center }) g.DrawString(text, f, b, r, sf);
        }
        static GraphicsPath Round(Rectangle r, int rad)
        {
            var p = new GraphicsPath(); int d = rad * 2; if (r.Width < d || r.Height < d) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90); p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90); p.CloseFigure(); return p;
        }
        void Apply(Bitmap bmp)
        {
            IntPtr screen = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(screen), hb = bmp.GetHbitmap(Color.FromArgb(0)), old = SelectObject(mem, hb);
            try { var sz = new Size(bmp.Width, bmp.Height); var src = Point.Empty; var top = Location; var bl = new Blend { Op = 0, Flags = 0, Alpha = 255, Format = 1 }; UpdateLayeredWindow(Handle, screen, ref top, ref sz, mem, ref src, 0, ref bl, 2); }
            finally { SelectObject(mem, old); DeleteObject(hb); DeleteDC(mem); ReleaseDC(IntPtr.Zero, screen); }
        }
    }

    // cores do menu do botão direito
    class DarkColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground { get { return Color.FromArgb(32, 32, 38); } }
        public override Color MenuBorder { get { return Color.FromArgb(61, 123, 255); } }
        public override Color MenuItemBorder { get { return Color.FromArgb(61, 123, 255); } }
        public override Color MenuItemSelected { get { return Color.FromArgb(47, 107, 255); } }
        public override Color MenuItemSelectedGradientBegin { get { return Color.FromArgb(47, 107, 255); } }
        public override Color MenuItemSelectedGradientEnd { get { return Color.FromArgb(47, 107, 255); } }
        public override Color SeparatorDark { get { return Color.FromArgb(60, 60, 70); } }
        public override Color SeparatorLight { get { return Color.FromArgb(32, 32, 38); } }
    }

    // botão plano arredondado (desenhado à mão, sem o visual cinza do Windows)
    class FlatBtn : Control
    {
        public Color Accent = Color.FromArgb(47, 107, 255); bool over, down;
        public FlatBtn() { SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.Selectable, true); Cursor = Cursors.Hand; ForeColor = Color.White; Font = new Font("Segoe UI Semibold", 9.5f); TabStop = true; }
        protected override void OnMouseEnter(EventArgs e) { over = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { over = down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) OnClick(EventArgs.Empty); base.OnKeyDown(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(Parent != null ? Parent.BackColor : BackColor);
            var c = down ? ControlPaint.Dark(Accent, .1f) : over ? ControlPaint.Light(Accent, .25f) : Accent;
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var p = Rnd(r, 6)) { using (var b = new SolidBrush(c)) g.FillPath(b, p); if (Focused) using (var pen = new Pen(Color.White, 1.5f)) g.DrawPath(pen, p); }
            TextRenderer.DrawText(g, Text, Font, r, ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
        internal static GraphicsPath Rnd(Rectangle r, int rad) { var p = new GraphicsPath(); int d = rad * 2; p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90); p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90); p.CloseFigure(); return p; }
    }

    // caixa de seleção escura (desenhada à mão: a do Windows fica branca/quebrada no modo plano)
    class DarkCombo : ComboBox
    {
        public DarkCombo()
        {
            DropDownStyle = ComboBoxStyle.DropDownList; DrawMode = DrawMode.OwnerDrawFixed; FlatStyle = FlatStyle.Flat;
            BackColor = Color.FromArgb(44, 44, 52); ForeColor = Color.White; Font = new Font("Segoe UI", 10f); ItemHeight = 24; MaxDropDownItems = 12; IntegralHeight = false; DropDownHeight = 24 * 12 + 2;
        }
        protected override void OnDrawItem(DrawItemEventArgs e)
        {
            if (e.Index < 0) return;
            bool edit = (e.State & DrawItemState.ComboBoxEdit) != 0, sel = (e.State & DrawItemState.Selected) != 0 && !edit;
            var bg = sel ? Color.FromArgb(47, 107, 255) : BackColor;
            using (var b = new SolidBrush(bg)) e.Graphics.FillRectangle(b, e.Bounds);
            var fg = e.Index == 0 && !sel ? Color.FromArgb(150, 150, 160) : ForeColor;
            var r = new Rectangle(e.Bounds.X + 6, e.Bounds.Y, e.Bounds.Width - 6, e.Bounds.Height);
            TextRenderer.DrawText(e.Graphics, Items[e.Index].ToString(), Font, r, fg, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        }
        const int WM_PAINT = 0xF;
        [DllImport("user32.dll")] static extern IntPtr GetWindowDC(IntPtr h); [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            if (m.Msg == WM_PAINT)
            {   // borda e seta no mesmo tom (a borda branca do Windows some)
                IntPtr dc = GetWindowDC(Handle);
                try
                {
                    using (var g = Graphics.FromHdc(dc))
                    {
                        var r = new Rectangle(0, 0, Width - 1, Height - 1); int bw = 22;
                        using (var b = new SolidBrush(BackColor)) g.FillRectangle(b, Width - bw - 1, 1, bw, Height - 2);
                        using (var p = new Pen(Focused || DroppedDown ? Color.FromArgb(61, 123, 255) : Color.FromArgb(70, 70, 82))) g.DrawRectangle(p, r);
                        g.SmoothingMode = SmoothingMode.AntiAlias; int cx = Width - bw / 2 - 2, cy = Height / 2;
                        using (var b = new SolidBrush(Color.FromArgb(200, 200, 210))) g.FillPolygon(b, new[] { new Point(cx - 4, cy - 2), new Point(cx + 4, cy - 2), new Point(cx, cy + 3) });
                    }
                }
                finally { ReleaseDC(Handle, dc); }
            }
        }
        protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
        protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    }

    // botão "voltar a clicar" do modo fantasma
    class GhostBack : Form
    {
        bool over;
        public GhostBack()
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual; Size = new Size(168, 32); Cursor = Cursors.Hand;
            BackColor = Color.FromArgb(30, 30, 36); DoubleBuffered = true;
            MouseEnter += (s, e) => { over = true; Invalidate(); }; MouseLeave += (s, e) => { over = false; Invalidate(); };
        }
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            var c = over ? Color.FromArgb(80, 140, 255) : Color.FromArgb(47, 107, 255);
            using (var p = FlatBtn.Rnd(new Rectangle(0, 0, Width - 1, Height - 1), 7)) using (var b = new SolidBrush(c)) g.FillPath(b, p);
            Overlay.GhostIcon(g, new Rectangle(8, 4, 24, Height - 8), Color.White);
            using (var f = new Font("Segoe UI Semibold", 9.5f)) TextRenderer.DrawText(g, "Voltar a clicar", f, new Rectangle(34, 0, Width - 40, Height), Color.White, TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
        }
    }

    // painel dos idiomas (abre pelo 文A)
    class LangPanel : Form
    {
        public event Action<string, string> Changed;
        readonly DarkCombo s = new DarkCombo(), d = new DarkCombo();
        public LangPanel(string src, string dst)
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual; BackColor = Color.FromArgb(30, 30, 36); Size = new Size(252, 196); KeyPreview = true;
            Func<string, int, Label> lab = (t, y) => new Label { Text = t, ForeColor = Color.FromArgb(200, 200, 210), Font = new Font("Segoe UI", 9f), Location = new Point(14, y), AutoSize = true, BackColor = Color.Transparent };
            foreach (var cb in new[] { s, d }) { cb.Width = 224; }
            s.Items.Add("Selecione…"); foreach (var l in Langs) s.Items.Add(l[0]);
            d.Items.Add("Selecione…"); foreach (var l in Langs.Skip(1)) d.Items.Add(l[0]);
            s.SelectedIndex = src == null ? 0 : Math.Max(0, Array.FindIndex(Langs, x => x[1] == src) + 1);
            d.SelectedIndex = dst == null ? 0 : Math.Max(0, Array.FindIndex(Langs, x => x[1] == dst));
            Controls.Add(lab("Idioma do texto", 12)); s.Location = new Point(14, 32); s.TabIndex = 0; Controls.Add(s);
            Controls.Add(lab("Traduzir para", 70)); d.Location = new Point(14, 90); d.TabIndex = 1; Controls.Add(d);
            var stop = new FlatBtn { Text = "Parar tradução", Location = new Point(14, 140), Size = new Size(108, 34), Accent = Color.FromArgb(70, 70, 82), TabIndex = 2 };
            var ok = new FlatBtn { Text = "Pronto", Location = new Point(130, 140), Size = new Size(108, 34), TabIndex = 3 };
            stop.Click += (o, e) => d.SelectedIndex = 0; ok.Click += (o, e) => Hide();
            Controls.Add(stop); Controls.Add(ok);
            EventHandler ch = (o, e) => { string a = s.SelectedIndex > 0 ? Langs[s.SelectedIndex - 1][1] : null, b = d.SelectedIndex > 0 ? Langs[d.SelectedIndex][1] : null; if (Changed != null) Changed(a, b); };
            s.SelectionChangeCommitted += ch; d.SelectionChangeCommitted += ch; stop.Click += ch;
            KeyDown += (o, e) => { if (e.KeyCode == Keys.Escape) { Hide(); e.Handled = true; } };
            Deactivate += (o, e) => BeginInvoke((Action)(() => { if (Visible && !s.DroppedDown && !d.DroppedDown && !ContainsFocus) Hide(); }));
        }
        protected override void OnPaint(PaintEventArgs e) { base.OnPaint(e); using (var p = new Pen(Color.FromArgb(61, 123, 255))) e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1); }
        protected override void OnShown(EventArgs e) { base.OnShown(e); s.Focus(); }
    }
}
