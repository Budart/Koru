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

// Koru — leitura, gravação e normalização da configuração
static partial class Central
{
    static string Resource(string name)
    {
        using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        using (var r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd();
    }

    // configuração: %LOCALAPPDATA%\CentralDeJogos\config.json
    static readonly string AppConfig = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "config.json");
    static string ConfigFile { get { return AppConfig; } }
    // pastas onde as lojas costumam deixar os atalhos dos jogos (oferecidas no "boas-vindas")
    static object[] StoreDirs()
    {
        string ap = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), pd = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        string um = Path.Combine(ap, @"Microsoft\Windows\Start Menu\Programs"), cm = Path.Combine(pd, @"Microsoft\Windows\Start Menu\Programs");
        Func<string[], string> first = ps => ps.FirstOrDefault(Directory.Exists) ?? ps[0];
        var list = new[] {
            new[] { "steam", "Steam", first(new[] { Path.Combine(um, "Steam"), Path.Combine(cm, "Steam") }) },
        };
        return list.Select(x => (object)new Dictionary<string, object> { { "id", x[0] }, { "name", x[1] }, { "path", x[2] }, { "exists", Directory.Exists(x[2]) } }).ToArray();
    }
    static bool NeedsSetup { get { return !File.Exists(AppConfig); } }

    static Dictionary<string, object> LoadConfig()
    {
        string text = null;
        try { if (File.Exists(ConfigFile)) text = File.ReadAllText(ConfigFile, Encoding.UTF8); } catch { }
        if (text == null) return new Dictionary<string, object> { { "port", 8765 }, { "root", "" }, { "consoles", new object[0] } };
        var cfg = (Dictionary<string, object>)Json.DeserializeObject(text);
        FixRomExtensions(cfg);
        return cfg;
    }
    // versões anteriores tiravam .zip/.7z de alguns consoles (as ROMs sumiam e o console saía da tela inicial): devolve na lista
    static void FixRomExtensions(Dictionary<string, object> cfg)
    {
        try
        {
            object cs; if (!cfg.TryGetValue("consoles", out cs) || !(cs is object[])) return;
            foreach (var o in (object[])cs)
            {
                var c = o as Dictionary<string, object>; if (c == null) continue;
                string id = S(c, "id"); if (id != "snes" && id != "sms" && id != "genesis") continue;
                var ext = L(c, "extensions").Select(x => x.ToLowerInvariant()).ToList();
                if (ext.Contains("zip")) continue;
                ext.Add("zip"); ext.Add("7z"); c["extensions"] = ext.Distinct().ToArray();
            }
        }
        catch { }
    }
    static void SaveConfigText(string text) { Directory.CreateDirectory(Path.GetDirectoryName(ConfigFile)); File.WriteAllText(ConfigFile, text, Utf8); }

    static string Root(Dictionary<string, object> cfg)
    {
        object r; if (cfg.TryGetValue("root", out r) && r is string && Directory.Exists((string)r)) return (string)r;
        return Path.GetDirectoryName(ExePath);
    }

    static bool IsPc(Dictionary<string, object> c) { return S(c, "type") == "pc"; }
    static bool IsVideo(Dictionary<string, object> c) { return S(c, "type") == "video"; }
    static readonly string[] VideoExt = { "mkv", "mp4", "avi", "mov", "wmv", "m4v", "webm", "flv", "ts", "m2ts", "mts", "mpg", "mpeg", "vob", "ogv", "3gp", "rmvb", "divx", "iso" };
    static Dictionary<string, object> VideoConsole(string dir)
    {
        return new Dictionary<string, object> { { "id", "videos" }, { "type", "video" }, { "name", "Filmes e vídeos" }, { "art", "" }, { "thumbs", "" }, { "emulator", "" }, { "args", "" },
            { "romDirs", new[] { dir } }, { "extensions", VideoExt }, { "upscale", "off" }, { "aspect", "auto" }, { "videoFull", true }, { "subOn", true }, { "subLang", "pt,por,pob,pt-BR,en,eng" }, { "subSize", "46" }, { "subColor", "white" }, { "subBg", "outline" }, { "subPos", "95" } };
    }
    static string Rel(string root, string full)
    {
        string r = root.TrimEnd('\\') + "\\";
        return full.StartsWith(r, StringComparison.OrdinalIgnoreCase) ? full.Substring(r.Length) : full;
    }
    static string S(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) && v != null ? v.ToString() : ""; }
    static bool B(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) && v is bool && (bool)v; }
    static List<string> L(Dictionary<string, object> d, string k)
    {
        object v; var res = new List<string>();
        if (d.TryGetValue(k, out v) && v is IEnumerable && !(v is string)) foreach (var x in (IEnumerable)v) res.Add(x.ToString());
        return res;
    }
    static string Full(string root, string rel)
    {
        if (string.IsNullOrEmpty(rel)) return "";
        return Path.GetFullPath(Path.Combine(root, rel.Replace('/', '\\')));
    }
    static IEnumerable<Dictionary<string, object>> Consoles(Dictionary<string, object> cfg)
    {
        foreach (var o in (IEnumerable)cfg["consoles"]) yield return (Dictionary<string, object>)o;
    }
}
