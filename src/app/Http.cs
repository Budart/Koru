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

[assembly: AssemblyTitle("Koru")]
[assembly: AssemblyProduct("Koru")]
[assembly: AssemblyVersion("1.6.22.0")]

// requisição da página (chega pelo WebView2, sem servidor HTTP/porta)
class Req
{
    public string HttpMethod = "GET";
    public Stream InputStream = new MemoryStream();
    public Uri Url;
    public System.Collections.Specialized.NameValueCollection QueryString = new System.Collections.Specialized.NameValueCollection();
    public Req(string url, string method, byte[] body)
    {
        Url = new Uri(url); HttpMethod = method ?? "GET"; InputStream = new MemoryStream(body ?? new byte[0]);
        foreach (var part in Url.Query.TrimStart('?').Split('&'))
        {
            if (part == "") continue;
            int i = part.IndexOf('=');
            string k = i < 0 ? part : part.Substring(0, i), v = i < 0 ? "" : part.Substring(i + 1);
            QueryString[Uri.UnescapeDataString(k.Replace('+', ' '))] = Uri.UnescapeDataString(v.Replace('+', ' '));
        }
    }
}
class Resp
{
    public int StatusCode = 200;
    public string ContentType = "text/plain";
    public long ContentLength64;
    public Dictionary<string, string> Headers = new Dictionary<string, string>();
    public MemoryStream OutputStream = new MemoryStream();
}
class Ctx { public Req Request; public Resp Response = new Resp(); }
