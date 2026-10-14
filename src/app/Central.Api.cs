using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
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

// Koru — rotas da API usada pela página (/api/...)
static partial class Central
{
    // vídeo pedido pela página: só arquivos dentro das pastas do console de vídeos
    static readonly bool vfInit = InitVideoFile();
    static bool InitVideoFile()
    {
        WebHost.VideoFileOf = (cid, rel) =>
        {
            try
            {
                var cfg = LoadConfig(); string root = Root(cfg);
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == cid); if (c == null || !IsVideo(c)) return null;
                string vf = Full(root, rel ?? "");
                return File.Exists(vf) && AllDirs(c).Any(rd => vf.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) ? vf : null;
            }
            catch { return null; }
        };
        return true;
    }
    static string SrtToVtt(string t)
    {
        t = t.Replace("\r\n", "\n").TrimStart('\uFEFF');
        if (t.StartsWith("WEBVTT")) return t;
        return "WEBVTT\n\n" + Regex.Replace(t, @"(\d{2}:\d{2}:\d{2}),(\d{3})", "$1.$2");
    }
    // miniatura do vídeo pelo próprio Windows (a mesma do Explorador de Arquivos)
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory { [PreserveSig] int GetImage(ThumbSize size, int flags, out IntPtr phbm); }
    [StructLayout(LayoutKind.Sequential)] struct ThumbSize { public int cx, cy; }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
    static void ShellThumb(string file, string outJpg)
    {
        var t = new Thread(() =>
        {
            IntPtr hb = IntPtr.Zero;
            try
            {
                IShellItemImageFactory fac; SHCreateItemFromParsingName(file, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out fac);
                if (fac.GetImage(new ThumbSize { cx = 640, cy = 640 }, 0x8 | 0x1, out hb) != 0 || hb == IntPtr.Zero) return;   // só miniatura de verdade (sem ícone genérico)
                using (var bmp = Image.FromHbitmap(hb))
                {
                    var enc = ImageCodecInfo.GetImageEncoders().First(x => x.FormatID == ImageFormat.Jpeg.Guid); var ep = new EncoderParameters(1); ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
                    bmp.Save(outJpg, enc, ep);
                }
                Marshal.ReleaseComObject(fac);
            }
            catch { }
            finally { if (hb != IntPtr.Zero) DeleteObject(hb); }
        });
        t.SetApartmentState(ApartmentState.STA); t.IsBackground = true; t.Start(); t.Join(15000);
    }
    static void Handle(Ctx ctx)
    {
        try
        {
            var req = ctx.Request;
            string path = req.Url.AbsolutePath;
            var cfg = LoadConfig();
            string root = Root(cfg);

            if (path == "/" || path == "/index.html" || path == "/config" || path == "/welcome")
                Send(ctx, 200, "text/html; charset=utf-8", Utf8.GetBytes(Resource("web/index.html")));
            else if (path.StartsWith("/img/") && !path.Contains(".."))
            {
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream("web" + path))
                {
                    if (st == null) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                    var ms = new MemoryStream(); st.CopyTo(ms); ctx.Response.Headers["Cache-Control"] = "max-age=31536000";
                    Send(ctx, 200, path.EndsWith(".png") ? "image/png" : "image/jpeg", ms.ToArray()); ctx.Response.Headers["Cache-Control"] = "max-age=31536000";
                }
            }
            else if ((path.StartsWith("/css/") || path.StartsWith("/js/")) && !path.Contains(".."))
            {
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream("web" + path))
                {
                    if (st == null) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                    var ms = new MemoryStream(); st.CopyTo(ms);
                    Send(ctx, 200, path.EndsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", ms.ToArray());
                }
            }
            else if (path == "/sym.png")
            {
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream("sym.png")) { var ms = new MemoryStream(); st.CopyTo(ms); Send(ctx, 200, "image/png", ms.ToArray()); }
            }
            else if (path == "/logo.png")
            {
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png")) { var ms = new MemoryStream(); st.CopyTo(ms); Send(ctx, 200, "image/png", ms.ToArray()); }
            }
            else if (path == "/api/consoles")
            {
                var outp = new List<object>();
                foreach (var c in Consoles(cfg))
                {
                    string emu = Full(root, S(c, "emulator"));
                    var gl = Games(root, c);
                    outp.Add(new Dictionary<string, object> {
                        { "id", S(c, "id") }, { "name", S(c, "name") }, { "art", S(c, "art") }, { "thumbs", S(c, "thumbs") },
                        { "emulatorOk", IsPc(c) || IsVideo(c) || (emu != "" && File.Exists(emu)) }, { "type", S(c, "type") }, { "logo", S(c, "logo") }, { "bg", S(c, "bg") }, { "enabled", !(c.ContainsKey("enabled") && c["enabled"] is bool && !(bool)c["enabled"]) }, { "count", gl.Count(g => !IsCustom(g)) }, { "customCount", gl.Count(g => IsCustom(g)) } });
                }
                SendJson(ctx, outp);
            }
            else if (path == "/api/games")
            {
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == req.QueryString["c"]);
                if (c == null) SendJson(ctx, Err("Console não encontrado"), 404);
                else SendJson(ctx, Games(root, c));
            }
            else if (path == "/api/config" && req.HttpMethod == "GET")
            {
                string text = File.Exists(ConfigFile) ? File.ReadAllText(ConfigFile, Encoding.UTF8) : Resource("config.json");
                Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(text));
            }
            else if (path == "/api/config" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var parsed = (Dictionary<string, object>)Json.DeserializeObject(bodyText);   // valida
                if (!parsed.ContainsKey("consoles")) throw new Exception("Configuração inválida");
                SaveConfigText(bodyText);
                ApplyAutostart(parsed);
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/browse" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                string start = Full(root, S(body, "start"));
                bool isImg = S(body, "type") == "image";
                bool abs = S(body, "type") == "folderabs";
                string picked = Browse(S(body, "type") == "folder" || abs, start, isImg);
                if (isImg || abs) { SendJson(ctx, new Dictionary<string, object> { { "path", picked ?? "" } }); return; }
                string rel = picked;
                if (picked != null && picked.StartsWith(root.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
                    rel = picked.Substring(root.TrimEnd('\\').Length + 1).Replace('\\', '/');
                SendJson(ctx, new Dictionary<string, object> { { "path", rel ?? "" }, { "exists", true } });
            }
            else if (path == "/api/exists")
            {
                string p = Full(root, req.QueryString["p"] ?? "");
                SendJson(ctx, new Dictionary<string, object> { { "file", p != "" && File.Exists(p) }, { "dir", p != "" && Directory.Exists(p) } });
            }
            else if (path == "/api/gameid")
            {
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == req.QueryString["c"]);
                string rom = Full(root, req.QueryString["p"] ?? "");
                string id = "";
                if (c != null && File.Exists(rom)) try { id = GameId(IsPc(c) ? "pc" : S(c, "id"), rom); } catch { }
                SendJson(ctx, new Dictionary<string, object> { { "id", id } });
            }
            else if (path == "/api/steam")
            {
                // busca na loja da Steam (feita pelo servidor, porque a Steam não libera acesso direto do navegador)
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                using (var wc = new WebClient { Encoding = Encoding.UTF8 })
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0";
                    string q = Uri.EscapeDataString(req.QueryString["q"] ?? "");
                    string txt = wc.DownloadString("https://store.steampowered.com/api/storesearch/?term=" + q + "&l=english&cc=US");
                    Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(txt));
                }
            }
            else if (path == "/api/order" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var ids = ((IEnumerable)((Dictionary<string, object>)Json.DeserializeObject(bodyText))["ids"]).Cast<object>().Select(x => x.ToString()).ToList();
                var list = Consoles(cfg).ToList();
                var ordered = list.OrderBy(c => { int i = ids.IndexOf(S(c, "id")); return i < 0 ? 9999 : i; }).ToList();
                cfg["consoles"] = ordered.ToArray();
                SaveConfigText(Json.Serialize(cfg));
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/proxy")
            {
                // busca em wikis que não liberam acesso direto do navegador (Fandom, PCGamingWiki, StrategyWiki...)
                string u = req.QueryString["u"] ?? "";
                if (!Regex.IsMatch(u, @"^https://([a-z0-9-]+\.fandom\.com|www\.pcgamingwiki\.com|strategywiki\.org|wallhaven\.cc|[a-z]{2,3}\.wikipedia\.org)/", RegexOptions.IgnoreCase))
                { Send(ctx, 400, "text/plain", new byte[0]); return; }
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                using (var wc = new WebClient { Encoding = Encoding.UTF8 })
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "CentralDeJogos/1.0";
                    try { Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(wc.DownloadString(u))); }
                    catch { Send(ctx, 404, "application/json", Utf8.GetBytes("{}")); }
                }
            }
            else if (path == "/api/reveal" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                string p = Full(root, S((Dictionary<string, object>)Json.DeserializeObject(bodyText), "path"));
                if (File.Exists(p)) Process.Start("explorer.exe", "/select,\"" + p + "\"");
                else if (Directory.Exists(p)) Process.Start("explorer.exe", "\"" + p + "\"");
                else { SendJson(ctx, Err("Arquivo não encontrado"), 404); return; }
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/ytsearch")
            {
                string q = (req.QueryString["q"] ?? "").Trim();
                SendJson(ctx, YouTube(q));
            }
            else if (path == "/api/fsarg")
                SendJson(ctx, new Dictionary<string, object> { { "arg", FullscreenArg(Full(root, req.QueryString["emu"] ?? "")) } });
            else if (path == "/api/mpv")
            {
                if (req.HttpMethod == "POST") WebHost.MpvInstall();
                SendJson(ctx, new Dictionary<string, object> { { "installed", WebHost.MpvExe() != null }, { "busy", WebHost.MpvBusy }, { "progress", WebHost.MpvProgress }, { "step", WebHost.MpvStep }, { "error", WebHost.MpvError } });
            }
            else if (path == "/api/posters")
            {
                // pôsteres de filmes/séries para a escolha manual: ThePosterDB e MoviePosterDB (lê a página de busca, sem chave)
                string q = req.QueryString["q"] ?? "", src = req.QueryString["src"] ?? "tpdb"; var list = new List<object>(); var seen = new HashSet<string>();
                Func<string, string> page = url =>
                {
                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                    using (var wc = new WebClient { Encoding = Encoding.UTF8 })
                    {
                        wc.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
                        wc.Headers[HttpRequestHeader.Accept] = "text/html,application/xhtml+xml"; wc.Headers[HttpRequestHeader.AcceptLanguage] = "en-US,en;q=0.9";
                        return wc.DownloadString(url);
                    }
                };
                Action<string, string> add = (u, label) => { u = System.Net.WebUtility.HtmlDecode(u); if (seen.Add(u) && list.Count < 60) list.Add(new Dictionary<string, object> { { "url", u }, { "label", label } }); };
                try
                {
                    if (src == "tpdb")
                    {
                        string h = page("https://theposterdb.com/search?term=" + Uri.EscapeDataString(q) + "&section=movies");
                        foreach (Match m in Regex.Matches(h, @"data-poster-id=""(\d+)""[\s\S]{0,1500}?(?:alt|title)=""([^""]*)""")) add("https://theposterdb.com/api/assets/" + m.Groups[1].Value, m.Groups[2].Value);
                        foreach (Match m in Regex.Matches(h, @"https://images\.theposterdb\.com/[^""'\s)]+?\.(?:jpe?g|png|webp)")) add(m.Value, q);
                        if (list.Count == 0) foreach (Match m in Regex.Matches(h, @"/api/assets/(\d+)")) add("https://theposterdb.com/api/assets/" + m.Groups[1].Value, q);
                    }
                    else
                    {
                        string h = page("https://www.movieposterdb.com/search?q=" + Uri.EscapeDataString(q));
                        Action<string> grab = html => { foreach (Match m in Regex.Matches(html, @"https://images\.movieposterdb\.com/[^""'\s)]+?\.(?:jpe?g|webp|png)")) add(Regex.Replace(m.Value, @"/s\d+/", "/l/"), q); };
                        grab(h);
                        foreach (Match m in Regex.Matches(h, @"href=""((?:https://www\.movieposterdb\.com)?/[a-z0-9-]+-i\d+/?)""").Cast<Match>().Select(x => x.Groups[1].Value).Distinct().Take(3).Select(x => Regex.Match(x, ".+")))
                            try { grab(page(m.Value.StartsWith("http") ? m.Value : "https://www.movieposterdb.com" + m.Value)); } catch { }
                    }
                }
                catch (Exception ex) { SendJson(ctx, new Dictionary<string, object> { { "items", list }, { "error", ex.Message } }); return; }
                SendJson(ctx, new Dictionary<string, object> { { "items", list } });
            }
            else if (path == "/api/vsubs")
            {
                // legendas externas ao lado do vídeo (mesmo nome, ex.: Filme.pt-BR.srt)
                string vf = WebHost.VideoFileOf(req.QueryString["c"], req.QueryString["p"]); var list = new List<object>();
                if (vf != null)
                {
                    string bn = Path.GetFileNameWithoutExtension(vf);
                    foreach (var f in Directory.GetFiles(Path.GetDirectoryName(vf)))
                    {
                        string e = Path.GetExtension(f).ToLowerInvariant(), n = Path.GetFileNameWithoutExtension(f);
                        if ((e == ".srt" || e == ".vtt") && n.StartsWith(bn, StringComparison.OrdinalIgnoreCase))
                        { string lab = n.Substring(bn.Length).Trim('.', ' ', '_', '-'); list.Add(new Dictionary<string, object> { { "name", lab == "" ? "Legenda" : lab }, { "file", Path.GetFileName(f) } }); }
                    }
                }
                SendJson(ctx, list);
            }
            else if (path == "/api/vsub")
            {
                string vf = WebHost.VideoFileOf(req.QueryString["c"], req.QueryString["p"]), fn = Path.GetFileName(req.QueryString["f"] ?? "");
                string sf = vf == null || fn == "" ? null : Path.Combine(Path.GetDirectoryName(vf), fn);
                if (sf == null || !File.Exists(sf)) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                var raw = File.ReadAllBytes(sf); string txt;
                try { txt = new UTF8Encoding(false, true).GetString(raw); } catch { txt = Encoding.GetEncoding(1252).GetString(raw); }   // legendas antigas costumam vir em ANSI
                Send(ctx, 200, "text/vtt; charset=utf-8", Utf8.GetBytes(SrtToVtt(txt)));
            }
            else if (path == "/api/vplayer" && req.HttpMethod == "POST")
            {
                // player avançado (mpv): upscaling e formatos que o player da página não toca
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == S(body, "console"));
                string vf = WebHost.VideoFileOf(S(body, "console"), S(body, "path"));
                if (c == null || vf == null) { SendJson(ctx, Err("Vídeo inválido"), 400); return; }
                var c2 = new Dictionary<string, object>(c); if (S(body, "upscale") != "") c2["upscale"] = S(body, "upscale"); if (S(body, "aspect") != "") c2["aspect"] = S(body, "aspect");
                string er = WebHost.Play(vf, c2);
                SendJson(ctx, er == null ? new Dictionary<string, object> { { "ok", true } } : Err(er), er == null ? 200 : 400);
            }
            else if (path == "/api/vthumb")
            {
                // miniatura do vídeo (um quadro a 20% do filme), gerada pelo mpv e guardada no cache
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == req.QueryString["c"]);
                string vf = c == null ? "" : Full(root, req.QueryString["p"] ?? ""), exe = WebHost.MpvExe();
                if (c == null || !File.Exists(vf) || !AllDirs(c).Any(rd => vf.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                string td = Path.Combine(CacheDir, "vthumb"), f = Path.Combine(td, Hash(vf + "|" + new FileInfo(vf).Length) + ".jpg");
                if (!File.Exists(f)) { Directory.CreateDirectory(td); ShellThumb(vf, f); }   // a mesma miniatura do Explorador do Windows
                if (!File.Exists(f) && exe != null)
                {
                    Directory.CreateDirectory(td); string tmp = Path.Combine(Path.GetTempPath(), "koru-th-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(tmp);
                    try
                    {
                        Process p = null; lock (WebHost.ThumbProcs) { p = Process.Start(new ProcessStartInfo(exe, "--no-config --msg-level=all=no --vo=image --vo-image-format=jpg --vo-image-jpeg-quality=88 --vo-image-outdir=\"" + tmp + "\" --frames=1 --start=20% --hr-seek=no --no-audio --no-sub --vf=scale=640:-2 -- \"" + vf + "\"") { UseShellExecute = false, CreateNoWindow = true }); WebHost.ThumbProcs.Add(p); }
                        if (!p.WaitForExit(20000)) try { p.Kill(); } catch { }
                        lock (WebHost.ThumbProcs) WebHost.ThumbProcs.Remove(p);
                        var o = Directory.GetFiles(tmp, "*.jpg").FirstOrDefault(); if (o != null) File.Copy(o, f, true);
                    }
                    catch { }
                    try { Directory.Delete(tmp, true); } catch { }
                }
                if (!File.Exists(f)) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                ctx.Response.Headers["Cache-Control"] = "max-age=31536000"; Send(ctx, 200, "image/jpeg", File.ReadAllBytes(f));
            }
            else if (path == "/api/tradutor" && req.HttpMethod == "POST")
            {
                // Tradutor de Tela (app próprio instalado à parte): abre a janela translúcida de tradução
                string exe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "TradutorDeTela", "TradutorDeTela.exe");
                if (!File.Exists(exe)) { SendJson(ctx, new Dictionary<string, object> { { "ok", false }, { "msg", "Tradutor de Tela não encontrado em " + exe } }); return; }
                try { Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(exe) }); SendJson(ctx, new Dictionary<string, object> { { "ok", true } }); }
                catch (Exception ex) { SendJson(ctx, new Dictionary<string, object> { { "ok", false }, { "msg", ex.Message } }); }
            }
            else if (path == "/api/open" && req.HttpMethod == "POST")
            {   // abre um link no navegador padrão (só https)
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                string u = S((Dictionary<string, object>)Json.DeserializeObject(bodyText), "url");
                if (Regex.IsMatch(u, "^https?://")) Process.Start(new ProcessStartInfo(u) { UseShellExecute = true });
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/sgdb")
            {   // SteamGridDB (a chave fica só no servidor local)
                string p = req.QueryString["p"] ?? "", key = S(cfg, "sgdbKey");
                if (!p.StartsWith("/api/v2/") || key == "") { SendJson(ctx, Err("SteamGridDB não configurado"), 400); return; }
                try
                {
                    using (var wc = Browser())
                    {
                        wc.Headers[HttpRequestHeader.Authorization] = "Bearer " + key;
                        Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(wc.DownloadString("https://www.steamgriddb.com" + p)));
                    }
                }
                catch (WebException we) { var hr = we.Response as HttpWebResponse; SendJson(ctx, Err(hr != null && (int)hr.StatusCode == 401 ? "Chave da API inválida" : we.Message), hr != null ? (int)hr.StatusCode : 502); }
            }
            else if (path == "/api/delete" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == S(body, "console"));
                string file = Full(root, S(body, "path"));
                if (c == null || !File.Exists(file) || !AllDirs(c).Any(rd => file.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)))
                { SendJson(ctx, Err("Arquivo não encontrado"), 404); return; }
                if (IsVideo(c))
                {   // vídeo: solta o arquivo (prévia, player, miniatura) e tenta de novo por alguns segundos
                    WebHost.ReleaseFile(file); Dictionary<string, object> res = null; string last = "";
                    for (int i = 0; i < 12 && res == null; i++) { try { res = DeleteRom(file); } catch (Exception ex) { last = ex.Message; Thread.Sleep(400); } }
                    SendJson(ctx, res ?? new Dictionary<string, object> { { "ok", false }, { "msg", "O arquivo ainda está em uso: " + last } });
                    return;
                }
                SendJson(ctx, IsPc(c) ? UninstallPcGame(file) : DeleteRom(file));
            }
            else if (path == "/api/localimg")
            {
                string p = req.QueryString["p"] ?? "";
                string ext = Path.GetExtension(p).ToLowerInvariant();
                var types = new Dictionary<string, string> { { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" }, { ".webp", "image/webp" }, { ".gif", "image/gif" }, { ".bmp", "image/bmp" } };
                if (!types.ContainsKey(ext) || !File.Exists(p)) { Send(ctx, 404, "text/plain", new byte[0]); return; }
                Send(ctx, 200, types[ext], File.ReadAllBytes(p));
            }
            else if (path == "/api/img")
            {
                // cache de capas em disco: baixa uma vez, depois serve direto do computador
                string u = req.QueryString["u"] ?? "";
                if (!Regex.IsMatch(u, "^https?://")) { Send(ctx, 400, "text/plain", new byte[0]); return; }
                string cdir = req.QueryString["k"] == "bg" ? BgCacheDir : CacheDir;   // fundos em pasta própria (limpáveis à parte)
                string f = Path.Combine(cdir, Hash(u));
                byte[] data = null;
                if (File.Exists(f)) data = File.ReadAllBytes(f);
                else
                {
                    try
                    {
                        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                        using (var wc = new WebClient())
                        {
                            wc.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
                            wc.Headers[HttpRequestHeader.Accept] = "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5";
                            wc.Headers[HttpRequestHeader.AcceptLanguage] = "pt-BR,pt;q=0.9,en;q=0.8";
                            if (u.Contains("wikia.nocookie.net")) wc.Headers[HttpRequestHeader.Referer] = "https://www.fandom.com/";
                            if (u.Contains("theposterdb.com")) wc.Headers[HttpRequestHeader.Referer] = "https://theposterdb.com/";
                            if (u.Contains("movieposterdb.com")) wc.Headers[HttpRequestHeader.Referer] = "https://www.movieposterdb.com/";
                            data = wc.DownloadData(u);
                        }
                        object en; bool on = !(cfg.TryGetValue("coverCache", out en) && en is bool && !(bool)en);
                        if (on && data.Length > 0) { Directory.CreateDirectory(cdir); File.WriteAllBytes(f, data); }
                    }
                    catch { Send(ctx, 404, "text/plain", new byte[0]); return; }
                }
                string type = data.Length > 3 && data[0] == 0x89 ? "image/png" : data.Length > 3 && data[0] == 0xFF ? "image/jpeg" : data.Length > 3 && data[0] == (byte)'<' ? "image/svg+xml" : data.Length > 3 && data[0] == (byte)'R' ? "image/webp" : "image/gif";
                ctx.Response.Headers["Cache-Control"] = "max-age=31536000";
                var r = ctx.Response; r.StatusCode = 200; r.ContentType = type; r.ContentLength64 = data.Length; r.OutputStream.Write(data, 0, data.Length); r.OutputStream.Close();
            }
            else if (path == "/api/artcache")
            {
                string f = Path.Combine(CacheDir, "resolved.json");
                if (req.HttpMethod == "POST")
                {
                    string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                    var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                    lock (CoverLock)
                    {
                        Directory.CreateDirectory(CacheDir);
                        var map = File.Exists(f) ? (Dictionary<string, object>)Json.DeserializeObject(File.ReadAllText(f, Encoding.UTF8)) : new Dictionary<string, object>();
                        object v; body.TryGetValue("val", out v);
                        if (v == null) map.Remove(S(body, "key")); else map[S(body, "key")] = v;
                        File.WriteAllText(f, Json.Serialize(map), Utf8);
                    }
                    SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
                }
                else Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(File.Exists(f) ? File.ReadAllText(f, Encoding.UTF8) : "{}"));
            }
            else if (path == "/api/cache/info")
            {
                object bm; string bgMode = cfg.TryGetValue("bgMode", out bm) && bm is string ? (string)bm : "video";
                long size = 0; int n = 0; var kinds = new Dictionary<string, object>();
                foreach (var kd in new[] { "covers", "bg", "search", "videos" }) { long ks = 0; int kn = 0; foreach (var fi in CacheFiles(kd)) { ks += fi.Length; kn++; } size += ks; n += kn; kinds[kd] = new Dictionary<string, object> { { "files", kn }, { "size", ks } }; }
                object en; bool on = !(cfg.TryGetValue("coverCache", out en) && en is bool && !(bool)en);
                SendJson(ctx, new Dictionary<string, object> { { "enabled", on }, { "size", size }, { "files", n }, { "kinds", kinds }, { "bgMode", bgMode }, { "coverStyle", S(cfg, "coverStyle") }, { "favGrid", S(cfg, "favGrid") }, { "theme", S(cfg, "theme") }, { "favBgGame", !(cfg.ContainsKey("favBgGame") && cfg["favBgGame"] is bool && !(bool)cfg["favBgGame"]) }, { "sgdb", S(cfg, "sgdbKey") != "" && cfg.ContainsKey("useSgdb") && cfg["useSgdb"] is bool && (bool)cfg["useSgdb"] }, { "fav", cfg.ContainsKey("fav") ? cfg["fav"] : null }, { "favConsole", !(cfg.ContainsKey("favConsole") && cfg["favConsole"] is bool && !(bool)cfg["favConsole"]) } });
            }
            else if (path == "/api/cache/clear" && req.HttpMethod == "POST")
            {
                string k = req.QueryString["k"] ?? "all";
                lock (CoverLock) { foreach (var kd in k == "all" ? new[] { "covers", "bg", "search", "videos" } : new[] { k }) foreach (var fi in CacheFiles(kd)) try { fi.Delete(); } catch { } }
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/hidden")
            {
                string f = Path.Combine(root, "central-hidden.json");
                if (req.HttpMethod == "POST")
                {
                    string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                    Json.DeserializeObject(bodyText);   // valida
                    lock (CoverLock) File.WriteAllText(f, bodyText, Utf8);
                    SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
                }
                else Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(File.Exists(f) ? File.ReadAllText(f, Encoding.UTF8) : "[]"));
            }
            else if (path == "/api/setup" && req.HttpMethod == "GET")
                SendJson(ctx, new Dictionary<string, object> { { "needed", NeedsSetup }, { "suggest", "" }, { "stores", StoreDirs() } });
            else if (path == "/api/setup" && req.HttpMethod == "POST")
            {
                // configuração automática a partir das pastas escolhidas no "boas-vindas"
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                var pcs = new List<string>(); if (S(body, "pc") != "") pcs.Add(S(body, "pc"));
                if (body.ContainsKey("pcDirs") && body["pcDirs"] is object[]) foreach (var o in (object[])body["pcDirs"]) { var d = (o as string ?? "").Trim(); if (d != "" && !pcs.Contains(d, StringComparer.OrdinalIgnoreCase)) pcs.Add(d); }
                var auto = AutoConfig.Build(S(body, "root"), pcs);
                // só a pasta da Steam nos jogos de PC: o console usa o ícone da Steam no lugar do "PC Games" genérico
                try
                {
                    string steamDir = StoreDirs().Cast<Dictionary<string, object>>().Where(x => S(x, "id") == "steam").Select(x => S(x, "path")).FirstOrDefault() ?? "";
                    if (pcs.Count == 1 && steamDir != "" && pcs[0].TrimEnd('\\').Equals(steamDir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
                        foreach (Dictionary<string, object> ac in (object[])auto["consoles"]) if (S(ac, "type") == "pc") ac["logo"] = "art:steam";
                }
                catch { }
                if (S(body, "video") != "" && Directory.Exists(S(body, "video"))) { var cl = ((object[])auto["consoles"]).ToList(); var vc = VideoConsole(S(body, "video")); cl.Add(vc); auto["consoles"] = cl.ToArray(); }
                foreach (Dictionary<string, object> ac in (object[])auto["consoles"]) { if (IsVideo(ac)) continue; ac["fullscreen"] = false; ac["fsArgs"] = FullscreenArg(Full(S(auto, "root"), S(ac, "emulator"))); }
                if (S(body, "sgdbKey") != "") { auto["sgdbKey"] = S(body, "sgdbKey"); auto["useSgdb"] = true; }
                bool runKey = false;
                try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) runKey = k.GetValue("Koru") != null; } catch { }
                auto["autostart"] = NeedsSetup ? runKey : !(cfg.ContainsKey("autostart") && cfg["autostart"] is bool && !(bool)cfg["autostart"]);
                SaveConfigText(Json.Serialize(auto));
                ApplyAutostart(auto);
                SendJson(ctx, new Dictionary<string, object> { { "ok", true }, { "consoles", ((object[])auto["consoles"]).Length } });
            }
            else if (path == "/api/covers")
            {
                string f = Path.Combine(root, "central-covers.json");
                Send(ctx, 200, "application/json; charset=utf-8", Utf8.GetBytes(File.Exists(f) ? File.ReadAllText(f, Encoding.UTF8) : "{}"));
            }
            else if (path == "/api/cover/clear" && req.HttpMethod == "POST")
            {
                // escolhas salvas pelo usuário: picks = capas/fundos/logos escolhidos à mão; frames = enquadramento (posição/zoom) das imagens
                string k = req.QueryString["k"] ?? "", f = Path.Combine(root, "central-covers.json"); int n = 0;
                var known = new HashSet<string> { "bg", "bofs", "cat", "fav", "fcard", "ffree", "fnew", "fofs", "fpos", "fsz", "lcat", "logo", "name", "pref", "bga" };
                lock (CoverLock)
                {
                    var map = File.Exists(f) ? (Dictionary<string, object>)Json.DeserializeObject(File.ReadAllText(f, Encoding.UTF8)) : new Dictionary<string, object>();
                    foreach (var key in map.Keys.ToList())
                    {
                        int i = key.IndexOf('|'); string pre = i > 0 ? key.Substring(0, i) : "";
                        bool del = k == "frames" ? (pre == "fofs" || pre == "bofs") : k == "picks" && (pre == "bg" || pre == "fcard" || pre == "logo" || (i > 0 && !known.Contains(pre)));
                        if (del) { map.Remove(key); n++; }
                    }
                    File.WriteAllText(f, Json.Serialize(map), Utf8);
                }
                SendJson(ctx, new Dictionary<string, object> { { "ok", true }, { "removed", n } });
            }
            else if (path == "/api/cover" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                string f = Path.Combine(root, "central-covers.json");
                lock (CoverLock)
                {
                    var map = File.Exists(f) ? (Dictionary<string, object>)Json.DeserializeObject(File.ReadAllText(f, Encoding.UTF8)) : new Dictionary<string, object>();
                    string k = S(body, "key"), u = S(body, "url");
                    if (u == "") map.Remove(k); else map[k] = u;
                    File.WriteAllText(f, Json.Serialize(map), Utf8);
                }
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else if (path == "/api/setemu" && req.HttpMethod == "POST")
            {
                // jogo sem emulador: o usuário escolhe o .exe, já configuramos tudo (caminho, argumentos, tela cheia) e salvamos
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == S(body, "console"));
                if (c == null) { SendJson(ctx, Err("Console não encontrado"), 404); return; }
                string picked = Browse(false, root);
                if (picked == null) { SendJson(ctx, new Dictionary<string, object> { { "ok", false } }); return; }
                string rel = picked.StartsWith(root.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase) ? picked.Substring(root.TrimEnd('\\').Length + 1).Replace('\\', '/') : picked;
                c["emulator"] = rel;
                if (S(c, "args") == "") c["args"] = "\"{rom}\"";
                c["fsArgs"] = FullscreenArg(picked);
                if (!c.ContainsKey("fullscreen")) c["fullscreen"] = false;
                SaveConfigText(Json.Serialize(cfg));
                SendJson(ctx, new Dictionary<string, object> { { "ok", true }, { "emulator", rel } });
            }
            else if (path == "/api/launch" && req.HttpMethod == "POST")
            {
                string bodyText; using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyText = sr.ReadToEnd();
                var body = (Dictionary<string, object>)Json.DeserializeObject(bodyText);
                var c = Consoles(cfg).FirstOrDefault(x => S(x, "id") == S(body, "console"));
                if (c == null) { SendJson(ctx, Err("Console não encontrado"), 404); return; }
                string emu = Full(root, S(c, "emulator"));
                if (IsVideo(c))
                {
                    string vf = Full(root, S(body, "path"));
                    bool okv = AllDirs(c).Any(rd => vf.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
                    if (!okv || !File.Exists(vf)) { SendJson(ctx, Err("Vídeo inválido"), 400); return; }
                    string er = WebHost.Play(vf, c);
                    SendJson(ctx, er == null ? new Dictionary<string, object> { { "ok", true } } : Err(er), er == null ? 200 : 400);
                    return;
                }
                if (IsPc(c))
                {
                    string game = Full(root, S(body, "path"));
                    bool ok = AllDirs(c).Any(rd => game.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
                    if (!ok || !File.Exists(game)) { SendJson(ctx, Err("Atalho inválido"), 400); return; }
                    Process.Start(new ProcessStartInfo(game) { WorkingDirectory = Path.GetDirectoryName(game), UseShellExecute = true });
                    WebHost.GameStarted(null);
                    WebHost.FollowForeground();   // jogo de PC (Steam etc.): leva a janela nova para o monitor do Koru
                    SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
                    return;
                }
                if (emu == "" || !File.Exists(emu)) { SendJson(ctx, Err("Nenhum emulador configurado para " + S(c, "name") + "."), 400); return; }
                string rom = Full(root, S(body, "path"));
                bool inside = AllDirs(c).Any(rd => rom.StartsWith(Full(root, rd).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
                if (!inside || !File.Exists(rom)) { SendJson(ctx, Err("ROM inválida"), 400); return; }
                string args = S(c, "args"); if (args == "") args = "\"{rom}\"";
                // tela cheia (padrão: desligado — alguns emuladores/versões não aceitam o argumento e nem abrem o jogo) — argumento próprio de cada emulador, editável na configuração
                object fsv; bool fs = c.TryGetValue("fullscreen", out fsv) && fsv is bool && (bool)fsv;
                string fsArgs = c.ContainsKey("fsArgs") ? S(c, "fsArgs") : FullscreenArg(emu);
                if (fs && fsArgs != "") args = fsArgs + " " + args;
                var proc = Process.Start(new ProcessStartInfo(emu, args.Replace("{rom}", rom)) { WorkingDirectory = Path.GetDirectoryName(emu), UseShellExecute = true });
                WebHost.GameStarted(proc);
                WebHost.FollowToAppScreen(proc);   // abre no mesmo monitor do Koru
                SendJson(ctx, new Dictionary<string, object> { { "ok", true } });
            }
            else Send(ctx, 404, "text/plain", Utf8.GetBytes("404"));
        }
        catch (Exception ex)
        {
            try { SendJson(ctx, Err(ex.Message), 500); } catch { }
        }
    }
}
