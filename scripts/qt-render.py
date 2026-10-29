# Renders dist/svg/*.svg with Qt's SVG engine (the one Stream Deck uses) into dist/qt-preview.png.
# Needs PySide6:  pip install PySide6-Essentials
import glob
import os
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer

app = QGuiApplication(sys.argv)
dist = os.path.join(os.path.dirname(__file__), "..", "dist")
files = sorted(glob.glob(os.path.join(dist, "svg", "*.svg")))
cell, gap, cols = 288, 16, 4
rows = (len(files) + cols - 1) // cols
sheet = QImage(cols * (cell + gap) + gap, rows * (cell + gap) + gap, QImage.Format_ARGB32)
sheet.fill(QColor("#111111"))
painter = QPainter(sheet)
for i, f in enumerate(files):
    x = gap + (i % cols) * (cell + gap)
    y = gap + (i // cols) * (cell + gap)
    QSvgRenderer(f).render(painter, QRectF(x, y, cell, cell))
    # Inner band guides (18px of 144 on each side).
    painter.setPen(QColor(0, 170, 255, 110))
    painter.drawLine(x + 36, y, x + 36, y + cell)
    painter.drawLine(x + cell - 36, y, x + cell - 36, y + cell)
painter.end()
out = os.path.join(dist, "qt-preview.png")
sheet.save(out)
print(out)
