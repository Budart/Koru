using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Koru — player de vídeo embutido (mpv): toca qualquer formato, legendas, proporção e controle
static partial class WebHost
{
    public static readonly string MpvDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "mpv");
    static string MpvBin { get { return Path.Combine(MpvDir, "bin"); } }
    public static string MpvExe()
    {
        try { if (Directory.Exists(MpvBin)) return Directory.GetFiles(MpvBin, "mpv.exe", SearchOption.AllDirectories).FirstOrDefault(); } catch { }
        return null;
    }

    // ---------- motor de vídeo: baixado na primeira vez, direto das versões oficiais ----------
    public static volatile bool MpvBusy; public static volatile int MpvProgress; public static volatile string MpvError = "", MpvStep = "";
    static string Get(string url)
    {
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
        using (var wc = new WebClient { Encoding = Encoding.UTF8 }) { wc.Headers[HttpRequestHeader.UserAgent] = "Koru"; return wc.DownloadString(url); }
    }
    static void Fetch(string url, string file, Action<int> prog)
    {
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
        using (var wc = new WebClient())
        {
            wc.Headers[HttpRequestHeader.UserAgent] = "Koru";
            var done = new ManualResetEvent(false); Exception err = null;
            wc.DownloadProgressChanged += (s, e) => { if (prog != null) prog(e.ProgressPercentage); };
            wc.DownloadFileCompleted += (s, e) => { err = e.Error; done.Set(); };
            wc.DownloadFileAsync(new Uri(url), file); done.WaitOne();
            if (err != null) throw err;
        }
    }
    public static void MpvInstall()
    {
        if (MpvBusy) return; MpvBusy = true; MpvError = ""; MpvProgress = 0;
        new Thread(() =>
        {
            string tmp = Path.Combine(Path.GetTempPath(), "koru-mpv-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(tmp);
                MpvStep = "Procurando a versão mais recente...";
                string url = null;
                try
                {
                    var js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                    var rel = (Dictionary<string, object>)js.DeserializeObject(Get("https://api.github.com/repos/mpv-player/mpv/releases/latest"));
                    foreach (var o in (System.Collections.IEnumerable)rel["assets"]) { var a = (Dictionary<string, object>)o; string n = (a["name"] ?? "").ToString(); if (n.EndsWith("x86_64-w64-mingw32.zip")) url = a["browser_download_url"].ToString(); }
                }
                catch (Exception ex) { MpvLog("API: " + ex.Message); }
                if (url == null) url = "https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-w64-mingw32.zip";   // reserva
                MpvLog("baixando " + url);
                MpvStep = "Baixando o motor de vídeo...";
                string zip = Path.Combine(tmp, "mpv.zip"); Fetch(url, zip, p => MpvProgress = p * 85 / 100);
                MpvStep = "Instalando...";
                if (Directory.Exists(MpvBin)) Directory.Delete(MpvBin, true);
                ZipFile.ExtractToDirectory(zip, MpvBin);
                if (MpvExe() == null) throw new Exception("mpv.exe não veio no pacote");
                MpvProgress = 100; MpvStep = "Pronto";
            }
            catch (Exception ex) { MpvError = ex.Message; MpvLog("ERRO: " + ex); }
            finally { try { Directory.Delete(tmp, true); } catch { } MpvBusy = false; }
        }) { IsBackground = true }.Start();
    }

    public static void MpvLog(string m) { try { Directory.CreateDirectory(MpvDir); File.AppendAllText(Path.Combine(MpvDir, "koru-player.log"), DateTime.Now.ToString("s") + "  " + m + "\r\n"); } catch { } }
    // ---------- arquivos de configuração do player (gerados a cada reprodução) ----------
    const string InputConf = @"SPACE cycle pause
