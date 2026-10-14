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
    class SubTrack { public int Num, Type, Channels; public string Codec = "", Lang = "", Name = "", Priv = ""; public bool Def, Forced; }

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

    static List<SubTrack> MkvSubTracks(string file, out long tcScale) { return MkvTracks(file, out tcScale).Where(x => x.Type == 0x11).ToList(); }
    static List<SubTrack> MkvTracks(string file, out long tcScale)
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
                            else if (cid == 0xE1) { long aend = s.Position + cs; while (s.Position < aend) { long aid = ElId(s), az = ElSize(s); if (aid == 0x9F) t.Channels = (int)UInt(s, az); else s.Seek(az, SeekOrigin.Current); } }
                            else if (cid == 0x88) t.Def = UInt(s, cs) != 0; else if (cid == 0x55AA) t.Forced = UInt(s, cs) != 0;
                            else s.Seek(cs, SeekOrigin.Current);
                        }
                        s.Position = tend;
                        t.Type = type; if (type == 0x11 || type == 2) res.Add(t);
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
    // ---------- MP4/MOV (legendas tx3g "mov_text" e WebVTT) ----------
    class Mp4Track { public int Id, Timescale = 1000, Channels; public string Handler = "", Codec = "", Lang = "", Name = ""; public byte[] Stts, Stsz, Stsc, Stco; public bool Co64, Def; }
    static uint U32(byte[] b, int o) { return (uint)(b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]); }
    static ulong U64(byte[] b, int o) { return ((ulong)U32(b, o) << 32) | U32(b, o + 4); }
    static byte[] ReadMoov(string file)
    {
        using (var s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16))
        {
            var h = new byte[16]; long pos = 0, len = s.Length;
            while (pos + 8 <= len)
            {
                s.Position = pos; if (s.Read(h, 0, 8) < 8) break;
                long size = U32(h, 0); string type = Encoding.ASCII.GetString(h, 4, 4); int hl = 8;
                if (size == 1) { s.Read(h, 8, 8); size = (long)U64(h, 8); hl = 16; } else if (size == 0) size = len - pos;
                if (size < hl) break;
                if (type == "moov") { if (size > 400L << 20) return null; var b = new byte[size - hl]; s.Read(b, 0, b.Length); return b; }
                pos += size;
            }
        }
        return null;
    }
    static IEnumerable<Tuple<string, int, int>> Boxes(byte[] b, int start, int end)
    {
        int p = start;
        while (p + 8 <= end)
        {
            long size = U32(b, p); string type = Encoding.ASCII.GetString(b, p + 4, 4); int hl = 8;
            if (size == 1) { size = (long)U64(b, p + 8); hl = 16; } else if (size == 0) size = end - p;
            if (size < hl || p + size > end) yield break;
            yield return Tuple.Create(type, p + hl, (int)(p + size)); p += (int)size;
        }
    }
    static Tuple<string, int, int> Box(byte[] b, int start, int end, string type) { return Boxes(b, start, end).FirstOrDefault(x => x.Item1 == type); }
    static List<Mp4Track> Mp4SubTracks(string file) { return Mp4Tracks(file).Where(x => x.Handler != "soun").ToList(); }
    static List<Mp4Track> Mp4Tracks(string file)
    {
        var res = new List<Mp4Track>(); var m = ReadMoov(file); if (m == null) return res;
        foreach (var trak in Boxes(m, 0, m.Length).Where(x => x.Item1 == "trak"))
        {
            var t = new Mp4Track(); var tkhd = Box(m, trak.Item2, trak.Item3, "tkhd"); var mdia = Box(m, trak.Item2, trak.Item3, "mdia");
            if (tkhd == null || mdia == null) continue;
            t.Id = (int)U32(m, tkhd.Item2 + (m[tkhd.Item2] == 1 ? 20 : 12)); t.Def = (m[tkhd.Item2 + 3] & 1) != 0;
            var mdhd = Box(m, mdia.Item2, mdia.Item3, "mdhd"); var hdlr = Box(m, mdia.Item2, mdia.Item3, "hdlr"); var minf = Box(m, mdia.Item2, mdia.Item3, "minf");
            if (mdhd != null)
            {
                int o = mdhd.Item2; bool v1 = m[o] == 1; t.Timescale = (int)U32(m, o + (v1 ? 20 : 12));
                int lp = o + (v1 ? 32 : 20); int code = (m[lp] << 8) | m[lp + 1];
                if (code != 0 && code != 0x7FFF) t.Lang = new string(new[] { (char)(((code >> 10) & 31) + 0x60), (char)(((code >> 5) & 31) + 0x60), (char)((code & 31) + 0x60) });
            }
            var elng = Box(m, mdia.Item2, mdia.Item3, "elng"); if (elng != null) t.Lang = Encoding.ASCII.GetString(m, elng.Item2 + 4, elng.Item3 - elng.Item2 - 4).TrimEnd('\0');
            if (hdlr != null) { t.Handler = Encoding.ASCII.GetString(m, hdlr.Item2 + 8, 4); if (hdlr.Item3 > hdlr.Item2 + 24) t.Name = Encoding.UTF8.GetString(m, hdlr.Item2 + 24, hdlr.Item3 - hdlr.Item2 - 24).Trim('\0', ' '); }
            if (!(t.Handler == "sbtl" || t.Handler == "text" || t.Handler == "subt" || t.Handler == "soun") || minf == null) continue;
            var stbl = Box(m, minf.Item2, minf.Item3, "stbl"); if (stbl == null) continue;
            var stsd = Box(m, stbl.Item2, stbl.Item3, "stsd"); if (stsd != null && stsd.Item3 - stsd.Item2 >= 16) t.Codec = Encoding.ASCII.GetString(m, stsd.Item2 + 12, 4);
            if (t.Handler == "soun" && stsd != null && stsd.Item3 - stsd.Item2 >= 34) t.Channels = (m[stsd.Item2 + 32] << 8) | m[stsd.Item2 + 33];
            Func<string, byte[]> raw = n => { var x = Box(m, stbl.Item2, stbl.Item3, n); if (x == null) return null; var r = new byte[x.Item3 - x.Item2]; Buffer.BlockCopy(m, x.Item2, r, 0, r.Length); return r; };
            t.Stts = raw("stts"); t.Stsz = raw("stsz"); t.Stsc = raw("stsc"); t.Stco = raw("stco"); if (t.Stco == null) { t.Stco = raw("co64"); t.Co64 = true; }
            var udta = Box(m, trak.Item2, trak.Item3, "udta"); if (udta != null) { var nm = Box(m, udta.Item2, udta.Item3, "name"); if (nm != null) t.Name = Encoding.UTF8.GetString(m, nm.Item2, nm.Item3 - nm.Item2).Trim('\0', ' '); }
            if (Regex.IsMatch(t.Name, @"^(Core Media|SubtitleHandler|Apple|GPAC|VideoHandler|TextHandler)", RegexOptions.IgnoreCase) || t.Name.EndsWith("Handler")) t.Name = "";
            res.Add(t);
        }
        return res;
    }
    static string Mp4SubToVtt(string file, int id)
    {
        var t = Mp4SubTracks(file).FirstOrDefault(x => x.Id == id); if (t == null || t.Stts == null || t.Stsz == null || t.Stsc == null || t.Stco == null) return null;
        if (t.Codec != "tx3g" && t.Codec != "wvtt" && t.Codec != "text") return null;
        // tamanhos, chunks e tempos de cada amostra
        int n = (int)U32(t.Stsz, 8); uint fixedSz = U32(t.Stsz, 4); var sizes = new uint[n]; for (int i = 0; i < n; i++) sizes[i] = fixedSz != 0 ? fixedSz : U32(t.Stsz, 12 + i * 4);
        int nc = (int)U32(t.Stco, 4); var offs = new long[nc]; for (int i = 0; i < nc; i++) offs[i] = t.Co64 ? (long)U64(t.Stco, 8 + i * 8) : U32(t.Stco, 8 + i * 4);
        var sampOff = new long[n]; int ns = (int)U32(t.Stsc, 4), si = 0;
        for (int e = 0; e < ns && si < n; e++)
        {
            int first = (int)U32(t.Stsc, 8 + e * 12) - 1, per = (int)U32(t.Stsc, 12 + e * 12), last = e + 1 < ns ? (int)U32(t.Stsc, 8 + (e + 1) * 12) - 1 : nc;
            for (int c = first; c < last && si < n; c++) { long o = offs[c]; for (int k = 0; k < per && si < n; k++) { sampOff[si] = o; o += sizes[si]; si++; } }
        }
        var times = new long[n + 1]; int nt = (int)U32(t.Stts, 4), ti = 0; long tm = 0;
        for (int e = 0; e < nt; e++) { uint cnt = U32(t.Stts, 8 + e * 8), d = U32(t.Stts, 12 + e * 8); for (uint k = 0; k < cnt && ti < n; k++) { times[ti++] = tm; tm += d; } }
        while (ti <= n) times[ti++] = tm;
        var sb = new StringBuilder("WEBVTT\n\n");
        using (var s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16))
            for (int i = 0; i < n; i++)
            {
                if (sizes[i] < 2) continue; var b = new byte[sizes[i]]; s.Position = sampOff[i]; s.Read(b, 0, b.Length); string text = "";
                if (t.Codec == "wvtt") { foreach (var bx in Boxes(b, 0, b.Length).Where(x => x.Item1 == "vttc")) { var pl = Box(b, bx.Item2, bx.Item3, "payl"); if (pl != null) text += (text != "" ? "\n" : "") + Encoding.UTF8.GetString(b, pl.Item2, pl.Item3 - pl.Item2); } }
                else
                {
                    int L = (b[0] << 8) | b[1]; if (L <= 0 || L > b.Length - 2) continue;
                    text = L >= 2 && b[2] == 0xFE && b[3] == 0xFF ? Encoding.BigEndianUnicode.GetString(b, 4, L - 2) : Encoding.UTF8.GetString(b, 2, L);
                }
                text = text.Replace("\r", "").Trim(); if (text == "") continue;
                double a = times[i] * 1000.0 / t.Timescale, z = times[i + 1] * 1000.0 / t.Timescale;
                sb.Append(VttTime(a) + " --> " + VttTime(z) + "\n" + text + "\n\n");
            }
        return sb.ToString();
    }
    static string EmbeddedSubToVtt(string vf, int id) { return IsMp4(vf) ? Mp4SubToVtt(vf, id) : MkvSubToVtt(vf, id); }
    static bool IsMp4(string vf) { return Regex.IsMatch(Path.GetExtension(vf), @"^\.(mp4|m4v|mov|3gp)$", RegexOptions.IgnoreCase); }

    // ---------- faixas de áudio (para escolher no player) ----------
    static readonly Regex AudioOk = new Regex(@"^(mp4a|opus|Opus|fLaC|alac|\.mp3|A_AAC|A_OPUS|A_VORBIS|A_FLAC|A_MPEG|A_PCM)", RegexOptions.IgnoreCase);
    static string AudioCodecName(string c)
    {
        c = c ?? ""; if (Regex.IsMatch(c, "ec-3|EAC3", RegexOptions.IgnoreCase)) return "Dolby Digital Plus"; if (Regex.IsMatch(c, "ac-3|A_AC3", RegexOptions.IgnoreCase)) return "Dolby Digital";
        if (Regex.IsMatch(c, "TRUEHD|mlpa", RegexOptions.IgnoreCase)) return "Dolby TrueHD"; if (Regex.IsMatch(c, "DTS|dts", RegexOptions.IgnoreCase)) return "DTS";
        if (Regex.IsMatch(c, "mp4a|AAC", RegexOptions.IgnoreCase)) return "AAC"; if (Regex.IsMatch(c, "opus", RegexOptions.IgnoreCase)) return "Opus"; if (Regex.IsMatch(c, "flac", RegexOptions.IgnoreCase)) return "FLAC";
        if (Regex.IsMatch(c, "VORBIS", RegexOptions.IgnoreCase)) return "Vorbis"; if (Regex.IsMatch(c, "MPEG|mp3", RegexOptions.IgnoreCase)) return "MP3"; return c;
    }
    static List<object> AudioTracks(string vf)
    {
        var list = new List<object>();
        try
        {
            IEnumerable<Tuple<string, string, string, int, bool>> raw = null;   // idioma, nome, codec, canais, padrão
            if (IsMp4(vf)) raw = Mp4Tracks(vf).Where(x => x.Handler == "soun").Select(x => Tuple.Create(x.Lang, x.Name, x.Codec, x.Channels, x.Def)).ToList();
            else if (Regex.IsMatch(Path.GetExtension(vf), @"^\.(mkv|webm|mka)$", RegexOptions.IgnoreCase)) { long sc; raw = MkvTracks(vf, out sc).Where(x => x.Type == 2).Select(x => Tuple.Create(x.Lang, x.Name, x.Codec, x.Channels, x.Def)).ToList(); }
            if (raw == null) return list;
            foreach (var t in raw)
            {
                string ln; LangNames.TryGetValue((t.Item1 ?? "").ToLowerInvariant(), out ln);
                string ch = t.Item4 >= 8 ? " 7.1" : t.Item4 >= 6 ? " 5.1" : t.Item4 == 2 ? " estéreo" : t.Item4 == 1 ? " mono" : "";
                string name = (ln ?? (t.Item1 == "" || t.Item1 == "und" ? "Áudio" : t.Item1)) + (t.Item2 != "" && t.Item2 != ln ? " — " + t.Item2 : "");
                list.Add(new Dictionary<string, object> { { "name", name }, { "lang", t.Item1 ?? "" }, { "codec", AudioCodecName(t.Item3) + ch }, { "ok", AudioOk.IsMatch(t.Item3 ?? "") }, { "def", t.Item5 } });
            }
        }
        catch { }
        return list;
    }
    static List<object> EmbeddedSubs(string vf)
    {
        var list = new List<object>();
        if (IsMp4(vf))
        {
            try
            {
                foreach (var t in Mp4SubTracks(vf))
                {
                    string ln; LangNames.TryGetValue((t.Lang ?? "").ToLowerInvariant(), out ln);
                    bool text = t.Codec == "tx3g" || t.Codec == "wvtt" || t.Codec == "text";
                    string name = (ln ?? (t.Lang == "" || t.Lang == "und" ? "Legenda" : t.Lang)) + (t.Name != "" && t.Name != ln ? " — " + t.Name : "");
                    list.Add(new Dictionary<string, object> { { "name", name }, { "lang", t.Lang ?? "" }, { "emb", t.Id }, { "text", text }, { "def", t.Def } });
                }
            }
            catch { }
            return list;
        }
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
