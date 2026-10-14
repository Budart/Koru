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

// Koru — iniciar com o Windows e desinstalação
static partial class Central
{
    // abrir junto com o Windows (opção "autostart" da configuração; padrão: ligado)
    static void ApplyAutostart(Dictionary<string, object> cfg)
    {
        object v; bool on = !(cfg.TryGetValue("autostart", out v) && v is bool && !(bool)v);
        try
        {
            using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                try { k.DeleteValue("CentralDeJogos", false); k.DeleteValue("Jogo", false); k.DeleteValue("Joggo", false); } catch { }
                if (on) k.SetValue("Koru", "\"" + ExePath + "\" silent"); else k.DeleteValue("Koru", false);
            }
        }
        catch { }
    }

    // desinstalação (chamada pelo "Adicionar ou remover programas")
    // pergunta se quer desinstalar e se também apaga os dados (configuração, cache, capas...)
    static bool AskUninstall(string dataDir, out bool wipe)
    {
        wipe = false;
        Color bg = Color.FromArgb(20, 22, 28), card = Color.FromArgb(26, 28, 34), text = Color.FromArgb(229, 231, 235), muted = Color.FromArgb(148, 163, 184), red = Color.FromArgb(248, 113, 113);
        var f = new Form { Text = "Desinstalar Koru", FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterScreen,
            AutoScaleDimensions = new SizeF(96f, 96f), AutoScaleMode = AutoScaleMode.Dpi, ClientSize = new Size(520, 300), BackColor = bg, ForeColor = text, Font = new Font("Segoe UI", 10f) };
        try { f.Icon = Icon.ExtractAssociatedIcon(ExePath); } catch { }
        var title = new Label { Text = "Desinstalar o Koru?", Font = new Font("Segoe UI Semibold", 15f), AutoSize = false, Location = new Point(28, 22), Size = new Size(464, 34) };
        var sub = new Label { Text = "Seus emuladores e jogos não serão apagados.", ForeColor = muted, Location = new Point(28, 58), Size = new Size(464, 22) };
        var box = new Panel { BackColor = card, Location = new Point(28, 96), Size = new Size(464, 118) };
        var chk = new CheckBox { Text = "Apagar também todos os meus dados", Font = new Font("Segoe UI Semibold", 10.5f), Location = new Point(16, 14), Size = new Size(430, 26), Cursor = Cursors.Hand };
        var det = new Label { Text = "Configuração, favoritos, posição e tamanho dos cards, capas, fundos e títulos escolhidos, jogos ocultos e renomeados, cache de imagens e vídeos.", ForeColor = muted, Font = new Font("Segoe UI", 9f), Location = new Point(36, 44), Size = new Size(412, 58) };
        box.Controls.AddRange(new Control[] { chk, det });
        Func<string, Color, Button> mk = (t, c) => { var b = new Button { Text = t, Size = new Size(124, 38), FlatStyle = FlatStyle.Flat, BackColor = c, ForeColor = Color.White, Cursor = Cursors.Hand, Font = new Font("Segoe UI Semibold", 10f) }; b.FlatAppearance.BorderSize = 0; return b; };
        var no = mk("Cancelar", Color.FromArgb(35, 38, 46)); no.Location = new Point(368, 240); no.DialogResult = DialogResult.Cancel;
        var ok = mk("Desinstalar", Color.FromArgb(47, 107, 255)); ok.Location = new Point(234, 240); ok.DialogResult = DialogResult.OK;
        chk.CheckedChanged += (s, e) => { ok.BackColor = chk.Checked ? Color.FromArgb(220, 38, 38) : Color.FromArgb(47, 107, 255); ok.Text = chk.Checked ? "Apagar tudo" : "Desinstalar"; det.ForeColor = chk.Checked ? red : muted; };
        f.Controls.AddRange(new Control[] { title, sub, box, ok, no });
        f.AcceptButton = ok; f.CancelButton = no;
        bool r = f.ShowDialog() == DialogResult.OK;
        wipe = chk.Checked;
        return r;
    }
    static void Uninstall()
    {
        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralDeJogos");
        Application.EnableVisualStyles();
        bool wipe;
        if (!AskUninstall(data, out wipe)) return;
        foreach (var n in new[] { "Koru", "Joggo", "Jogo" })
            foreach (var p in Process.GetProcessesByName(n)) if (p.Id != Process.GetCurrentProcess().Id) try { p.Kill(); p.WaitForExit(3000); } catch { }
        try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) { k.DeleteValue("Koru", false); k.DeleteValue("CentralDeJogos", false); } } catch { }
        try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Koru", false); } catch { }
        foreach (var lnk in new[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Koru.lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Koru.lnk"),
            Path.Combine(Path.GetDirectoryName(ExePath), "Desinstalar Koru.lnk") })
            try { if (File.Exists(lnk)) File.Delete(lnk); } catch { }
        try { var sm = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Koru"); if (Directory.Exists(sm)) Directory.Delete(sm, true); } catch { }
        // som e vídeo: sempre sai junto (player mpv, conversor FFmpeg, miniaturas, legendas extraídas, durações)
        foreach (var n in new[] { "mpv", "ffmpeg" }) foreach (var p in Process.GetProcessesByName(n)) try { var f = p.MainModule.FileName; if (f.StartsWith(data, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(2000); } } catch { }
        foreach (var d in new[] { Path.Combine(data, "tradutor"), Path.Combine(data, "mpv"), Path.Combine(data, "ffmpeg"), Path.Combine(CacheDir, "vthumb"), Path.Combine(CacheDir, "subs") }) try { if (Directory.Exists(d)) Directory.Delete(d, true); } catch { }
        try { var vd = Path.Combine(CacheDir, "vdur.json"); if (File.Exists(vd)) File.Delete(vd); } catch { }
        string extra = "";
        if (wipe)
        {
            // favoritos, cards, capas escolhidas, ocultos e nomes ficam na pasta dos emuladores (central-*.json): apaga também
            try
            {
                string root = Root(LoadConfig());
                foreach (var n in new[] { "central-covers.json", "central-hidden.json", ConfigName })
                    try { string p = Path.Combine(root, n); if (File.Exists(p)) File.Delete(p); } catch { }
            }
            catch { }
            try { Directory.Delete(data, true); } catch { }
            // o que ficar preso (processos do WebView2 ainda fechando) é apagado logo depois que este programa sai
            if (Directory.Exists(data)) extra = " & rmdir /s /q \"" + data + "\"";
        }
        string dir = Path.GetDirectoryName(ExePath);
        MessageBox.Show(wipe ? "O Koru foi desinstalado e seus dados foram apagados." : "O Koru foi desinstalado.", "Koru");
        Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 2 /nobreak >nul & del /f /q \"" + ExePath + "\" & rmdir \"" + dir + "\"" + extra) { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
    }
}
