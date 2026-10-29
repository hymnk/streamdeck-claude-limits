# Builds docs/keys.png for the README from the SVGs that `npm run preview` writes to dist/svg
# (run that first),
# rendered with Qt's SVG engine (the one Stream Deck uses).
# Needs PySide6:  pip install PySide6-Essentials
import json
import os
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont, QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer

# (case title in scripts/preview.ts, caption)
CELLS = [
    ("Session 16%", "Session"),
    ("Week 92%", "Week"),
    ("両方", "Both"),
    ("両方 残量表示(Left)", "Both, remaining"),
    ("Session 残量表示(Left)", "Session, remaining"),
    ("古いデータ", "Stale (gray spark)"),
    ("文字設定: 大きめ", "Custom fonts & sizes"),
    ("バーの色: カスタム", "Custom bar colors"),
]

app = QGuiApplication(sys.argv)
root = os.path.join(os.path.dirname(__file__), "..")
cell, gap, cols, caption_h = 288, 28, 4, 44
rows = (len(CELLS) + cols - 1) // cols
width = cols * cell + (cols + 1) * gap
height = rows * (cell + caption_h) + (rows + 1) * gap
sheet = QImage(width, height, QImage.Format_ARGB32)
sheet.fill(QColor("#141413"))
painter = QPainter(sheet)
painter.setRenderHint(QPainter.Antialiasing)
painter.setRenderHint(QPainter.TextAntialiasing)
font = QFont("Segoe UI")
font.setPixelSize(22)
font.setBold(True)
painter.setFont(font)
with open(os.path.join(root, "dist", "svg", "index.json"), encoding="utf-8") as f:
    files = json.load(f)
for i, (title, caption) in enumerate(CELLS):
    x = gap + (i % cols) * (cell + gap)
    y = gap + (i // cols) * (cell + caption_h + gap)
    QSvgRenderer(os.path.join(root, "dist", "svg", files[title])).render(painter, QRectF(x, y, cell, cell))
    painter.setPen(QColor("#d9d5cb"))
    painter.drawText(QRectF(x, y + cell + 6, cell, caption_h - 6), Qt.AlignCenter, caption)
painter.end()

out = os.path.join(root, "docs", "keys.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out)
print(out)
