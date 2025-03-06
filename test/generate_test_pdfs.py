from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from faker import Faker
import os
import random

# Initialize Faker
fake = Faker()

# Create test_pdfs directory if it doesn't exist
output_dir = 'test_pdfs'
os.makedirs(output_dir, exist_ok=True)

def generate_random_content():
    """Generate a page worth of random content"""
    content = []
    # Add a random number of paragraphs (3-6)
    for _ in range(random.randint(3, 6)):
        content.append(fake.paragraph(nb_sentences=random.randint(4, 8)))
    return '\n\n'.join(content)

def create_pdf(file_number):
    """Create a single PDF with 100 pages of random content"""
    filename = os.path.join(output_dir, f'test_pdf_{file_number:03d}.pdf')
    
    # Create PDF
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Generate 100 pages
    for page in range(100):
        # Add page number
        c.setFont("Helvetica", 12)
        c.drawString(width - 80, 30, f"Page {page + 1}")
        
        # Add file identifier at top
        c.drawString(30, height - 40, f"Test PDF {file_number:03d}")
        
        # Add random content
        content = generate_random_content()
        text_object = c.beginText(30, height - 60)
        text_object.setFont("Helvetica", 12)
        
        # Split content into lines and add to text object
        for line in content.split('\n'):
            # Wrap text at 80 characters
            words = line.split()
            current_line = []
            current_length = 0
            
            for word in words:
                if current_length + len(word) + 1 <= 80:
                    current_line.append(word)
                    current_length += len(word) + 1
                else:
                    text_object.textLine(' '.join(current_line))
                    current_line = [word]
                    current_length = len(word)
            
            if current_line:
                text_object.textLine(' '.join(current_line))
            
            text_object.textLine('')
        
        c.drawText(text_object)
        c.showPage()
    
    # Save the PDF
    c.save()
    print(f"Generated {filename}")

def main():
    print("Starting PDF generation...")
    for i in range(100):
        create_pdf(i + 1)
    print("\nPDF generation complete!")
    print(f"Generated 100 PDFs in the '{output_dir}' directory")

if __name__ == '__main__':
    main() 