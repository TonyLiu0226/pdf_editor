let canvases = [];
let currentColor = '#ff0000';
let currentFile = null;
let totalPages = 0;

// Initialize color picker
const pickr = Pickr.create({
    el: '#color-picker',
    theme: 'classic',
    default: currentColor,
    components: {
        preview: true,
        opacity: true,
        hue: true,
        interaction: {
            hex: true,
            rgba: true,
            hsla: true,
            input: true,
            clear: true,
            save: true
        }
    }
});

// Color picker event
pickr.on('change', (color) => {
    currentColor = color.toHEXA().toString();
    canvases.forEach(canvas => {
        canvas.freeDrawingBrush.color = currentColor;
    });
});

// Brush size slider
const brushSize = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
brushSize.addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    canvases.forEach(canvas => {
        canvas.freeDrawingBrush.width = size;
    });
    brushSizeValue.textContent = size + 'px';
});

// File upload handling
document.getElementById('pdfFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            currentFile = data.filename;
            totalPages = data.total_pages;
            // Clear existing canvases
            document.querySelector('.canvas-container').innerHTML = '';
            canvases = [];
            // Load all pages
            await loadAllPages();
            enableControls();
        } else {
            alert('Error uploading file: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error uploading file');
    }
});

// Save PDF
document.getElementById('saveBtn').addEventListener('click', async () => {
    if (canvases.length === 0) return;

    try {
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const canvas = canvases[pageNum - 1];
            const dataURL = canvas.toDataURL({
                format: 'png',
                quality: 1
            });

            const response = await fetch('/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image_data: dataURL,
                    filename: currentFile,
                    current_page: pageNum
                })
            });

            if (!response.ok) {
                throw new Error(`Error saving page ${pageNum}`);
            }
        }

        // Download the final PDF
        const response = await fetch(`/get_final_pdf/${currentFile}`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `edited_${currentFile}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error saving PDF: ' + error.message);
    }
});

// Helper functions
async function loadAllPages() {
    const container = document.querySelector('.canvas-container');
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        // Create canvas wrapper with page number
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = `Page ${pageNum}`;
        wrapper.appendChild(pageLabel);
        
        // Create canvas element
        const canvasElement = document.createElement('canvas');
        canvasElement.id = `canvas-${pageNum}`;
        wrapper.appendChild(canvasElement);
        container.appendChild(wrapper);

        // Initialize Fabric.js canvas
        const canvas = new fabric.Canvas(canvasElement, {
            isDrawingMode: true,
            width: 1500,
            height: 1500
        });
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = parseInt(brushSize.value);
        canvases.push(canvas);

        try {
            const response = await fetch(`/get_page/${currentFile}/${pageNum}`);
            const data = await response.json();

            if (data.success) {
                const img = new Image();
                img.onload = function() {
                    canvas.setHeight(data.height);
                    canvas.setWidth(data.width);
                    canvas.setBackgroundImage(img.src, canvas.renderAll.bind(canvas), {
                        scaleX: canvas.width / img.width,
                        scaleY: canvas.height / img.height,
                        crossOrigin: 'anonymous',
                        quality: 1
                    });
                };
                img.src = 'data:image/png;base64,' + data.image_data;
            }
        } catch (error) {
            console.error(`Error loading page ${pageNum}:`, error);
        }
    }
}

function enableControls() {
    document.getElementById('saveBtn').disabled = false;
}

// Remove navigation buttons since we're showing all pages
document.getElementById('prevPage').remove();
document.getElementById('nextPage').remove();
document.getElementById('pageInfo').remove(); 