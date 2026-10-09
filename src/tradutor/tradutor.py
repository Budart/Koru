"""Tradutor de Tela - janela translucida que traduz o que estiver atras dela
(estilo camera do Google Tradutor). Windows 10 2004+ / Windows 11.

OCR: Windows.Media.Ocr (nativo do Windows)  |  Traducao: Google (deep-translator)
"""
import sys, ctypes, asyncio, hashlib, threading, time

import numpy as np
import mss
from PIL import Image
from PySide6.QtCore import Qt, QPoint, QRect, QSize, QTimer, Signal, QObject
from PySide6.QtGui import QPainter, QColor, QFont, QFontMetrics, QPen, QAction
from PySide6.QtWidgets import (QApplication, QWidget, QLabel, QComboBox, QPushButton,
                               QVBoxLayout, QHBoxLayout, QFrame, QSizeGrip, QMenu, QDialog)

# (nome, codigo Google, tag OCR do Windows)
LANGS = [
    ("Detectar automaticamente", "auto", None),
    ("Português", "pt", "pt-BR"), ("Inglês", "en", "en-US"), ("Espanhol", "es", "es-ES"),
    ("Francês", "fr", "fr-FR"), ("Alemão", "de", "de-DE"), ("Italiano", "it", "it-IT"),
    ("Japonês", "ja", "ja-JP"), ("Coreano", "ko", "ko-KR"), ("Chinês (simpl.)", "zh-CN", "zh-CN"),
    ("Chinês (trad.)", "zh-TW", "zh-TW"), ("Russo", "ru", "ru-RU"), ("Árabe", "ar", "ar-SA"),
    ("Holandês", "nl", "nl-NL"), ("Polonês", "pl", "pl-PL"), ("Turco", "tr", "tr-TR"),
]
WDA_EXCLUDEFROMCAPTURE = 0x11


def _cfg_path():
    import os
    d = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "TradutorDeTela")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "config.json")