MBTN_LEFT cycle pause
MBTN_LEFT_DBL script-message koru-fs
ESC quit
BS quit
q quit
ENTER script-message koru-fs
f script-message koru-fs
F11 script-message koru-fs
LEFT seek -10
RIGHT seek 10
UP add volume 5
DOWN add volume -5
PGUP seek 60
PGDWN seek -60
WHEEL_UP add volume 2
WHEEL_DOWN add volume -2
Ctrl+WHEEL_UP script-message koru-aspect 1
Ctrl+WHEEL_DOWN script-message koru-aspect -1
Ctrl+UP script-message koru-aspect 1
Ctrl+DOWN script-message koru-aspect -1
s cycle sub
S cycle sub down
v cycle sub-visibility
a cycle audio
z add sub-delay -0.1
x add sub-delay 0.1
Ctrl+= add sub-scale 0.1
Ctrl+- add sub-scale -0.1
i script-binding stats/display-stats-toggle
TAB show-progress
";
    const string KoruLua = @"local mp = require 'mp'
local o = { aspect = 'auto' }
require('mp.options').read_options(o, 'koru')
local A = { {'auto','Original'}, {'16:9','16:9'}, {'4:3','4:3'}, {'21:9','21:9 (ultrawide)'}, {'9:16','Vertical 9:16'}, {'1:1','Quadrado 1:1'}, {'fill','Preencher a tela (corta as bordas)'}, {'stretch','Esticar (tela cheia)'} }
local function idx(t, k) for i, v in ipairs(t) do if v[1] == k then return i end end return 1 end
local ai = idx(A, o.aspect)
local function aspect(show)
  local k = A[ai][1]
  mp.set_property('keepaspect', 'yes'); mp.set_property_number('panscan', 0); mp.set_property('video-aspect-override', '-1')
  if k == 'fill' then mp.set_property_number('panscan', 1)
  elseif k == 'stretch' then mp.set_property('keepaspect', 'no')
  elseif k ~= 'auto' then mp.set_property('video-aspect-override', k) end
  if show then mp.osd_message('Proporção: ' .. A[ai][2], 2) end
