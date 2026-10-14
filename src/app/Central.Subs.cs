using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

// Koru — legendas: embutidas no MKV (texto: SRT/ASS/WebVTT), externas (.srt/.vtt/.ass) e escolhidas à mão; tudo vira WebVTT para o player
static partial class Central
{
    class SubTrack { public int Num; public string Codec = "", Lang = "", Name = "", Priv = ""; public bool Def, Forced; }

    // ---------- leitura do Matroska (EBML) ----------
    static long VInt(Stream s, bool keepMarker, out int len)
    {
        int b = s.ReadByte(); len = 0; if (b < 0) return -1;
        int mask = 0x80; len = 1; while (len <= 8 && (b & mask) == 0) { mask >>= 1; len++; }
        if (len > 8) return -1;
        long v = keepMarker ? b : (b & (mask - 1)); bool allOnes = (b & (mask - 1)) == mask - 1;
        for (int i = 1; i < len; i++) { int x = s.ReadByte(); if (x < 0) return -1; v = (v << 8) | (uint)x; if (x != 0xFF) allOnes = false; }
        return (!keepMarker && allOnes) ? long.MaxValue : v;   // tamanho "desconhecido"
    }
    static long ElId(Stream s) { int l; return VInt(s, true, out l); }
    static long ElSize(Stream s) { int l; return VInt(s, false, out l); }
    static ulong UInt(Stream s, long n) { ulong v = 0; for (long i = 0; i < n; i++) v = (v << 8) | (uint)s.ReadByte(); return v; }
    static string Str(Stream s, long n) { var b = new byte[n]; s.Read(b, 0, (int)n); return Encoding.UTF8.GetString(b).TrimEnd('\0'); }

