import os
from flask import Flask, render_template, request, send_file, jsonify
import fitz
from PIL import Image
import io
import base64
import shutil
import time
import tempfile
from urllib.parse import quote, unquote
from supabase_client import upload_file_object, download_to_temp, delete_file, upload_temp_file, cleanup_temp_file

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Define a higher resolution zoom matrix for better quality
ZOOM_MATRIX = fitz.Matrix(4, 4)  # Increased from 2,2 to 4,4 for higher resolution
TARGET_WIDTH = 1500  # Increased target width for better quality

def sanitize_filename(filename):
    """Sanitize filename to be URL and filesystem safe"""
    # Remove any path components
    filename = os.path.basename(filename)
    # Replace spaces and special characters
    safe_name = "".join(c for c in filename if c.isalnum() or c in '._-')
    return safe_name

def get_scaled_dimensions(page):
    """Calculate scaled dimensions maintaining aspect ratio"""
    rect = page.rect
    aspect_ratio = rect.height / rect.width
    target_height = int(TARGET_WIDTH * aspect_ratio)
    return TARGET_WIDTH, target_height

def convert_page_to_image(page):
    """Convert PDF page to image with consistent high-resolution scaling"""
    try:
        # Get page dimensions at default resolution
        target_width, target_height = get_scaled_dimensions(page)
        
        # Use a higher DPI for better quality
        zoom = 4  # Increase zoom factor for higher resolution
        mat = fitz.Matrix(zoom, zoom)
        
        # Get high-resolution pixmap with alpha channel
        pix = page.get_pixmap(matrix=mat, alpha=False)
        
        # Convert to PIL Image
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        
        # Calculate new dimensions while maintaining aspect ratio
        aspect_ratio = img.height / img.width
        new_height = int(target_width * aspect_ratio)
        
        # Use high-quality downsampling
        img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)
        
        # Save with maximum quality
        img_io = io.BytesIO()
        img.save(img_io, format='PNG', optimize=True, quality=100)
        img_io.seek(0)
        
        print(f"Converted page to image: {target_width}x{new_height}")
        return img_io, target_width, new_height
        
    except Exception as e:
        print(f"Error converting page to image: {str(e)}")
        raise

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
    
    try:
        print(f"Processing upload for file: {file.filename}")
        
        # Sanitize filename before upload
        safe_filename = sanitize_filename(file.filename)
        print(f"Sanitized filename: {safe_filename}")
        
        # Upload file to Supabase
        file_path, public_url = upload_file_object(file, safe_filename)
        print(f"File uploaded to Supabase: {file_path}")
        
        # Download to temp file for processing
        temp_file_path = download_to_temp(file_path)
        print(f"Downloaded to temp file: {temp_file_path}")
        
        # Process the PDF
        pdf = fitz.open(temp_file_path)
        total_pages = len(pdf)
        print(f"PDF opened successfully. Total pages: {total_pages}")
        
        # Convert first page to image
        page = pdf[0]
        print(f"Processing page 1/{total_pages}")
        img_io, width, height = convert_page_to_image(page)
        img_base64 = base64.b64encode(img_io.getvalue()).decode()
        print(f"Page converted to image: {width}x{height}")
        
        # Clean up
        pdf.close()
        cleanup_temp_file(temp_file_path)
        print("Cleanup completed")
        
        response_data = {
            'success': True,
            'filename': safe_filename,
            'file_path': file_path,
            'public_url': public_url,
            'total_pages': total_pages,
            'current_page': 1,
            'image_data': img_base64,
            'width': width,
            'height': height
        }
        print("Sending response with image data")
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error in upload: {str(e)}")
        # Clean up temp file if it exists
        if 'temp_file_path' in locals():
            cleanup_temp_file(temp_file_path)
        return jsonify({'error': str(e)}), 500

@app.route('/get_page/<path:file_path>/<int:page_num>')
def get_page(file_path, page_num):
    temp_file_path = None
    pdf = None
    try:
        print(f"Getting page {page_num} from file: {file_path}")
        
        # Clean up and decode the file path
        file_path = unquote(file_path)
        file_path = file_path.replace('\\', '/').strip('/')
        
        # Don't modify the file path - use it exactly as stored
        print(f"Using file path: {file_path}")
        
        # Download to temp file
        temp_file_path = download_to_temp(file_path)
        print(f"Downloaded to temp file: {temp_file_path}")
        
        # Process the PDF
        pdf = fitz.open(temp_file_path)
        total_pages = len(pdf)
        print(f"PDF opened successfully. Total pages: {total_pages}")
        
        if page_num < 1 or page_num > total_pages:
            print(f"Invalid page number: {page_num}")
            return jsonify({'error': 'Invalid page number'}), 400
        
        # Convert page to image
        print(f"Processing page {page_num}/{total_pages}")
        page = pdf[page_num - 1]
        img_io, width, height = convert_page_to_image(page)
        img_base64 = base64.b64encode(img_io.getvalue()).decode()
        print(f"Page converted to image: {width}x{height}")
        
        response_data = {
            'success': True,
            'image_data': img_base64,
            'width': width,
            'height': height
        }
        print("Sending response with image data")
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error in get_page: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        
    finally:
        # Clean up resources
        if pdf:
            try:
                pdf.close()
            except:
                pass
                
        if temp_file_path:
            try:
                cleanup_temp_file(temp_file_path)
                print("Cleanup completed")
            except:
                pass

