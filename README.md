# PDF Editor with Drawing

A simple PDF editor that allows you to draw on PDF files and save the edited versions.

## Features

- Open PDF files
- Navigate through pages
- Draw on PDF pages using the mouse
- Save edited PDF files

## Installation

1. Make sure you have Python installed on your system
2. Create a virtual environment:
   ```
   python -m venv venv
   ```
3. Activate the virtual environment:
   - Windows:
     ```
     .\venv\Scripts\activate
     ```
   - Linux/Mac:
     ```
     source venv/bin/activate
     ```
4. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

## Usage

1. Run the application:
   ```
   python pdf_editor.py
   ```
2. Click "Open PDF" to select a PDF file
3. Use your mouse to draw on the PDF pages:
   - Left click and drag to draw
   - Use the Previous/Next buttons to navigate between pages
4. Click "Save PDF" to save your edited PDF file

## Notes

- The drawing color is set to red by default
- Drawing is done with a pen width of 2 pixels
- The application supports multi-page PDFs 