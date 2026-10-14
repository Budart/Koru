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

// Koru — descoberta de jogos, categorias e código do jogo nas ROMs
static partial class Central
{
    static readonly Regex TitleId = new Regex(@"\[([0-9A-Fa-f]{16})\]");
    static readonly RegexOptions RI = RegexOptions.IgnoreCase;
    static readonly Tuple<string, Regex>[] Cats = {
        Tuple.Create("Traduzidos",       new Regex(@"\[T[+-]|\(BR\)|\bPT-?BR\b|romsportugues|\(Traduzid|\(T\d", RI)),
        Tuple.Create("Hack / Mod",      new Regex(@"\bhacks?\b|\[h\d*[^\]]*\]|\bmods?\b|\b4K\b|randomizer|\bredux\b|kaizo", RI)),
        Tuple.Create("Homebrew / Port", new Regex(@"\(PD\)|\[PD\]|homebrew|test ?suite|harkinian|\bport\b", RI)),
        Tuple.Create("Beta / Protótipo",new Regex(@"\((Beta|Proto|Prototype|Demo|Sample|Kiosk)[^)]*\)", RI)),
        Tuple.Create("Não licenciado",  new Regex(@"\((Unl|Unlicensed|Pirate)\)|\[p\d|\d+-in-1", RI)),
    };
    static bool IsCustom(Dictionary<string, object> g) { var c = (string)g["cat"]; return c != "" && c != "Traduzidos" && c != PcTools && c != PcOther; }
    const string PcTools = "Ferramentas para jogos", PcOther = "Outros programas";

    // ---- "inteligência" para separar jogos, ferramentas de jogos e outros programas nos atalhos do PC ----
    static readonly Regex ToolWords = new Regex(@"\b(launcher|uninstall\w*|desinstal\w*|setup|config\w*|settings|editor|mod ?manager|mods?\b|vortex|mo2|reshade|dxvk|benchmark|afterburner|rivatuner|rtss|steam|epic games|gog galaxy|ea app|origin|ubisoft connect|uplay|battle\.?net|rockstar games launcher|playnite|launchbox|retroarch|duckstation|pcsx2|rpcs3|dolphin|yuzu|ryujinx|eden|cemu|ppsspp|citra|azahar|xenia|project64|snes9x|ds4windows|x360ce|dsx|controller|joy ?to ?key|server|crash ?report\w*|readme|manual|tool(s|kit)?|patch(er)?|trainer|wemod|cheat ?engine|7th heaven|nexus|overlay|geforce experience|nvidia app|adrenalin|parsec|moonlight|sunshine|obs|discord|twitch|nsp[_ ]?installer|tico)\b", RegexOptions.IgnoreCase);
    static readonly Regex GameDirs = new Regex(@"steamapps\\common|\\epic games\\|gog galaxy\\games|\\gog games\\|xboxgames|\\riot games\\|ubisoft game launcher\\games|\\ea games\\|\\games\\|\\jogos\\|rockstar games\\(?!launcher)|\\battle\.net\\(?!battle)", RegexOptions.IgnoreCase);
    static readonly Regex OtherApps = new Regex(@"\b(chrome|firefox|microsoft edge|opera|brave|word|excel|powerpoint|outlook|onenote|office|teams|zoom|skype|slack|whatsapp|telegram|spotify|tidal|deezer|vlc|media player|photoshop|illustrator|premiere|acrobat|adobe|reader|winrar|7-?zip|ccleaner|calculadora|calculator|notepad|bloco de notas|file explorer|explorador de arquivos|onedrive|dropbox|google drive|painel de controle|control panel|qbittorrent|utorrent|anydesk|teamviewer|visual studio|vs ?code|android studio|intellij|pycharm|python|terminal|powershell|prompt de comando|gimp|audacity|handbrake|virtualbox|vmware|docker|postman|figma|notion|evernote|chatgpt|claude|codex|copilot|lm studio)\b", RegexOptions.IgnoreCase);

