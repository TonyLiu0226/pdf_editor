import os
import io
import tempfile
from datetime import datetime
from typing import Tuple
from supabase import create_client, Client
import dotenv
import shutil

dotenv.load_dotenv()

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url=url, supabase_key=key)

def upload_file_object(file_object, original_filename: str) -> Tuple[str, str]:
    """Upload a file object to Supabase storage"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_path = f"uploaded/{original_filename}_{timestamp}.pdf"
    temp_file = None
    
    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', mode='wb')
        
        # If it's a Flask FileStorage object
        if hasattr(file_object, 'save'):
            file_object.save(temp_file.name)
        # If it's already a file path
        elif isinstance(file_object, str) and os.path.exists(file_object):
            shutil.copy2(file_object, temp_file.name)
        # If it's a file-like object
        else:
            content = file_object.read()
            if isinstance(content, str):
                content = content.encode('utf-8')
            temp_file.write(content)
        
        temp_file.close()
        
        # Verify the file is a valid PDF
        if not is_valid_pdf(temp_file.name):
            raise ValueError("Invalid or corrupted PDF file")
        
        # Upload the file
        with open(temp_file.name, 'rb') as f:
            supabase.storage.from_("pdfs").upload(
                path=file_path,
                file=f,
                file_options={"content-type": "application/pdf"}
            )
        
        # Get public URL
        public_url = supabase.storage.from_("pdfs").get_public_url(file_path)
        return file_path, public_url
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise
    finally:
        if temp_file and os.path.exists(temp_file.name):
            cleanup_temp_file(temp_file.name)

def is_valid_pdf(file_path: str) -> bool:
    """Check if the file is a valid PDF"""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(4)
            return header == b'%PDF'
    except:
        return False

def download_to_temp(file_path: str) -> str:
    """Download a file from Supabase storage to a temporary file"""
    temp_file = None
    try:
        # Download file content
        file_data = supabase.storage.from_("pdfs").download(file_path)
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', mode='wb')
        if isinstance(file_data, bytes):
            temp_file.write(file_data)
        else:
            shutil.copyfileobj(file_data, temp_file)
        temp_file.close()
        
        # Verify the downloaded file
        if not is_valid_pdf(temp_file.name):
            raise ValueError("Downloaded file is not a valid PDF")
            
        return temp_file.name
        
    except Exception as e:
        print(f"Download error: {str(e)}")
        if temp_file and os.path.exists(temp_file.name):
            cleanup_temp_file(temp_file.name)
        raise

def upload_temp_file(temp_file_path: str, original_filename: str) -> Tuple[str, str]:
    """Upload a temporary file to Supabase storage"""
    try:
        if not is_valid_pdf(temp_file_path):
            raise ValueError("Invalid or corrupted PDF file")
            
        # Open and upload the temporary file
        with open(temp_file_path, 'rb') as f:
            return upload_file_object(f, original_filename)
    except Exception as e:
        print(f"Upload temp file error: {str(e)}")
        raise

def delete_file(file_path: str) -> None:
    """Delete a file from Supabase storage"""
    try:
        supabase.storage.from_("pdfs").remove([file_path])
    except Exception as e:
        print(f"Delete error: {str(e)}")
        raise

def cleanup_temp_file(file_path: str) -> None:
    """Clean up a temporary file"""
    if file_path and os.path.exists(file_path):
        try:
            os.unlink(file_path)
        except Exception as e:
            print(f"Cleanup error: {str(e)}")   