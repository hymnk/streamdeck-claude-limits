# Builds docs/keys.png for the README from the SVGs that `npm run preview` writes to dist/svg,
# rendered with Qt's SVG engine (the one Stream Deck uses).
# Needs PySide6:  pip install PySide6-Essentials
import os
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont, QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer

# (svg index written by scripts/preview.ts, caption)
CELLS = [
    (0, "Session"),
    (1, "Week"),
    (2, "Both"),
    (5, "Both, remaining"),
    (9, "Stale (gray spark)"),
    (11, "Custom fonts & sizes"),
]

app = QGuiApplication(sys.argv)
root = os.path.join(os.path.dirname(__file__), "..")
cell, gap, cols, caption_h = 288, 28, 3, 44
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
for i, (index, caption) in enumerate(CELLS):
    x = gap + (i % cols) * (cell + gap)
    y = gap + (i // cols) * (cell + caption_h + gap)
    QSvgRenderer(os.path.join(root, "dist", "svg", f"{index:02d}.svg")).render(painter, QRectF(x, y, cell, cell))
    painter.setPen(QColor("#d9d5cb"))
    painter.drawText(QRectF(x, y + cell + 6, cell, caption_h - 6), Qt.AlignCenter, caption)
painter.end()

out = os.path.join(root, "docs", "keys.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out)
print(out)