    static string LnkTarget(string lnk)
    {
        try
        {
            var t = Type.GetTypeFromProgID("WScript.Shell");
            object sh = Activator.CreateInstance(t);
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { lnk });
            return (string)sc.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, sc, null) ?? "";
        }
        catch { return ""; }
    }
    static string PcCategory(FileInfo f)
    {
        string name = Path.GetFileNameWithoutExtension(f.Name), target = "", ext = f.Extension.ToLowerInvariant();
        if (ext == ".url") { try { target = File.ReadAllText(f.FullName); } catch { } }
        else if (ext == ".lnk") target = LnkTarget(f.FullName);
        else target = f.FullName;
        bool storeGame = Regex.IsMatch(target, @"steam://(rungameid|run)/|com\.epicgames\.launcher://apps|goggalaxy://|uplay://launch|origin2?://game|battlenet://", RegexOptions.IgnoreCase);
        if (ToolWords.IsMatch(name)) return PcTools;
        if (storeGame || GameDirs.IsMatch(target)) return "";
        if (OtherApps.IsMatch(name) || OtherApps.IsMatch(Path.GetFileNameWithoutExtension(target))) return PcOther;
        if (ToolWords.IsMatch(Path.GetFileNameWithoutExtension(target))) return PcTools;
        if (Regex.IsMatch(target, @"\\(windows|system32)\\|\\microsoft office\\|\\common files\\", RegexOptions.IgnoreCase)) return PcOther;
        return "";   // na dúvida, considera jogo
    }
    static string Category(string text)
    {
        foreach (var c in Cats) if (c.Item2.IsMatch(text)) return c.Item1;
        return "";
    }
    static readonly Regex NonBase = new Regex(@"\((Update|DLC|eShop)");

    // pastas das lojas marcadas nas configurações (Jogos de PC): { "steam": "C:\\...", ... }
    static Dictionary<string, string> StoreDirsOf(Dictionary<string, object> c)
    {
        var r = new Dictionary<string, string>(); object v;
        if (c.TryGetValue("storeDirs", out v) && v is Dictionary<string, object>) foreach (var kv in (Dictionary<string, object>)v) if (kv.Value != null && kv.Value.ToString().Trim() != "") r[kv.Key] = kv.Value.ToString().Trim();
        return r;
    }
    static List<string> AllDirs(Dictionary<string, object> c) { var l = L(c, "romDirs").Where(x => !string.IsNullOrWhiteSpace(x)).ToList(); l.AddRange(StoreDirsOf(c).Values); if (IsVideo(c)) l.AddRange(L(c, "privateDirs").Where(x => !string.IsNullOrWhiteSpace(x))); return l; }
    static readonly Regex StoreLink = new Regex(@"steam://|com\.epicgames\.launcher://|goggalaxy://|uplay://|origin2?://|battlenet://", RegexOptions.IgnoreCase);
    static readonly Regex StoreDir = new Regex(@"\\Start Menu\\Programs\\(Steam|GOG\.com|Epic Games)\\|\\XboxGames\\", RegexOptions.IgnoreCase);
    // o mesmo jogo em pastas diferentes (mesmo destino ou mesmo nome) aparece uma vez só; vence o atalho "oficial" da loja
    static List<Dictionary<string, object>> PcDedupe(string root, List<Dictionary<string, object>> games, List<string> storeRoots)
    {
        Func<string, string> norm = n => Regex.Replace(n.ToLowerInvariant(), @"[^\p{L}\p{N}]+", "");
        var info = games.Select(g =>
        {
            string full = Full(root, (string)g["path"]), ext = Path.GetExtension(full).ToLowerInvariant(), target = "";
            try { if (ext == ".url") { var m = Regex.Match(File.ReadAllText(full), @"^URL=(.+)$", RegexOptions.Multiline); target = m.Success ? m.Groups[1].Value.Trim() : ""; } else if (ext == ".lnk") target = LnkTarget(full); else target = full; } catch { }
            int score = 0;
            if (storeRoots.Any(r => r != "" && full.StartsWith(r.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))) score += 4;
            if (StoreDir.IsMatch(full)) score += 2;
            if (StoreLink.IsMatch(target)) score += 1;
            return new { g, t = target.ToLowerInvariant(), n = norm((string)g["name"]), score };
        }).OrderByDescending(x => x.score).ToList();
        var seenT = new HashSet<string>(); var seenN = new HashSet<string>(); var res = new List<Dictionary<string, object>>();
        foreach (var x in info)
        {
            if ((x.t != "" && seenT.Contains(x.t)) || (x.n != "" && seenN.Contains(x.n))) continue;
            if (x.t != "") seenT.Add(x.t); if (x.n != "") seenN.Add(x.n); res.Add(x.g);
        }
        return res;
    }
    // ---- duração dos vídeos: lida pelo próprio Windows (mesma coluna "Duração" do Explorador) e guardada em cache ----
    [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropKey { public Guid fmtid; public uint pid; }
    [StructLayout(LayoutKind.Explicit, Size = 24)] struct PropVar { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public ulong ul; }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore { [PreserveSig] int GetCount(out uint c); [PreserveSig] int GetAt(uint i, out PropKey k); [PreserveSig] int GetValue(ref PropKey k, out PropVar v); }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr pbc, int flags, ref Guid riid, out IPropertyStore ps);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVar v);
    static Dictionary<string, string> durCache; static readonly object durLock = new object(); static bool durDirty;
    static string DurFile { get { return Path.Combine(CacheDir, "vdur.json"); } }
    static double VideoSeconds(FileInfo f)
    {
        string key = f.FullName.ToLowerInvariant(), sig = f.Length + "|" + f.LastWriteTimeUtc.Ticks;
        lock (durLock)
        {
            if (durCache == null) { durCache = new Dictionary<string, string>(); try { foreach (var kv in (Dictionary<string, object>)Json.DeserializeObject(File.ReadAllText(DurFile))) durCache[kv.Key] = kv.Value as string ?? ""; } catch { } }
            string v; if (durCache.TryGetValue(key, out v) && v.StartsWith(sig + "|")) return double.Parse(v.Substring(sig.Length + 1), System.Globalization.CultureInfo.InvariantCulture);
        }
        double secs = 0;
        try
        {
            var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"); IPropertyStore ps;
            if (SHGetPropertyStoreFromParsingName(f.FullName, IntPtr.Zero, 0, ref iid, out ps) == 0 && ps != null)
            {
                var pk = new PropKey { fmtid = new Guid("64440490-4C8B-11D1-8B70-080036B11A03"), pid = 3 }; PropVar pv;
                if (ps.GetValue(ref pk, out pv) == 0) { if (pv.vt == 21) secs = pv.ul / 1e7; PropVariantClear(ref pv); }
                Marshal.ReleaseComObject(ps);
            }
        }
        catch { }
        lock (durLock) { durCache[key] = sig + "|" + secs.ToString(System.Globalization.CultureInfo.InvariantCulture); durDirty = true; }
        return secs;
    }
    static void SaveDurations() { lock (durLock) { if (!durDirty || durCache == null) return; try { Directory.CreateDirectory(CacheDir); File.WriteAllText(DurFile, Json.Serialize(durCache)); durDirty = false; } catch { } } }

    static List<Dictionary<string, object>> Games(string root, Dictionary<string, object> c)
    {
        var exts = new HashSet<string>(L(c, "extensions").Select(e => "." + e.ToLowerInvariant()));
        var games = new List<Dictionary<string, object>>();
        var sd = StoreDirsOf(c); var dirs = AllDirs(c);
        foreach (var rd in dirs.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            string dir = Full(root, rd);
            if (!Directory.Exists(dir)) continue;
            List<FileInfo> files;
            try
            {
                files = new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories)
                    .Where(f => exts.Contains(f.Extension.ToLowerInvariant())).ToList();
            }
            catch { continue; }
            var excl = L(c, "excludeDirs").Select(x => Full(root, x).TrimEnd('\\') + "\\").ToList();
            if (excl.Count > 0) files = files.Where(f => !excl.Any(x => f.FullName.StartsWith(x, StringComparison.OrdinalIgnoreCase))).ToList();
            foreach (var grp in files.GroupBy(f => f.DirectoryName))
            {
                var list = grp.ToList();
                if (list.Any(f => f.Extension.Equals(".cue", StringComparison.OrdinalIgnoreCase)))
                    list = list.Where(f => !f.Extension.Equals(".bin", StringComparison.OrdinalIgnoreCase)).ToList();
                if (B(c, "switchBaseOnly"))
                    list = list.Where(f =>
                    {
                        var m = TitleId.Match(f.Name);
                        if (m.Success) return m.Groups[1].Value.EndsWith("000");
                        return !NonBase.IsMatch(f.Name);
                    }).ToList();
                foreach (var f in list)
                {
                    string name = Path.GetFileNameWithoutExtension(f.Name);
                    if (B(c, "nameFromFolder") && list.Count == 1 &&
                        !f.Directory.FullName.TrimEnd('\\').Equals(dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
                        name = f.Directory.Name;
                    if (IsVideo(c))
                    {   // vídeos: categoria = 1ª subpasta; pasta privada só aparece quando o usuário revela
                        string rel = f.DirectoryName.Length > dir.TrimEnd('\\').Length ? f.DirectoryName.Substring(dir.TrimEnd('\\').Length).Trim('\\') : "";
                        bool priv = L(c, "privateDirs").Any(x => !string.IsNullOrWhiteSpace(x) && Full(root, x).TrimEnd('\\').Equals(dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase));
                        // subcategoria dos vídeos: pela duração (Filmes ≥ 1 h, Vídeos < 1 h); com mais de uma pasta principal, o nome dela vem antes
                        double secs = VideoSeconds(f); bool movie = secs > 0 ? secs >= 3600 : f.Length >= 700L * 1024 * 1024;
                        string kind = movie ? "Filmes" : "Vídeos", mainDirs = dirs.Count(x => !string.IsNullOrWhiteSpace(x) && !L(c, "privateDirs").Contains(x)) > 1 ? new DirectoryInfo(dir).Name + " · " : "";
                        var vg = new Dictionary<string, object> { { "name", name }, { "path", Rel(root, f.FullName) }, { "size", f.Length }, { "mtime", (long)(f.LastWriteTimeUtc - new DateTime(1970, 1, 1)).TotalMilliseconds }, { "cat", mainDirs + kind } };
                        if (secs > 0) vg["secs"] = (long)secs;
                        if (priv) vg["priv"] = true;
                        games.Add(vg); continue;
                    }
                    games.Add(new Dictionary<string, object> {
                        { "name", name }, { "path", Rel(root, f.FullName) }, { "size", f.Length }, { "mtime", (long)(f.LastWriteTimeUtc - new DateTime(1970, 1, 1)).TotalMilliseconds },
                        { "cat", IsPc(c) ? PcCategory(f) : Category(f.FullName.Substring(dir.Length)) }
                    });
                }
            }
        }
        if (IsPc(c)) games = PcDedupe(root, games, sd.Values.Select(x => Full(root, x)).ToList());
        if (IsVideo(c)) SaveDurations();
        return games.OrderBy(g => (string)g["name"], StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    // lê o código do jogo dentro da ROM (para o repositório GameTDB / xlenore)
    static readonly Regex Serial = new Regex(@"(S[CL][UEPKA][SMD])[_-](\d{3})\.?(\d{2})");
    static string GameId(string console, string rom)
    {
        string ext = Path.GetExtension(rom).ToLowerInvariant();
        if (ext == ".cue")
        {
            var m = Regex.Match(File.ReadAllText(rom), "FILE\\s+\"([^\"]+)\"");
            if (m.Success) rom = Path.Combine(Path.GetDirectoryName(rom), m.Groups[1].Value); ext = Path.GetExtension(rom).ToLowerInvariant();
        }
        if (console == "pc")
        {
            if (ext != ".url") return "";
            var m = Regex.Match(File.ReadAllText(rom), @"steam://(?:rungameid|run)/(\d+)");
            return m.Success ? m.Groups[1].Value : "";
        }
        if (!File.Exists(rom) || ext == ".zip" || ext == ".7z" || ext == ".chd" || ext == ".cso") return "";
        Func<long, int, string> read = (off, len) =>
        {
            using (var f = File.OpenRead(rom)) { if (f.Length < off + len) return ""; f.Seek(off, SeekOrigin.Begin); var b = new byte[len]; f.Read(b, 0, len); return Encoding.ASCII.GetString(b).Trim('\0', ' '); }
        };
        Func<string, bool> clean = v => Regex.IsMatch(v, "^[A-Z0-9]+$");
        switch (console)
        {
            case "wii": { var v = read(ext == ".wbfs" ? 0x200 : 0, 6); return clean(v) ? v : ""; }
            case "nds": { var v = read(0x0C, 4); return clean(v) ? v : ""; }
            case "3ds": { var v = read(0x4150, 16); var m = Regex.Match(v, "CTR-[A-Z]-([A-Z0-9]{4})"); return m.Success ? m.Groups[1].Value : ""; }
            case "ps1": case "ps2":
            {
                using (var f = File.OpenRead(rom))
                {
                    var buf = new byte[Math.Min(f.Length, 8 * 1024 * 1024)];
                    int n = f.Read(buf, 0, buf.Length);
                    var m = Serial.Match(Encoding.ASCII.GetString(buf, 0, n));
                    return m.Success ? m.Groups[1].Value + "-" + m.Groups[2].Value + m.Groups[3].Value : "";
                }
            }
        }
        return "";
    }
}