def load_config():
    import json
    try:
        with open(_cfg_path(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(data):
    import json
    try:
        cfg = load_config(); cfg.update(data)
        with open(_cfg_path(), "w", encoding="utf-8") as f:
            json.dump(cfg, f)
    except Exception:
        pass


def ghost_icon(color, size=64):
    """Desenha um fantasminha fofo (vetorial) e devolve um QIcon."""
    from PySide6.QtGui import QPixmap, QPainterPath, QIcon
    pm = QPixmap(size, size); pm.fill(Qt.transparent)
    p = QPainter(pm); p.setRenderHint(QPainter.Antialiasing)
    s = size / 64.0
    path = QPainterPath()
    path.moveTo(12 * s, 58 * s); path.lineTo(12 * s, 30 * s)
    path.arcTo(12 * s, 6 * s, 40 * s, 44 * s, 180, -180)
    path.lineTo(52 * s, 58 * s)
    for i, x in enumerate((45.3, 38.6, 32, 25.3, 18.6, 12)):
        path.quadTo((x + 3.3) * s, (52 if i % 2 == 0 else 64) * s, x * s, 58 * s)
    p.setPen(Qt.NoPen); p.setBrush(color); p.drawPath(path)
    p.setBrush(QColor(60, 40, 140))
    p.drawEllipse(QRect(int(22 * s), int(24 * s), int(7 * s), int(10 * s)))
    p.drawEllipse(QRect(int(35 * s), int(24 * s), int(7 * s), int(10 * s)))
    p.setBrush(QColor(255, 150, 190, 170))
    p.drawEllipse(QRect(int(17 * s), int(36 * s), int(7 * s), int(4 * s)))
    p.drawEllipse(QRect(int(40 * s), int(36 * s), int(7 * s), int(4 * s)))
    p.end()
    return QIcon(pm)


class MissingLang(Exception):
    pass


def app_dir():
    import os
    return os.path.dirname(os.path.abspath(__file__))


def write_install_bat(tag):
    """Cria um .bat visivel que instala o OCR do idioma e mostra o resultado."""
    import os
    cap = f"Language.OCR~~~{tag}~0.0.1.0"
    path = os.path.join(app_dir(), f"instalar_idioma_{tag}.bat")
    bat = f"""@echo off
chcp 65001 >nul
title Instalando idioma {tag} - Tradutor de Tela
net session >nul 2>&1
if errorlevel 1 (
  echo Este instalador precisa ser executado como Administrador.
  echo Clique com o botao direito no arquivo e escolha "Executar como administrador".
  pause
  exit /b 1
)
echo ============================================================
echo  Instalando reconhecimento de texto (OCR) para: {tag}
echo  Isso baixa o pacote do Windows Update e pode levar minutos.
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try {{ Add-WindowsCapability -Online -Name '{cap}' | Out-Null; $c = Get-WindowsCapability -Online -Name '{cap}'; Write-Host ('Estado: ' + $c.State) -ForegroundColor Green }} catch {{ Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }}"
echo.
if errorlevel 1 (
  echo Falhou. Alternativa: Configuracoes ^> Hora e idioma ^> Idioma e regiao ^> Adicionar idioma.
) else (
  echo Concluido! Volte ao Tradutor e clique em "Verificar novamente".
)
echo.
pause
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(bat)
    return path


def run_as_admin(path):
    import os
    r = ctypes.windll.shell32.ShellExecuteW(None, "runas", path, None, os.path.dirname(path), 1)
    return r > 32  # <=32 = erro/cancelado


class MissingLangDialog(QDialog):
    def __init__(self, parent, tag):
        super().__init__(parent)
        self.tag = tag
        self.setWindowTitle("Idioma não instalado")
        self.setWindowFlags(Qt.Dialog | Qt.WindowStaysOnTopHint)
        self.setMinimumWidth(420)
        lay = QVBoxLayout(self)
        name = next((n for n, c, t in LANGS if t == tag), tag)
        info = QLabel(f"<b>O Windows ainda não sabe ler textos em {name} ({tag}).</b><br><br>"
                      "É preciso instalar o pacote de reconhecimento de texto (OCR) desse idioma. "
                      "Escolha uma opção:<br><br>"
                      "<b>1. Instalar automaticamente</b> – abre uma janela preta de instalação; "
                      "o Windows vai pedir permissão de administrador (clique <i>Sim</i>). "
                      "Aguarde aparecer <i>Concluído</i>.<br>"
                      "<b>2. Instalar pelas Configurações</b> – em <i>Idioma e região</i>, clique em "
                      "<i>Adicionar um idioma</i>, escolha o idioma e deixe marcado "
                      "<i>Reconhecimento óptico de caracteres</i>.<br><br>"
                      "Depois de instalar, clique em <b>Verificar novamente</b>.")
        info.setWordWrap(True); lay.addWidget(info)
        self.msg = QLabel(""); self.msg.setWordWrap(True); self.msg.setStyleSheet("color:#c0392b;")
        lay.addWidget(self.msg)
        row = QHBoxLayout()
        b1 = QPushButton("1. Instalar automaticamente"); b1.clicked.connect(self.auto)
        b2 = QPushButton("2. Abrir Configurações"); b2.clicked.connect(self.settings)
        b3 = QPushButton("Verificar novamente"); b3.clicked.connect(self.accept)
        for b in (b1, b2, b3):
            row.addWidget(b)
        lay.addLayout(row)
        b4 = QPushButton("Abrir a pasta do instalador (executar manualmente)"); b4.setFlat(True)
        b4.clicked.connect(self.folder); lay.addWidget(b4)
        self.bat = write_install_bat(tag)

    def auto(self):
        if run_as_admin(self.bat):
            self.msg.setStyleSheet("color:#2d7d46;")
            self.msg.setText("Instalação iniciada na janela preta. Quando aparecer 'Concluído', "
                             "clique em Verificar novamente.")
        else:
            self.msg.setText("A permissão de administrador não foi concedida. Use 'Abrir a pasta do "
                             f"instalador', clique com o botão direito em instalar_idioma_{self.tag}.bat "
                             "e escolha 'Executar como administrador'.")

    def settings(self):
        import os
        os.startfile("ms-settings:regionlanguage")

    def folder(self):
        import subprocess
        subprocess.Popen(["explorer", "/select,", self.bat])


# ---------------------------------------------------------------- OCR ----
class WinOCR:
    def __init__(self):
        from winrt.windows.media.ocr import OcrEngine
        from winrt.windows.globalization import Language
        self.OcrEngine, self.Language = OcrEngine, Language
        self.engines = {}

    def engine(self, tag):
        if tag not in self.engines:
            if tag is None:
                eng = self.OcrEngine.try_create_from_user_profile_languages()
            else:
                eng = self.OcrEngine.try_create_from_language(self.Language(tag))
                if eng is None:  # tenta so o prefixo (ex. "pt")
                    eng = self.OcrEngine.try_create_from_language(self.Language(tag.split("-")[0]))
            if eng is None:
                return None  # nao guarda: pode ser instalado depois
            self.engines[tag] = eng
        return self.engines[tag]

    def recognize(self, img: Image.Image, tag):
        """Retorna lista de (texto, (x, y, w, h)) em pixels da imagem."""
        from winrt.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat, BitmapAlphaMode
        from winrt.windows.storage.streams import DataWriter
        eng = self.engine(tag)
        if eng is None:
            raise MissingLang(tag)
        scale = 1.0
        maxd = self.OcrEngine.max_image_dimension
        if max(img.size) > maxd:
            scale = maxd / max(img.size)
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        img = img.convert("RGBA")
        b, g, r, a = img.split()[2], img.split()[1], img.split()[0], img.split()[3]
        bgra = Image.merge("RGBA", (b, g, r, a)).tobytes()
        dw = DataWriter()
        dw.write_bytes(bgra)
        bmp = SoftwareBitmap.create_copy_from_buffer(dw.detach_buffer(), BitmapPixelFormat.BGRA8,
                                                     img.width, img.height)

        async def run():
            return await eng.recognize_async(bmp)
        res = asyncio.run(run())
        out = []
        for line in res.lines:
            xs, ys, xe, ye = [], [], [], []
            for w in line.words:
                r_ = w.bounding_rect
                xs.append(r_.x); ys.append(r_.y); xe.append(r_.x + r_.width); ye.append(r_.y + r_.height)
            if not xs:
                continue
            x0, y0, x1, y1 = min(xs) / scale, min(ys) / scale, max(xe) / scale, max(ye) / scale
            out.append((line.text, (x0, y0, x1 - x0, y1 - y0)))
        return out


# ------------------------------------------------------------- Traducao --
class Translator:
    """Google Tradutor (endpoint publico) com cache, 1 requisicao por tela e limite de ritmo."""
    URL = "https://translate.googleapis.com/translate_a/single"

    def __init__(self):
        import requests
        self.s = requests.Session()
        self.s.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        self.cache = {}
        self.last_call = 0.0
        self.blocked_until = 0.0

    def _call(self, text, src, dst):
        wait = 0.4 - (time.time() - self.last_call)   # no maximo ~2-3 req/s
        if wait > 0:
            time.sleep(wait)
        if time.time() < self.blocked_until:
            raise RuntimeError("Google limitou as requisições; tentando de novo em instantes…")
        self.last_call = time.time()
        r = self.s.post(self.URL, params={"client": "gtx", "sl": src, "tl": dst, "dt": "t"},
                        data={"q": text}, timeout=10)
        if r.status_code == 429:
            self.blocked_until = time.time() + 30
            raise RuntimeError("Google limitou as requisições; tentando de novo em 30 s…")
        r.raise_for_status()
        return "".join(seg[0] for seg in r.json()[0] if seg and seg[0])

    def translate(self, lines, src, dst):
        todo = [l for l in dict.fromkeys(lines) if (src, dst, l) not in self.cache]
        # divide em blocos de ate ~4500 caracteres (1 requisicao cada)
        chunks, cur = [], []
        for l in todo:
            if cur and sum(len(x) + 1 for x in cur) + len(l) > 4500:
                chunks.append(cur); cur = []
            cur.append(l)
        if cur:
            chunks.append(cur)
        for ch in chunks:
            parts = self._call("\n".join(ch), src, dst).split("\n")
            if len(parts) != len(ch):   # Google juntou/quebrou linhas: traduz uma a uma (com ritmo)
                parts = [self._call(l, src, dst) for l in ch[:15]] + ch[15:]
            for o, t in zip(ch, parts):
                self.cache[(src, dst, o)] = t.strip() or o
        return [self.cache.get((src, dst, l), l) for l in lines]


# -------------------------------------------------------------- Worker ---
class Worker(QObject):
    result = Signal(list, float)   # [(texto, QRect logico, bg QColor, fg QColor)], dpr
    error = Signal(str)
    status = Signal(str)
    missing = Signal(str)

    def __init__(self):
        super().__init__()
        self.ocr = None
        self.tr = Translator()
        self.busy = False
        self.last_hash = None
        self.paused = False

    def process(self, rect_phys, dpr, src, dst):
        if self.busy or self.paused:
            return
        self.busy = True
        threading.Thread(target=self._run, args=(rect_phys, dpr, src, dst), daemon=True).start()

    def _run(self, rect_phys, dpr, src, dst):
        try:
            if self.ocr is None:
                self.ocr = WinOCR()
            x, y, w, h = rect_phys
            with mss.mss() as s:
                shot = s.grab({"left": x, "top": y, "width": w, "height": h})
            img = Image.frombytes("RGB", shot.size, shot.rgb)
            small = img.resize((64, 64)).tobytes()
            key = (hashlib.md5(small).hexdigest(), src, dst, w, h)
            if key == self.last_hash:
                return
            self.last_hash = key
            tag = next(t for n, c, t in LANGS if c == src)
            try:
                lines = self.ocr.recognize(img, tag)
            except MissingLang:
                self.paused = True
                self.missing.emit(tag)
                return
            lines = [(t, r) for t, r in lines if t.strip() and r[2] > 2 and r[3] > 2]
            if not lines:
                self.result.emit([], dpr)
                return
            texts = self.tr.translate([t for t, _ in lines], src, dst)
            arr = np.asarray(img)
            items = []
            for (orig, (lx, ly, lw, lh)), tt in zip(lines, texts):
                bg, fg = self._colors(arr, int(lx), int(ly), int(lw), int(lh))
                pad = lh * 0.15
                qr = QRect(int((lx - pad) / dpr), int((ly - pad) / dpr),
                           int((lw + 2 * pad) / dpr) + 1, int((lh + 2 * pad) / dpr) + 1)
                items.append((tt, qr, bg, fg))
            self.result.emit(items, dpr)
        except Exception as e:
            self.last_hash = None
            self.error.emit(str(e))
        finally:
            self.busy = False

    @staticmethod
    def _colors(arr, x, y, w, h):
        H, W = arr.shape[:2]
        x0, y0 = max(x - 3, 0), max(y - 3, 0)
        x1, y1 = min(x + w + 3, W), min(y + h + 3, H)
        region = arr[y0:y1, x0:x1].reshape(-1, 3).astype(int)
        border = np.concatenate([arr[y0:y1, x0].reshape(-1, 3), arr[y0:y1, x1 - 1].reshape(-1, 3),
                                 arr[y0, x0:x1].reshape(-1, 3), arr[y1 - 1, x0:x1].reshape(-1, 3)]).astype(int)
        bg = np.median(border, axis=0)
        dist = np.abs(region - bg).sum(axis=1)
        far = region[dist > np.percentile(dist, 85)] if len(region) else region
        fg = far.mean(axis=0) if len(far) else (255 - bg)
        if np.abs(fg - bg).sum() < 120:  # contraste insuficiente
            fg = np.array([0, 0, 0]) if bg.mean() > 128 else np.array([255, 255, 255])
        return QColor(*map(int, bg)), QColor(*map(int, fg))


# ------------------------------------------------------------ Painel -----
class LangPanel(QFrame):
    changed = Signal()

    def __init__(self, parent):
        super().__init__(parent)
        self.setStyleSheet("""
            QFrame { background: rgba(30,30,34,235); border-radius: 10px; }
            QLabel { color: #ddd; font-size: 11px; background: transparent; }
            QComboBox { background: #2c2c32; color: #fff; border: 1px solid #555;
                        border-radius: 6px; padding: 4px 8px; min-width: 170px; }
            QComboBox QAbstractItemView { background: #2c2c32; color: #fff; selection-background-color: #3a6df0; }
            QPushButton { background: #3a6df0; color: white; border: none; border-radius: 6px; padding: 5px; }
            QPushButton:checked { background: #c0392b; }
        """)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(12, 10, 12, 12)
        lay.addWidget(QLabel("Idioma de origem"))
        self.src = QComboBox()
        self.src.addItem("Selecione…", None)
        for n, c, _ in LANGS:
            self.src.addItem(n, c)
        lay.addWidget(self.src)
        lay.addWidget(QLabel("Idioma de destino"))
        self.dst = QComboBox()
        self.dst.addItem("Selecione…", None)
        for n, c, _ in LANGS[1:]:
            self.dst.addItem(n, c)
        lay.addWidget(self.dst)
        self.stop = QPushButton("Parar tradução")
        self.stop.clicked.connect(self._stop)
        lay.addWidget(self.stop)
        self.src.currentIndexChanged.connect(self.changed)
        self.dst.currentIndexChanged.connect(self.changed)
        self.adjustSize()

    def _stop(self):
        self.dst.setCurrentIndex(0)

    def langs(self):
        return self.src.currentData(), self.dst.currentData()


# ------------------------------------------------------------ Janela -----
class Overlay(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.setWindowTitle("Tradutor de Tela")
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setMinimumSize(160, 60)
        self.ghost = False
        # posicao inicial: retangulo horizontal sobre a area de legendas (parte de baixo da tela)
        ag = QApplication.primaryScreen().availableGeometry()
        w, h = int(ag.width() * 0.70), max(int(ag.height() * 0.21), 130)
        self.setGeometry(ag.x() + (ag.width() - w) // 2, ag.y() + ag.height() - h - int(ag.height() * 0.04), w, h)
        self.items, self.status = [], ""
        self._drag = None

        btn_css = ("QPushButton{background:rgba(0,0,0,70);color:white;border:none;border-radius:4px;"
                   "font-size:13px;} QPushButton:hover{background:rgba(255,255,255,90);color:black;}")
        self.btn_min = QPushButton("—", self); self.btn_min.setToolTip("Minimizar")
        self.btn_max = QPushButton("□", self); self.btn_max.setToolTip("Maximizar")
        self.btn_close = QPushButton("✕", self); self.btn_close.setToolTip("Fechar")
        self.btn_icon = QPushButton("文A", self); self.btn_icon.setToolTip("Tradução")
        self.btn_ghost = QPushButton(self)
        self.btn_ghost.setIcon(ghost_icon(QColor(255, 255, 255))); self.btn_ghost.setIconSize(QSize(16, 16))
        self.btn_ghost.setToolTip("Modo fantasma: 95% transparente e os cliques passam para a janela de trás")
        for b in (self.btn_min, self.btn_max, self.btn_close, self.btn_icon, self.btn_ghost):
            b.setStyleSheet(btn_css); b.setFixedSize(26, 22); b.setCursor(Qt.PointingHandCursor)
        self.btn_close.setStyleSheet(btn_css + "QPushButton:hover{background:#e81123;color:white;}")
        self.btn_ghost.setStyleSheet("QPushButton{background:qlineargradient(x1:0,y1:0,x2:0,y2:1,"
                                     "stop:0 rgba(150,120,255,210),stop:1 rgba(90,70,200,210));"
                                     "border:none;border-radius:11px;}"
                                     "QPushButton:hover{background:qlineargradient(x1:0,y1:0,x2:0,y2:1,"
                                     "stop:0 rgba(180,155,255,255),stop:1 rgba(120,95,230,255));}")
        self.btn_icon.setFixedSize(30, 22)
        self.btn_min.clicked.connect(self.showMinimized)
        self.btn_max.clicked.connect(self._toggle_max)
        self.btn_close.clicked.connect(self.close)
        self.btn_icon.clicked.connect(self._toggle_panel)
        self.btn_ghost.clicked.connect(lambda: self._set_ghost(True))
        # botao flutuante (fora da janela) para sair do modo fantasma
        self.unghost = QPushButton("  Voltar a clicar")
        self.unghost.setIcon(ghost_icon(QColor(255, 255, 255))); self.unghost.setIconSize(QSize(18, 18))
        self.unghost.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.unghost.setAttribute(Qt.WA_TranslucentBackground)
        self.unghost.setStyleSheet("QPushButton{background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
                                   "stop:0 rgba(150,120,255,225),stop:1 rgba(90,110,240,225));color:white;"
                                   "border:1px solid rgba(255,255,255,120);border-radius:14px;"
                                   "padding:5px 14px;font:600 11px 'Segoe UI';}"
                                   "QPushButton:hover{background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
                                   "stop:0 rgb(175,150,255),stop:1 rgb(115,135,255));}")
        self.unghost.setCursor(Qt.PointingHandCursor)
        self.unghost.clicked.connect(lambda: self._set_ghost(False))

        self.panel = LangPanel(self); self.panel.hide()
        self.panel.changed.connect(self._langs_changed)
        self.grip = QSizeGrip(self); self.grip.setFixedSize(16, 16)
        self.grip.setStyleSheet("background: transparent;")

        self.worker = Worker()
        self.worker.result.connect(self._on_result)
        self.worker.error.connect(self._on_error)
        self.worker.status.connect(self._on_error)
        self.worker.missing.connect(self._on_missing)
        self._dlg = None
        self.timer = QTimer(self); self.timer.timeout.connect(self._tick)
        self.top_timer = QTimer(self); self.top_timer.timeout.connect(self._topmost); self.top_timer.start(500)
        self.move_timer = QTimer(self); self.move_timer.setSingleShot(True)
        self.move_timer.timeout.connect(self._force)

    # --- Windows: fica invisivel para capturas de tela (sem piscar) ---
    def showEvent(self, e):
        super().showEvent(e)
        if sys.platform == "win32":
            try:
                ctypes.windll.user32.SetWindowDisplayAffinity(int(self.winId()), WDA_EXCLUDEFROMCAPTURE)
            except Exception:
                pass
        self._layout()
        self._topmost()

    def _set_ghost(self, on):
        self.ghost = on
        self.panel.hide()
        for b in (self.btn_min, self.btn_max, self.btn_close, self.btn_icon, self.btn_ghost, self.grip):
            b.setVisible(not on)
        if sys.platform == "win32":
            u = ctypes.windll.user32
            hwnd = int(self.winId())
            GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT = -20, 0x80000, 0x20
            st = u.GetWindowLongPtrW(ctypes.c_void_p(hwnd), GWL_EXSTYLE)
            st = (st | WS_EX_LAYERED | WS_EX_TRANSPARENT) if on else (st & ~WS_EX_TRANSPARENT)
            u.SetWindowLongPtrW(ctypes.c_void_p(hwnd), GWL_EXSTYLE, ctypes.c_ssize_t(st))
        if on:
            self.unghost.adjustSize()
            g = self.frameGeometry()
            self.unghost.move(g.right() - self.unghost.width() - 164, g.top() - self.unghost.height() - 2
                              if g.top() > 30 else g.top() + 4)
            self.unghost.show()
            if sys.platform == "win32":
                try:
                    ctypes.windll.user32.SetWindowDisplayAffinity(int(self.unghost.winId()), WDA_EXCLUDEFROMCAPTURE)
                except Exception:
                    pass
        else:
            self.unghost.hide()
        self.update(); self._topmost()

    def closeEvent(self, e):
        self.unghost.close(); super().closeEvent(e)

    def _topmost(self):
        # reforca "sempre no topo" acima de tudo (inclusive outras janelas topmost)
        if sys.platform == "win32" and not self.isMinimized():
            try:
                for wdg in (self, self.unghost):
                    if wdg.isVisible():
                        ctypes.windll.user32.SetWindowPos(int(wdg.winId()), -1, 0, 0, 0, 0,
                                                          0x0001 | 0x0002 | 0x0010)  # NOSIZE|NOMOVE|NOACTIVATE
            except Exception:
                pass

    def _layout(self):
        w = self.width()
        # afastados do canto direito para nao cobrir os botoes da janela de tras
        off = 160 if w > 420 else max(0, w - 260)
        self.btn_close.move(w - off - 32, 6)
        self.btn_max.move(w - off - 60, 6)
        self.btn_min.move(w - off - 88, 6)
        self.btn_ghost.move(w - off - 124, 6)
        self.btn_icon.move(6, 6)
        self.panel.move(6, 32)
        self.grip.move(w - 16, self.height() - 16)

    def resizeEvent(self, e):
        self._layout(); self._invalidate()

    def moveEvent(self, e):
        self._invalidate()

    def _invalidate(self):
        if self.items:
            self.items = []; self.update()
        self.move_timer.start(250)

    def _toggle_max(self):
        self.showNormal() if self.isMaximized() else self.showMaximized()

    def changeEvent(self, e):
        super().changeEvent(e)
        if hasattr(self, "btn_max"):
            if self.isMaximized():
                self.btn_max.setText("❐"); self.btn_max.setToolTip("Restaurar")
            else:
                self.btn_max.setText("□"); self.btn_max.setToolTip("Maximizar")

    def _toggle_panel(self):
        self.panel.setVisible(not self.panel.isVisible()); self.panel.raise_()

    def _langs_changed(self):
        src, dst = self.panel.langs()
        if src and dst:
            save_config({"src": src, "dst": dst})
        self.items = []; self.status = ""; self.worker.last_hash = None; self.worker.paused = False
        if src and dst:
            self.panel.hide()
            self.timer.start(700); self._force()
        else:
            self.timer.stop()
        self.update()

    def _force(self):
        self.worker.last_hash = None; self._tick()

    def _tick(self):
        src, dst = self.panel.langs()
        if not (src and dst) or self.isMinimized():
            return
        dpr = self.devicePixelRatioF()
        tl = self.mapToGlobal(QPoint(0, 0))
        # coordenadas fisicas (Qt usa logicas); ajuste pela tela onde a janela esta
        geo = self.screen().geometry()
        px = int(geo.x() + (tl.x() - geo.x()) * dpr)
        py = int(geo.y() + (tl.y() - geo.y()) * dpr)
        self.worker.process((px, py, int(self.width() * dpr), int(self.height() * dpr)), dpr, src, dst)

    def _on_result(self, items, dpr):
        self.items, self.status = items, ""; self.update()

    def _on_missing(self, tag):
        if self._dlg is not None:
            return
        self.status = f"Idioma '{tag}' não instalado no Windows."
        self.update()
        self.top_timer.stop()  # deixa o dialogo ficar na frente
        self._dlg = MissingLangDialog(self, tag)
        self._dlg.finished.connect(self._after_missing)
        self._dlg.show(); self._dlg.raise_(); self._dlg.activateWindow()

    def _after_missing(self, result):
        self._dlg = None
        self.top_timer.start(500)
        if self.worker.ocr:
            self.worker.ocr.engines.clear()
        if result == 0:  # janela fechada no X
            self.status = "Idioma não instalado. Clique em 文A para escolher outro idioma ou tentar de novo."
            self.update(); return
        self.worker.paused = False
        self.status = ""
        self._force()

    def _on_error(self, msg):
        self.status = msg; self.update()

    # --- desenho ---
    def paintEvent(self, e):
        p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        r = self.rect().adjusted(0, 0, -1, -1)
        if self.ghost:  # 95% transparente: so um contorno quase invisivel
            p.setBrush(QColor(20, 20, 30, 6))
            p.setPen(QPen(QColor(90, 160, 255, 30), 1)); p.drawRoundedRect(r.adjusted(1, 1, -1, -1), 8, 8)
        else:
            p.setBrush(QColor(20, 20, 30, 45))   # translucido
            p.setPen(QPen(QColor(0, 0, 0, 140), 3)); p.drawRoundedRect(r.adjusted(1, 1, -1, -1), 8, 8)
            p.setPen(QPen(QColor(90, 160, 255, 230), 1.5)); p.drawRoundedRect(r.adjusted(1, 1, -1, -1), 8, 8)
        for text, qr, bg, fg in self.items:
            p.setPen(Qt.NoPen); p.setBrush(bg); p.drawRoundedRect(qr, 3, 3)
            self._fit_text(p, text, qr, fg)
        if self.status:
            p.setPen(QColor(255, 200, 80)); p.setFont(QFont("Segoe UI", 9))
            p.drawText(self.rect().adjusted(8, 34, -8, -8), Qt.TextWordWrap, self.status)
        p.end()

    @staticmethod
    def _fit_text(p, text, qr, fg):
        f = QFont("Segoe UI")
        size = max(qr.height() * 0.62, 6.0)
        while size > 5:
            f.setPixelSize(int(size))
            if QFontMetrics(f).horizontalAdvance(text) <= qr.width() + 2:
                break
            size -= 0.5
        f.setPixelSize(int(size)); p.setFont(f); p.setPen(fg)
        p.drawText(qr, Qt.AlignVCenter | Qt.AlignLeft | Qt.TextDontClip, text)

    # --- arrastar pela janela / fechar ---
    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._drag = e.globalPosition().toPoint() - self.frameGeometry().topLeft()
            if self.panel.isVisible() and not self.panel.geometry().contains(e.position().toPoint()):
                self.panel.hide()

    def mouseMoveEvent(self, e):
        if self._drag is not None and e.buttons() & Qt.LeftButton and not self.isMaximized():
            self.move(e.globalPosition().toPoint() - self._drag)

    def mouseReleaseEvent(self, e):
        self._drag = None

    def contextMenuEvent(self, e):
        m = QMenu(self); a = QAction("Fechar", self); a.triggered.connect(self.close)
        m.addAction(a); m.exec(e.globalPos())

    # --- redimensionar arrastando as bordas (Windows WM_NCHITTEST) ---
    def nativeEvent(self, eventType, message):
        if sys.platform == "win32" and not self.isMaximized():
            try:
                from ctypes import wintypes
                msg = wintypes.MSG.from_address(int(message))
                if msg.message == 0x0084:  # WM_NCHITTEST
                    x = ctypes.c_short(msg.lParam & 0xFFFF).value
                    y = ctypes.c_short((msg.lParam >> 16) & 0xFFFF).value
                    dpr = self.devicePixelRatioF()
                    geo = self.screen().geometry()
                    gx = geo.x() + (x - geo.x()) / dpr
                    gy = geo.y() + (y - geo.y()) / dpr
                    pos = self.mapFromGlobal(QPoint(int(gx), int(gy)))
                    b, w, h = 8, self.width(), self.height()
                    l, r = pos.x() < b, pos.x() >= w - b
                    t, bo = pos.y() < b, pos.y() >= h - b
                    code = {(1,0,1,0):13,(0,1,1,0):14,(1,0,0,1):16,(0,1,0,1):17,
                            (1,0,0,0):10,(0,1,0,0):11,(0,0,1,0):12,(0,0,0,1):15}.get((l,r,t,bo))
                    if code:
                        return True, code
            except Exception:
                pass
        return super().nativeEvent(eventType, message)

    def keyPressEvent(self, e):
        if e.key() == Qt.Key_Escape:
            self.close()


if __name__ == "__main__":
    if sys.platform == "win32":
        try:  # icone/agrupamento proprio na barra de tarefas
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Lucas.TradutorDeTela")
        except Exception:
            pass
    app = QApplication(sys.argv)
    try:
        import os
        from PySide6.QtGui import QIcon
        app.setWindowIcon(QIcon(os.path.join(app_dir(), "icone.ico")))
    except Exception:
        pass
    w = Overlay(); w.show()
    cfg = load_config()  # ultimos idiomas usados
    for combo, key in ((w.panel.src, "src"), (w.panel.dst, "dst")):
        i = combo.findData(cfg.get(key))
        if i > 0:
            combo.setCurrentIndex(i)
    sys.exit(app.exec())