end
mp.register_script_message('koru-aspect', function(d) ai = (ai - 1 + tonumber(d)) % #A + 1; aspect(true) end)
mp.register_event('file-loaded', function() aspect(false) end)
mp.observe_property('fullscreen', 'bool', function(_, v) if v then mp.set_property_bool('fullscreen', false); mp.commandv('script-message', 'koru-fs') end end)
";
    const string MpvConf = @"vo=gpu-next
gpu-api=d3d11
hwdec=auto-safe
keep-open=no
force-window=yes
osc=yes
osd-font='Segoe UI'
osd-font-size=36
osd-bar-align-y=0.9
save-position-on-quit=yes
sub-auto=fuzzy
sub-font='Segoe UI Semibold'
audio-file-auto=fuzzy
alang=pt,por,pob,pt-BR,en,eng,ja,jpn
volume-max=150
cursor-autohide=1500
input-default-bindings=yes
";

    // ---------- arquivo de vídeo para o player/prévia da página (com "Range": só lê o pedaço pedido, sem carregar o arquivo) ----------
    public static Func<string, string, string> VideoFileOf;
    const long ChunkMax = 4L << 20;
    static readonly List<RangeStream> OpenVids = new List<RangeStream>();
    public static readonly List<Process> ThumbProcs = new List<Process>();
    static string mpvFile;
    // antes de apagar um vídeo: fecha a prévia/o player e encerra o que estiver com o arquivo aberto
    public static void ReleaseFile(string f)
    {
        try { form.Invoke((Action)(() => { try { view.CoreWebView2.ExecuteScriptAsync("window.vpRelease&&vpRelease()"); } catch { } if (mpvProc != null && string.Equals(mpvFile, f, StringComparison.OrdinalIgnoreCase)) Stop(); })); } catch { }
        List<RangeStream> l; lock (OpenVids) l = OpenVids.Where(x => string.Equals(x.File, f, StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var x in l) try { x.Dispose(); } catch { }
        lock (ThumbProcs) foreach (var p in ThumbProcs.ToList()) try { if (!p.HasExited) p.Kill(); } catch { }
    }
    class RangeStream : Stream
    {
        readonly Stream s; long left; readonly string file;
        public RangeStream(Stream s, long start, long len, string file) { this.s = s; this.file = file; s.Seek(start, SeekOrigin.Begin); left = len; lock (OpenVids) OpenVids.Add(this); }
        public string File { get { return file; } }
        public override int Read(byte[] b, int o, int c) { if (left <= 0) return 0; try { int n = s.Read(b, o, (int)Math.Min(c, left)); left -= n; return n; } catch { left = 0; return 0; } }
        public override bool CanRead { get { return true; } } public override bool CanSeek { get { return false; } } public override bool CanWrite { get { return false; } }
        public override long Length { get { throw new NotSupportedException(); } } public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
        public override void Flush() { } public override long Seek(long a, SeekOrigin b) { throw new NotSupportedException(); } public override void SetLength(long v) { throw new NotSupportedException(); } public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
        protected override void Dispose(bool d) { if (d) { try { s.Dispose(); } catch { } lock (OpenVids) OpenVids.Remove(this); } base.Dispose(d); }
        public override int ReadTimeout { get; set; }
    }
    static void ServeVideo(Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e, Microsoft.Web.WebView2.Core.CoreWebView2Deferral deferral)
    {
        string url = e.Request.Uri, range = null;
        try { if (e.Request.Headers.Contains("Range")) range = e.Request.Headers.GetHeader("Range"); } catch { }
        Task.Run(() =>
        {
            Stream body = null; int code = 404; string hdr = "Content-Type: text/plain";
            try
            {
                var q = System.Web.HttpUtility.ParseQueryString(new Uri(url).Query);
                string f = VideoFileOf == null ? null : VideoFileOf(q["c"], q["p"]);
                if (f != null)
                {
                    var fs = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16, FileOptions.SequentialScan);
                    long len = fs.Length, a = 0, b = len - 1;
                    var m = range == null ? null : Regex.Match(range, @"bytes=(\d*)-(\d*)");
                    if (m != null && m.Success)
                    {
                        if (m.Groups[1].Value != "") { a = long.Parse(m.Groups[1].Value); if (m.Groups[2].Value != "") b = Math.Min(len - 1, long.Parse(m.Groups[2].Value)); }
                        else if (m.Groups[2].Value != "") { a = Math.Max(0, len - long.Parse(m.Groups[2].Value)); }
                    }
                    // o WebView2 copia a resposta inteira para a memória: entrega no máximo 4 MB por pedido (o player pede o resto aos poucos)
                    if (b - a + 1 > ChunkMax) b = a + ChunkMax - 1;
                    bool part = !(a == 0 && b == len - 1);
                    string ext = Path.GetExtension(f).ToLowerInvariant();
                    string type = ext == ".webm" || ext == ".mkv" ? "video/webm" : ext == ".ogv" ? "video/ogg" : "video/mp4";
                    body = new RangeStream(fs, a, b - a + 1, f); code = part ? 206 : 200;
                    hdr = "Content-Type: " + type + "\r\nAccept-Ranges: bytes\r\nContent-Length: " + (b - a + 1) + (code == 206 ? "\r\nContent-Range: bytes " + a + "-" + b + "/" + len : "") + "\r\nCache-Control: no-store";
                }
            }
            catch { body = null; code = 404; }
            form.BeginInvoke((Action)(() =>
            {
                try { e.Response = env.CreateWebResourceResponse(body ?? new MemoryStream(), code, code == 206 ? "Partial Content" : code == 200 ? "OK" : "Not Found", hdr); }
                catch { }
                finally { deferral.Complete(); }
            }));
        });
    }

    // ---------- reprodução ----------
    static Panel mpvHost; static Process mpvProc; static NamedPipeClientStream mpvPipe; static StreamWriter mpvOut; static bool mpvFull;
    public static bool PlayerOn { get { return mpvProc != null; } }
    [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    static string Q(string s) { return "\"" + (s ?? "").Replace("\"", "") + "\""; }
    static string Opt(Dictionary<string, object> c, string k, string def) { object v; return c != null && c.TryGetValue(k, out v) && v != null && v.ToString() != "" ? v.ToString() : def; }

    public static string Play(string file, Dictionary<string, object> c)
    {
        string exe = MpvExe(); if (exe == null) return "O motor de vídeo ainda não foi baixado.";
        string conf = Path.Combine(MpvDir, "conf"); Directory.CreateDirectory(Path.Combine(conf, "scripts"));
        File.WriteAllText(Path.Combine(conf, "mpv.conf"), MpvConf);
        File.WriteAllText(Path.Combine(conf, "input.conf"), InputConf);
        File.WriteAllText(Path.Combine(conf, "scripts", "koru.lua"), KoruLua, new UTF8Encoding(false));
        // legendas (configuradas no card do console)
        string col = Opt(c, "subColor", "white"), bg = Opt(c, "subBg", "outline");
        var a = new List<string> {
            "--config-dir=" + Q(conf), "--watch-later-dir=" + Q(Path.Combine(MpvDir, "watch_later")),
            "--input-ipc-server=" + Q(@"\\.\pipe\koru-mpv-" + Process.GetCurrentProcess().Id),
            "--script-opts=" + Q("koru-aspect=" + Opt(c, "aspect", "auto")),
            "--slang=" + Q(Opt(c, "subLang", "pt,por,pob,pt-BR,en,eng")),
            "--sub-font-size=" + Opt(c, "subSize", "46"), "--sub-pos=" + Opt(c, "subPos", "95"),
            "--sub-color=" + (col == "yellow" ? "#FFE14D" : col == "cyan" ? "#7FE7FF" : "#FFFFFF"),
            "--sub-border-size=" + (bg == "box" ? "0" : bg == "shadow" ? "1.5" : "3"), "--sub-shadow-offset=" + (bg == "shadow" ? "2" : "0"),
            "--sub-border-style=" + (bg == "box" ? "background-box" : "outline-and-shadow"), "--sub-back-color=" + (bg == "box" ? "#B0000000" : "#00000000"),
            "--sub-visibility=" + (Opt(c, "subOn", "true") == "False" ? "no" : "yes"),
        };
        bool full = Opt(c, "videoFull", "false") == "True";
        form.Invoke((Action)(() =>
        {
            Stop();
            mpvHost = new Panel { Dock = DockStyle.Fill, BackColor = Color.Black };
            form.Controls.Add(mpvHost); mpvHost.BringToFront();
            a.Insert(0, "--wid=" + mpvHost.Handle.ToInt64());
            a.Add("--"); a.Add(Q(file));
            if (full && !form.Full) { form.ToggleFull(); mpvFull = true; } else mpvFull = false;
            var psi = new ProcessStartInfo(exe, string.Join(" ", a)) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(exe) };
            mpvFile = file; MpvLog("play: " + exe + " " + psi.Arguments);
            mpvProc = Process.Start(psi); mpvProc.EnableRaisingEvents = true;
            var me = mpvProc; me.Exited += (s, e) => { try { form.BeginInvoke((Action)(() => { if (mpvProc == me) Stop(); })); } catch { } };
            GameOn = true; Post("game:on");
            new Thread(() => PipeLoop(me)) { IsBackground = true }.Start();
            new Thread(() => { for (int i = 0; i < 40 && mpvProc == me; i++) { Thread.Sleep(100); if (FocusMpv()) break; } }) { IsBackground = true }.Start();
        }));
        return null;
    }
    // o teclado vai direto para a janela do mpv (dentro da janela do Koru)
    static bool FocusMpv()
    {
        IntPtr host = IntPtr.Zero; try { form.Invoke((Action)(() => { if (mpvHost != null) host = mpvHost.Handle; })); } catch { }
        if (host == IntPtr.Zero) return false;
        IntPtr child = FindWindowEx(host, IntPtr.Zero, null, null); if (child == IntPtr.Zero) return false;
        try
        {
            form.Invoke((Action)(() =>
            {
                uint pid; uint t = GetWindowThreadProcessId(child, out pid), me = GetCurrentThreadId();
                AttachThreadInput(me, t, true); SetFocus(child); AttachThreadInput(me, t, false);
            }));
        }
        catch { }
        return true;
    }
    public static void FocusPlayer() { if (PlayerOn) new Thread(() => FocusMpv()) { IsBackground = true }.Start(); }
    static void Stop()
    {
        var p = mpvProc; mpvProc = null;
        try { if (p != null && !p.HasExited) { MpvCmd("quit"); if (!p.WaitForExit(1500)) p.Kill(); } } catch { }
        try { if (mpvPipe != null) mpvPipe.Dispose(); } catch { } mpvPipe = null; mpvOut = null;
        if (mpvHost != null) { form.Controls.Remove(mpvHost); mpvHost.Dispose(); mpvHost = null; }
        if (mpvFull && form.Full) form.ToggleFull(); mpvFull = false;
        if (p != null) { GameOn = false; Post("game:off"); try { view.Focus(); } catch { } }
    }
    static void PipeLoop(Process me)
    {
        string name = "koru-mpv-" + Process.GetCurrentProcess().Id;
        for (int i = 0; i < 50 && mpvProc == me; i++)
        {
            try { var p = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous); p.Connect(200); mpvPipe = p; mpvOut = new StreamWriter(p, new UTF8Encoding(false)) { AutoFlush = true }; break; }
            catch { Thread.Sleep(100); }
        }
        if (mpvPipe == null) return;
        try
        {
            var rd = new StreamReader(mpvPipe, Encoding.UTF8); string line;
            while (mpvProc == me && (line = rd.ReadLine()) != null)
                if (line.Contains("\"client-message\"") && line.Contains("koru-fs")) form.BeginInvoke((Action)(() => { form.ToggleFull(); mpvFull = false; FocusPlayer(); }));
        }
        catch { }
    }
    public static void MpvCmd(params object[] args)
    {
        try { var w = mpvOut; if (w != null) lock (w) w.WriteLine(new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "command", args } })); } catch { }
    }

    // ---------- controle (XInput) durante o vídeo ----------
    static ushort padPrev; static long padRepAt; static bool ltWas, rtWas;
    static void PadPlayer(ushort b, byte lt, byte rt)
    {
        Func<ushort, bool> down = m => (b & m) != 0 && (padPrev & m) == 0;
        long now = Environment.TickCount;
        if (down(0x1000)) MpvCmd("cycle", "pause");                       // A
        if (down(0x2000)) MpvCmd("quit");                                 // B
        if (down(0x4000)) MpvCmd("cycle", "sub");                         // X
        if (down(0x8000)) MpvCmd("cycle", "audio");                       // Y
        if (down(0x0100)) MpvCmd("seek", -60);                            // LB
        if (down(0x0200)) MpvCmd("seek", 60);                             // RB
        if (down(0x0001)) MpvCmd("add", "volume", 5);                     // ↑
        if (down(0x0002)) MpvCmd("add", "volume", -5);                    // ↓
        if (down(0x0010)) form.BeginInvoke((Action)(() => { form.ToggleFull(); mpvFull = false; FocusPlayer(); }));   // Start: tela cheia
        if (down(0x0040)) MpvCmd("cycle", "sub-visibility");              // L3
        if (down(0x0080)) MpvCmd("show-progress");                        // R3
        // ← →: volta/avança 10 s (segurando, repete)
        bool l = (b & 0x0004) != 0, r = (b & 0x0008) != 0;
        if ((l || r) && (down(0x0004) || down(0x0008))) { MpvCmd("seek", l ? -10 : 10); padRepAt = now + 450; }
        else if ((l || r) && now >= padRepAt) { MpvCmd("seek", l ? -10 : 10); padRepAt = now + 200; }
        // gatilhos: proporção da tela
        bool lw = lt > 120, rw = rt > 120;
        if (lw && !ltWas) MpvCmd("script-message", "koru-aspect", "-1");
        if (rw && !rtWas) MpvCmd("script-message", "koru-aspect", "1");
        ltWas = lw; rtWas = rw; padPrev = b;
    }
}
