import os
from flask import Flask, render_template, request, send_file, jsonify
import fitz
from PIL import Image
import io
import base64
import shutil
import time

app = Flask(__name__, static_folder='../static', template_folder='../templates')

# Determine upload folder based on environment
if os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV") or os.path.exists("/tmp"):
    upload_folder = "/tmp"
else:
    upload_folder = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(upload_folder, exist_ok=True)

app.config['UPLOAD_FOLDER'] = upload_folder
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Define a higher resolution zoom matrix for better quality
ZOOM_MATRIX = fitz.Matrix(8, 8)  # Increased from 2,2 to 4,4 for higher resolution
TARGET_WIDTH = 1000  # Increased target width for better quality

def get_scaled_dimensions(page):
    """Calculate scaled dimensions maintaining aspect ratio"""
    rect = page.rect
    aspect_ratio = rect.height / rect.width
    target_height = int(TARGET_WIDTH * aspect_ratio)
    return TARGET_WIDTH, target_height

def convert_page_to_image(page):
    """Convert PDF page to image with consistent high-resolution scaling"""
    target_width, target_height = get_scaled_dimensions(page)
    
    # Get high-resolution pixmap
    pix = page.get_pixmap(matrix=ZOOM_MATRIX, alpha=False)
    
    # Convert to PIL Image with high quality
    img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
    
    # Use high-quality downsampling
    if img.size[0] > target_width:
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
    
    # Save with high quality
    img_io = io.BytesIO()
    img.save(img_io, 'PNG', quality=95, optimize=False)
    img_io.seek(0)
    return img_io, target_width, target_height

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not file.filename.endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400
    
    # Save the uploaded file
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)
    
    try:
        # Convert first page to image
        pdf = fitz.open(filepath)
        page = pdf[0]
        
        # Convert to image with consistent scaling
        img_io, width, height = convert_page_to_image(page)
        img_base64 = base64.b64encode(img_io.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'filename': file.filename,
            'total_pages': len(pdf),
            'current_page': 1,
            'image_data': img_base64,
            'width': width,
            'height': height
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_page/<filename>/<int:page_num>')
def get_page(filename, page_num):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        pdf = fitz.open(filepath)
        if page_num < 1 or page_num > len(pdf):
            return jsonify({'error': 'Invalid page number'}), 400
        
        # Convert page to image with consistent scaling
        page = pdf[page_num - 1]
        img_io, width, height = convert_page_to_image(page)
        img_base64 = base64.b64encode(img_io.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'image_data': img_base64,
            'width': width,
            'height': height
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/save', methods=['POST'])
def save_pdf():
    data = request.json
    if not data or 'image_data' not in data or 'filename' not in data or 'current_page' not in data:
        return jsonify({'error': 'Missing required data'}), 400
    
    try:
        # Create a working directory for this save operation
        base_filename = os.path.splitext(data['filename'])[0]
        work_dir = os.path.join(app.config['UPLOAD_FOLDER'], f'work_{base_filename}')
        os.makedirs(work_dir, exist_ok=True)
        
        # Decode the image data
        img_data = base64.b64decode(data['image_data'].split(',')[1])
        img = Image.open(io.BytesIO(img_data))
        img_rgb = img.convert('RGB')
        
        # Get original page dimensions from the PDF
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], data['filename'])
        pdf_doc = fitz.open(input_path)
        page = pdf_doc[int(data['current_page']) - 1]
        orig_width = page.rect.width
        orig_height = page.rect.height
        pdf_doc.close()
        
        # Create a new image with the exact PDF dimensions
        new_img = Image.new('RGB', (int(orig_width), int(orig_height)), 'white')
        
        # Paste the canvas content onto the new image
        new_img.paste(img_rgb, (0, 0))
        
        # Save the edited page
        page_pdf_path = os.path.join(work_dir, f'page_{data["current_page"]}.pdf')
        new_img.save(page_pdf_path, 'PDF', resolution=300, quality=100)
        
        return jsonify({'success': True})
    except Exception as e:
        # Clean up work directory in case of error
        if 'work_dir' in locals():
            shutil.rmtree(work_dir, ignore_errors=True)
        return jsonify({'error': str(e)}), 500

@app.route('/get_final_pdf/<filename>')
def get_final_pdf(filename):
    try:
        base_filename = os.path.splitext(filename)[0]
        work_dir = os.path.join(app.config['UPLOAD_FOLDER'], f'work_{base_filename}')
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        output_filename = f"edited_{filename}"
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        
        # Create the final merged PDF
        result_pdf = fitz.open()
        orig_pdf = fitz.open(input_path)
        total_pages = len(orig_pdf)
        
        # Add all pages, replacing edited ones
        for i in range(total_pages):
            page_num = i + 1
            page_pdf_path = os.path.join(work_dir, f'page_{page_num}.pdf')
            
            if os.path.exists(page_pdf_path):
                # Insert edited page
                edited_page_pdf = fitz.open(page_pdf_path)
                result_pdf.insert_pdf(edited_page_pdf)
                edited_page_pdf.close()
            else:
                # Copy original page
                result_pdf.insert_pdf(orig_pdf, from_page=i, to_page=i)
        
        # Save the final merged PDF
        result_pdf.save(output_path, garbage=4, clean=True)
        result_pdf.close()
        orig_pdf.close()
        
        # Clean up work directory
        shutil.rmtree(work_dir)
        
        return send_file(output_path, as_attachment=True)
    except Exception as e:
        # Clean up work directory in case of error
        if 'work_dir' in locals():
            shutil.rmtree(work_dir, ignore_errors=True)
        return jsonify({'error': str(e)}), 500

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    if 'files[]' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files[]')
    if not files:
        return jsonify({'error': 'No files selected'}), 400
    
    try:
        # Create a new PDF
        merged_pdf = fitz.open()
        
        # Add each PDF to the merged document
        for file in files:
            if not file.filename.endswith('.pdf'):
                continue
                
            # Save the uploaded file temporarily
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
            file.save(temp_path)
            
            # Open and add pages to merged PDF
            pdf = fitz.open(temp_path)
            merged_pdf.insert_pdf(pdf)
            pdf.close()
            
            # Clean up temporary file
            os.remove(temp_path)
        
        # Save the merged PDF
        output_filename = f"merged_{int(time.time())}.pdf"
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        merged_pdf.save(output_path, garbage=4, clean=True)
        merged_pdf.close()
        
        return send_file(output_path, as_attachment=True, download_name=output_filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 