    static List<SubTrack> MkvSubTracks(string file, out long tcScale)
    {
        var res = new List<SubTrack>(); tcScale = 1000000;
        using (var s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16))
        {
            if (ElId(s) != 0x1A45DFA3) return res; long hs = ElSize(s); s.Seek(hs, SeekOrigin.Current);
            if (ElId(s) != 0x18538067) return res; long segSize = ElSize(s), segStart = s.Position, segEnd = segSize == long.MaxValue ? s.Length : segStart + segSize;
            bool gotTracks = false, gotInfo = false;
            while (s.Position < segEnd && !(gotTracks && gotInfo))
            {
                long id = ElId(s), sz = ElSize(s); if (id < 0 || sz < 0) break; long end = sz == long.MaxValue ? segEnd : s.Position + sz;
                if (id == 0x1549A966) { gotInfo = true; while (s.Position < end) { long cid = ElId(s), cs = ElSize(s); if (cid == 0x2AD7B1) tcScale = (long)UInt(s, cs); else s.Seek(cs, SeekOrigin.Current); } }
                else if (id == 0x1654AE6B)
                {
                    gotTracks = true;
                    while (s.Position < end)
                    {
                        long tid = ElId(s), ts = ElSize(s), tend = s.Position + ts;
                        if (tid != 0xAE) { s.Seek(ts, SeekOrigin.Current); continue; }
                        var t = new SubTrack(); int type = 0;
                        while (s.Position < tend)
                        {
                            long cid = ElId(s), cs = ElSize(s);
                            if (cid == 0xD7) t.Num = (int)UInt(s, cs); else if (cid == 0x83) type = (int)UInt(s, cs);
                            else if (cid == 0x86) t.Codec = Str(s, cs); else if (cid == 0x22B59C) t.Lang = Str(s, cs); else if (cid == 0x22B59D) t.Lang = Str(s, cs);
                            else if (cid == 0x536E) t.Name = Str(s, cs); else if (cid == 0x63A2) t.Priv = Str(s, cs);
                            else if (cid == 0x88) t.Def = UInt(s, cs) != 0; else if (cid == 0x55AA) t.Forced = UInt(s, cs) != 0;
                            else s.Seek(cs, SeekOrigin.Current);
                        }
                        s.Position = tend;
                        if (type == 0x11) res.Add(t);
                    }
                }
                else if (id == 0x1F43B675) break;   // chegou nos dados: cabeçalho acabou
                else s.Position = end;
            }
        }
        return res;
    }
    static string VttTime(double ms) { if (ms < 0) ms = 0; var t = TimeSpan.FromMilliseconds(ms); return string.Format("{0:00}:{1:00}:{2:00}.{3:000}", (int)t.TotalHours, t.Minutes, t.Seconds, t.Milliseconds); }
    static string AssText(string t)
    {
        t = Regex.Replace(t, @"\{[^}]*\}", "").Replace("\\N", "\n").Replace("\\n", "\n").Replace("\\h", " ");
        return t.Trim();
    }
    // extrai a faixa de legenda de texto do MKV: lê só os cabeçalhos dos blocos e pula o vídeo/áudio
    static string MkvSubToVtt(string file, int track)
    {
        long tcScale; var tr = MkvSubTracks(file, out tcScale).FirstOrDefault(x => x.Num == track); if (tr == null) return null;
        bool ass = tr.Codec.StartsWith("S_TEXT/ASS") || tr.Codec.StartsWith("S_TEXT/SSA"), vtt = tr.Codec.StartsWith("S_TEXT/WEBVTT");
        if (!(ass || vtt || tr.Codec.StartsWith("S_TEXT/UTF8"))) return null;   // legenda de imagem (PGS/VobSub): não dá para virar texto
        var cues = new List<Tuple<double, double, string>>(); double ms = tcScale / 1e6;
        using (var s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16))
        {
            ElId(s); s.Seek(ElSize(s), SeekOrigin.Current);
            ElId(s); long segSize = ElSize(s), segEnd = segSize == long.MaxValue ? s.Length : s.Position + segSize;
            while (s.Position < segEnd)
            {
                long id = ElId(s), sz = ElSize(s); if (id < 0 || sz < 0) break;
                long end = sz == long.MaxValue ? segEnd : Math.Min(segEnd, s.Position + sz);
                if (id != 0x1F43B675) { s.Position = end; continue; }
                long ctc = 0;
                while (s.Position < end)
                {
                    long bid = ElId(s), bs = ElSize(s); if (bid < 0 || bs < 0) break;
                    if (bid == 0x1F43B675) { s.Seek(-1, SeekOrigin.Current); break; }   // cluster de tamanho desconhecido: o próximo começou
                    long bend = bs == long.MaxValue ? end : s.Position + bs;
                    if (bid == 0xE7) { ctc = (long)UInt(s, bs); continue; }
                    if (bid == 0xA3 || bid == 0xA0)
                    {
                        long blockStart = s.Position, blockLen = bs, dur = -1;
                        if (bid == 0xA0)
                        {   // BlockGroup: Block + duração
                            blockStart = -1;
                            while (s.Position < bend) { long gid = ElId(s), gs = ElSize(s); if (gid == 0xA1) { blockStart = s.Position; blockLen = gs; s.Seek(gs, SeekOrigin.Current); } else if (gid == 0x9B) dur = (long)UInt(s, gs); else s.Seek(gs, SeekOrigin.Current); }
                            if (blockStart < 0) { s.Position = bend; continue; }
                            s.Position = blockStart;
                        }
                        int tl; long tn = VInt(s, false, out tl);
                        if (tn == track)
                        {
                            int hi = s.ReadByte(), lo = s.ReadByte(); short rel = (short)((hi << 8) | lo); s.ReadByte();
                            long dlen = blockLen - tl - 3; var data = new byte[Math.Max(0, dlen)]; s.Read(data, 0, data.Length);
                            string text = Encoding.UTF8.GetString(data);
                            if (ass) { var parts = text.Split(new[] { ',' }, 9); text = parts.Length == 9 ? parts[8] : text; text = AssText(text); }
                            double a = (ctc + rel) * ms, b = dur >= 0 ? a + dur * ms : a + 4000;
                            if (text.Trim() != "") cues.Add(Tuple.Create(a, b, text.Trim()));
                        }
                        s.Position = bend; continue;
                    }
                    s.Position = bend;
                }
            }
        }
        cues.Sort((x, y) => x.Item1.CompareTo(y.Item1));
        for (int i = 0; i < cues.Count - 1; i++) if (cues[i].Item2 > cues[i + 1].Item1 && cues[i].Item2 - cues[i].Item1 == 4000) cues[i] = Tuple.Create(cues[i].Item1, cues[i + 1].Item1, cues[i].Item3);   // sem duração: até a próxima
        var sb = new StringBuilder("WEBVTT\n\n");
        foreach (var c in cues) sb.Append(VttTime(c.Item1) + " --> " + VttTime(c.Item2) + "\n" + c.Item3.Replace("\r", "") + "\n\n");
        return sb.ToString();
    }
    static readonly Dictionary<string, string> LangNames = new Dictionary<string, string> {
        { "por", "Português" }, { "pt", "Português" }, { "pob", "Português (Brasil)" }, { "pt-br", "Português (Brasil)" }, { "eng", "Inglês" }, { "en", "Inglês" }, { "spa", "Espanhol" }, { "es", "Espanhol" },
        { "jpn", "Japonês" }, { "ja", "Japonês" }, { "fre", "Francês" }, { "fra", "Francês" }, { "fr", "Francês" }, { "ger", "Alemão" }, { "deu", "Alemão" }, { "de", "Alemão" }, { "ita", "Italiano" }, { "it", "Italiano" },
        { "kor", "Coreano" }, { "ko", "Coreano" }, { "chi", "Chinês" }, { "zho", "Chinês" }, { "zh", "Chinês" }, { "rus", "Russo" }, { "ru", "Russo" } };
    static List<object> EmbeddedSubs(string vf)
    {
        var list = new List<object>();
        if (!Regex.IsMatch(Path.GetExtension(vf), @"^\.(mkv|webm|mka)$", RegexOptions.IgnoreCase)) return list;
        try
        {
            long sc; foreach (var t in MkvSubTracks(vf, out sc))
            {
                bool text = t.Codec.StartsWith("S_TEXT/");
                string ln; LangNames.TryGetValue((t.Lang ?? "").ToLowerInvariant(), out ln);
                string name = (ln ?? (t.Lang == "" || t.Lang == "und" ? "Legenda" : t.Lang)) + (t.Name != "" && t.Name != ln ? " — " + t.Name : "") + (t.Forced ? " (forçada)" : "");
                list.Add(new Dictionary<string, object> { { "name", name }, { "lang", t.Lang ?? "" }, { "emb", t.Num }, { "text", text }, { "def", t.Def } });
            }
        }
        catch { }
        return list;
    }
    // .ass/.ssa externos → WebVTT
    static string AssFileToVtt(string txt)
    {
        var sb = new StringBuilder("WEBVTT\n\n"); string[] fmt = null; var cues = new List<Tuple<double, double, string>>();
        Func<string, double> tm = v => { var p = v.Trim().Split(':', '.'); return p.Length < 4 ? 0 : ((int.Parse(p[0]) * 60 + int.Parse(p[1])) * 60 + int.Parse(p[2])) * 1000.0 + int.Parse(p[3].PadRight(2, '0').Substring(0, 2)) * 10; };
        foreach (var raw in txt.Replace("\r", "").Split('\n'))
        {
            var l = raw.Trim();
            if (l.StartsWith("Format:") && fmt == null && txt.Contains("[Events]")) fmt = l.Substring(7).Split(',').Select(x => x.Trim()).ToArray();
            if (!l.StartsWith("Dialogue:")) continue;
            var f = fmt ?? new[] { "Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text" };
            var parts = l.Substring(9).Split(new[] { ',' }, f.Length);
            try { int si = Array.IndexOf(f, "Start"), ei = Array.IndexOf(f, "End"), ti = Array.IndexOf(f, "Text"); var t = AssText(parts[ti]); if (t != "") cues.Add(Tuple.Create(tm(parts[si]), tm(parts[ei]), t)); } catch { }
        }
        foreach (var c in cues.OrderBy(x => x.Item1)) sb.Append(VttTime(c.Item1) + " --> " + VttTime(c.Item2) + "\n" + c.Item3 + "\n\n");
        return sb.ToString();
    }
    static string SubFileToVtt(string f)
    {
        var raw = File.ReadAllBytes(f); string txt;
        try { txt = new UTF8Encoding(false, true).GetString(raw); } catch { txt = Encoding.GetEncoding(1252).GetString(raw); }
        string e = Path.GetExtension(f).ToLowerInvariant();
        return e == ".ass" || e == ".ssa" ? AssFileToVtt(txt) : SrtToVtt(txt);
    }
    // janela "Abrir" para escolher a legenda à mão
    static string PickSubFile(string startDir)
    {
        string result = null;
        var t = new Thread(() =>
        {
            using (var owner = new Form { TopMost = true, ShowInTaskbar = false, StartPosition = FormStartPosition.CenterScreen, Width = 0, Height = 0, FormBorderStyle = FormBorderStyle.None, Opacity = 0 })
            using (var d = new OpenFileDialog { Title = "Escolha a legenda", Filter = "Legendas (*.srt;*.vtt;*.ass;*.ssa)|*.srt;*.vtt;*.ass;*.ssa|Todos os arquivos|*.*", InitialDirectory = startDir ?? "" })
            { owner.Show(); owner.Activate(); if (d.ShowDialog(owner) == DialogResult.OK) result = d.FileName; }
        });
        t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join();
        return result;
    }
}
