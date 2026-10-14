using System;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Koru — mini busca da bandeja: um clique no ícone abre uma janelinha para achar e abrir qualquer jogo ou vídeo
static partial class WebHost
{
    static Form mini; static WebView2 miniView; static bool miniReady; static DateTime miniHidAt;
    public static void ToggleMini()
    {
        if (mini != null && mini.Visible) { HideMini(); return; }
        if ((DateTime.Now - miniHidAt).TotalMilliseconds < 300) return;   // o clique que tirou o foco já fechou a janelinha
        if (form == null || form.IsDisposed) { Create(); form.Opacity = 0; form.Show(); form.Hide(); form.Opacity = 1; }   // motor da página pronto, sem mostrar a janela principal
        if (mini == null || mini.IsDisposed) CreateMini();
        var wa = Screen.FromPoint(Cursor.Position).WorkingArea;
        mini.Location = new Point(wa.Right - mini.Width - 12, wa.Bottom - mini.Height - 12);
        mini.Show(); mini.Activate();
        if (miniReady) { try { miniView.Focus(); miniView.CoreWebView2.ExecuteScriptAsync("window.miniShown&&miniShown()"); } catch { } }
    }
    static void HideMini() { if (mini == null || !mini.Visible) return; mini.Hide(); miniHidAt = DateTime.Now; }
    static void CreateMini()
    {
        mini = new Form
        {
            FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, TopMost = true, StartPosition = FormStartPosition.Manual,
            Size = new Size(720, 420), BackColor = Color.FromArgb(20, 22, 28), Text = "Koru — busca"
        };
        miniView = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(20, 22, 28) };
        mini.Controls.Add(miniView);
        mini.Deactivate += (s, e) => HideMini();
        mini.Shown += async (s, e) =>
        {
            try
            {
                while (env == null) await System.Threading.Tasks.Task.Delay(100);
                await miniView.EnsureCoreWebView2Async(env);
                miniView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                miniView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                miniView.CoreWebView2.AddWebResourceRequestedFilter(BaseUrl + "*", CoreWebView2WebResourceContext.All);
                miniView.CoreWebView2.WebResourceRequested += OnRequest;
                miniView.CoreWebView2.WebMessageReceived += (o, m) => OnMiniMessage(m.TryGetWebMessageAsString());
                miniView.CoreWebView2.Navigate(BaseUrl + "mini");
                miniReady = true; miniView.Focus();
            }
            catch { }
        };
        // cantos arredondados (Windows 11)
        try { int pref = 2; DwmSetWindowAttribute(mini.Handle, 33, ref pref, 4); } catch { }
    }
    [System.Runtime.InteropServices.DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);
    static void OnMiniMessage(string m)
    {
        if (m == null) return;
        if (m == "hide") HideMini();
        else if (m.StartsWith("art:")) { try { if (ready) view.CoreWebView2.PostWebMessageAsString(m); } catch { } }   // capa: o Koru principal (que já sabe buscar capas) responde
        else if (m == "open") { HideMini(); Show(null); }
        else if (m.StartsWith("play:"))   // vídeo: abre o Koru já no player
        {
            HideMini(); Show(null);
            try { if (ready) view.CoreWebView2.PostWebMessageAsString(m); } catch { }
        }
    }
}

static partial class WebHost
{
    public static void ToMini(string m) { try { if (miniReady && mini != null) mini.BeginInvoke((Action)(() => { try { miniView.CoreWebView2.PostWebMessageAsString(m); } catch { } })); } catch { } }
}