@app.route('/save', methods=['POST'])
def save_pdf():
    data = request.json
    if not data or 'image_data' not in data or 'file_path' not in data or 'current_page' not in data:
        return jsonify({'error': 'Missing required data'}), 400
    
    try:
        # Create temporary directory for processing
        work_dir = tempfile.mkdtemp()
        
        # Download original PDF to temp file
        temp_input_path = download_to_temp(data['file_path'])
        
        # Save the edited page as a single-page PDF
        img_data = base64.b64decode(data['image_data'].split(',')[1])
        img = Image.open(io.BytesIO(img_data))
        img_rgb = img.convert('RGB')
        
        # Get original page dimensions
        pdf_doc = fitz.open(temp_input_path)
        page = pdf_doc[int(data['current_page']) - 1]
        orig_width = page.rect.width
        orig_height = page.rect.height
        pdf_doc.close()
        
        # Resize image to match original dimensions
        img_rgb = img_rgb.resize((int(orig_width), int(orig_height)), Image.Resampling.LANCZOS)
        
        # Save the edited page
        page_pdf_path = os.path.join(work_dir, f'page_{data["current_page"]}.pdf')
        img_rgb.save(page_pdf_path, 'PDF', quality=95, optimize=False)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temporary files
        if 'temp_input_path' in locals():
            cleanup_temp_file(temp_input_path)
        if 'work_dir' in locals():
            shutil.rmtree(work_dir, ignore_errors=True)

@app.route('/get_final_pdf/<path:file_path>')
def get_final_pdf(file_path):
    try:
        # Create temporary directory for processing
        work_dir = tempfile.mkdtemp()
        temp_input_path = download_to_temp(file_path)
        
        # Create temporary output file
        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        temp_output_path = temp_output.name
        temp_output.close()
        
        # Create the final merged PDF
        result_pdf = fitz.open()
        orig_pdf = fitz.open(temp_input_path)
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
        result_pdf.save(temp_output_path, garbage=4, clean=True)
        result_pdf.close()
        orig_pdf.close()
        
        # Upload the final PDF to Supabase
        original_filename = os.path.basename(file_path)
        base_name = os.path.splitext(original_filename)[0]
        new_filename = f"edited_{base_name}.pdf"
        file_path, public_url = upload_temp_file(temp_output_path, new_filename)
        
        # Clean up temporary files
        shutil.rmtree(work_dir, ignore_errors=True)
        cleanup_temp_file(temp_input_path)
        cleanup_temp_file(temp_output_path)
        
        # Return the public URL
        return jsonify({
            'success': True,
            'file_path': file_path,
            'public_url': public_url
        })
    except Exception as e:
        # Clean up temporary files
        if 'work_dir' in locals():
            shutil.rmtree(work_dir, ignore_errors=True)
        if 'temp_input_path' in locals():
            cleanup_temp_file(temp_input_path)
        if 'temp_output_path' in locals():
            cleanup_temp_file(temp_output_path)
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
        temp_files = []
        
        # Process each file
        for file in files:
            if not file.filename.endswith('.pdf'):
                continue
            
            # Upload to Supabase and get temp file
            file_path, _ = upload_file_object(file, file.filename)
            temp_file = download_to_temp(file_path)
            temp_files.append((temp_file, file_path))
            
            # Add to merged PDF
            pdf = fitz.open(temp_file)
            merged_pdf.insert_pdf(pdf)
            pdf.close()
        
        # Save the merged PDF to temp file
        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        temp_output_path = temp_output.name
        temp_output.close()
        
        merged_pdf.save(temp_output_path, garbage=4, clean=True)
        merged_pdf.close()
        
        # Upload merged PDF to Supabase
        output_filename = f"merged_{int(time.time())}.pdf"
        file_path, public_url = upload_temp_file(temp_output_path, output_filename)
        
        # Clean up temporary files
        for temp_file, _ in temp_files:
            cleanup_temp_file(temp_file)
        cleanup_temp_file(temp_output_path)
        
        return jsonify({
            'success': True,
            'file_path': file_path,
            'public_url': public_url
        })
    except Exception as e:
        # Clean up temporary files
        if 'temp_files' in locals():
            for temp_file, _ in temp_files:
                cleanup_temp_file(temp_file)
        if 'temp_output_path' in locals():
            cleanup_temp_file(temp_output_path)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 