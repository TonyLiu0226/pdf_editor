import sys
import fitz  # PyMuPDF
from PyQt6.QtWidgets import (QApplication, QMainWindow, QFileDialog, QVBoxLayout, 
                            QHBoxLayout, QWidget, QPushButton, QLabel, QScrollArea)
from PyQt6.QtCore import Qt, QPoint
from PyQt6.QtGui import QImage, QPixmap, QPainter, QPen, QColor

class PDFEditor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PDF Editor with Drawing")
        self.setGeometry(100, 100, 800, 600)

        # Initialize variables
        self.current_pdf = None
        self.current_page = 0
        self.total_pages = 0
        self.drawing = False
        self.last_point = None
        self.image = None
        self.drawings = []
        
        # Create main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)
        
        # Create toolbar
        toolbar = QHBoxLayout()
        
        # Add buttons
        self.open_btn = QPushButton("Open PDF")
        self.open_btn.clicked.connect(self.open_pdf)
        
        self.save_btn = QPushButton("Save PDF")
        self.save_btn.clicked.connect(self.save_pdf)
        self.save_btn.setEnabled(False)
        
        self.prev_btn = QPushButton("Previous")
        self.prev_btn.clicked.connect(self.prev_page)
        self.prev_btn.setEnabled(False)
        
        self.next_btn = QPushButton("Next")
        self.next_btn.clicked.connect(self.next_page)
        self.next_btn.setEnabled(False)
        
        self.page_label = QLabel("Page: 0/0")
        
        # Add buttons to toolbar
        toolbar.addWidget(self.open_btn)
        toolbar.addWidget(self.save_btn)
        toolbar.addWidget(self.prev_btn)
        toolbar.addWidget(self.page_label)
        toolbar.addWidget(self.next_btn)
        
        # Create scroll area for PDF view
        self.scroll_area = QScrollArea()
        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.scroll_area.setWidget(self.image_label)
        
        # Add widgets to main layout
        layout.addLayout(toolbar)
        layout.addWidget(self.scroll_area)
        
        # Setup drawing
        self.image_label.setMouseTracking(True)
        self.current_color = QColor(Qt.GlobalColor.red)
        self.pen_width = 2

    def open_pdf(self):
        file_name, _ = QFileDialog.getOpenFileName(self, "Open PDF", "", "PDF files (*.pdf)")
        if file_name:
            self.current_pdf = fitz.open(file_name)
            self.total_pages = len(self.current_pdf)
            self.current_page = 0
            self.drawings = [[] for _ in range(self.total_pages)]
            self.update_page_view()
            self.save_btn.setEnabled(True)
            self.update_navigation_buttons()

    def save_pdf(self):
        if not self.current_pdf:
            return
            
        file_name, _ = QFileDialog.getSaveFileName(self, "Save PDF", "", "PDF files (*.pdf)")
        if file_name:
            # Create a new PDF with drawings
            self.current_pdf.save(file_name)

    def update_navigation_buttons(self):
        self.prev_btn.setEnabled(self.current_page > 0)
        self.next_btn.setEnabled(self.current_page < self.total_pages - 1)
        self.page_label.setText(f"Page: {self.current_page + 1}/{self.total_pages}")

    def update_page_view(self):
        if not self.current_pdf:
            return

        # Get the current page
        page = self.current_pdf[self.current_page]
        
        # Convert PDF page to image
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        
        # Convert to QImage
        img = QImage(pix.samples, pix.width, pix.height, pix.stride, QImage.Format.Format_RGB888)
        
        # Create a new image for drawing
        self.image = QImage(img.size(), QImage.Format.Format_RGB888)
        painter = QPainter(self.image)
        painter.drawImage(0, 0, img)
        
        # Draw existing drawings
        painter.setPen(QPen(self.current_color, self.pen_width))
        for points in self.drawings[self.current_page]:
            for i in range(len(points) - 1):
                painter.drawLine(points[i], points[i + 1])
        
        painter.end()
        
        # Update the display
        self.image_label.setPixmap(QPixmap.fromImage(self.image))
        self.image_label.setFixedSize(self.image.size())

    def prev_page(self):
        if self.current_page > 0:
            self.current_page -= 1
            self.update_page_view()
            self.update_navigation_buttons()

    def next_page(self):
        if self.current_page < self.total_pages - 1:
            self.current_page += 1
            self.update_page_view()
            self.update_navigation_buttons()

    def mousePressEvent(self, event):
        if self.image and event.button() == Qt.MouseButton.LeftButton:
            self.drawing = True
            pos = self.image_label.mapFrom(self, event.pos())
            self.last_point = pos
            self.drawings[self.current_page].append([pos])

    def mouseMoveEvent(self, event):
        if self.drawing and self.image:
            pos = self.image_label.mapFrom(self, event.pos())
            
            # Draw line
            painter = QPainter(self.image)
            painter.setPen(QPen(self.current_color, self.pen_width))
            painter.drawLine(self.last_point, pos)
            painter.end()
            
            # Update the display
            self.image_label.setPixmap(QPixmap.fromImage(self.image))
            
            # Store the line
            self.drawings[self.current_page][-1].append(pos)
            self.last_point = pos

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drawing = False

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = PDFEditor()
    window.show()
    sys.exit(app.exec()) 