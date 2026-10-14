using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Web.Script.Serialization;

// Koru — conversor de áudio (FFmpeg, baixado uma vez): faz o player tocar Dolby Digital / Dolby Digital Plus / TrueHD / DTS
// convertendo só o áudio, em pedaços de alguns segundos, para AAC (o vídeo continua sendo lido direto do arquivo)
static partial class WebHost
{
    public static readonly string FfDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos", "ffmpeg");
    public static string FfExe()
    {
        try { if (Directory.Exists(FfDir)) return Directory.GetFiles(FfDir, "ffmpeg.exe", SearchOption.AllDirectories).FirstOrDefault(); } catch { }
        return null;
    }
    public static volatile bool FfBusy; public static volatile int FfProgress; public static volatile string FfError = "", FfStep = "";
    public static void FfInstall()
    {
        if (FfBusy) return; FfBusy = true; FfError = ""; FfProgress = 0;
        new Thread(() =>
        {
            string tmp = Path.Combine(Path.GetTempPath(), "koru-ff-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(tmp);
                var urls = new List<string>();
                try
                {   // versões oficiais do FFmpeg para Windows (BtbN, GitHub)
                    var rel = (Dictionary<string, object>)new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(Get("https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"));
                    foreach (var o in (System.Collections.IEnumerable)rel["assets"]) { var a = (Dictionary<string, object>)o; string n = (a["name"] ?? "").ToString(); if (n.EndsWith("win64-lgpl.zip") && n.Contains("master")) urls.Add(a["browser_download_url"].ToString()); }
                }
                catch (Exception ex) { MpvLog("ffmpeg API: " + ex.Message); }
                urls.Add("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip");
                urls.Add("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip");
                string zip = Path.Combine(tmp, "ff.zip"); Exception last = null; bool ok = false;
                foreach (var u in urls.Distinct())
                {
                    try { FfStep = "Baixando o conversor de áudio..."; MpvLog("baixando " + u); Fetch(u, zip, p => FfProgress = p * 90 / 100); ok = true; break; }
                    catch (Exception ex) { last = ex; MpvLog("falhou: " + ex.Message); }
                }
                if (!ok) throw last ?? new Exception("download falhou");
                FfStep = "Instalando...";
                if (Directory.Exists(FfDir)) Directory.Delete(FfDir, true); Directory.CreateDirectory(FfDir);
                using (var z = ZipFile.OpenRead(zip))
                    foreach (var e in z.Entries) if (e.Name.Equals("ffmpeg.exe", StringComparison.OrdinalIgnoreCase) || (e.FullName.Contains("/bin/") && e.Name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))) e.ExtractToFile(Path.Combine(FfDir, e.Name), true);
                if (FfExe() == null) throw new Exception("ffmpeg.exe não veio no pacote");
                FfProgress = 100; FfStep = "Pronto";
            }
            catch (Exception ex) { FfError = ex.Message; MpvLog("ffmpeg ERRO: " + ex); }
            finally { try { Directory.Delete(tmp, true); } catch { } FfBusy = false; }
        }) { IsBackground = true }.Start();
    }
    // um pedaço do áudio (faixa k, a partir de t segundos, d segundos) convertido para AAC estéreo
    public static byte[] AudioSegment(string file, int k, double t, double d)
    {
        string exe = FfExe(); if (exe == null) return null;
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        var psi = new ProcessStartInfo(exe, string.Format(inv, "-nostdin -v error -ss {0:0.###} -i \"{1}\" -t {2:0.###} -map 0:a:{3} -vn -sn -dn -ac 2 -c:a aac -b:a 192k -f adts -", t, file, d, k))
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        using (var p = Process.Start(psi))
        {
            Tie(p);
            lock (ThumbProcs) ThumbProcs.Add(p);   // ao excluir o vídeo, também é encerrado
            var ms = new MemoryStream(); var err = p.StandardError.ReadToEndAsync();
            p.StandardOutput.BaseStream.CopyTo(ms);
            if (!p.WaitForExit(30000)) try { p.Kill(); } catch { }
            lock (ThumbProcs) ThumbProcs.Remove(p);
            if (ms.Length == 0) { MpvLog("ffmpeg segmento vazio: " + err.Result); return null; }
            return ms.ToArray();
        }
    }
}
