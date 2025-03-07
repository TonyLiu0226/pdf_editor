let canvases = [];
let currentColor = '#ff0000';
let currentFile = null;
let totalPages = 0;
let isErasing = false;
let isDrawingEraser = false;
let lastUsedColor = currentColor;
let lastUsedBrushWidth = 2;

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

// Tool selection
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const drawEraserBtn = document.getElementById('drawEraserBtn');

function setActiveButton(activeBtn) {
    [drawBtn, eraseBtn, drawEraserBtn].forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}

// Drawing mode
drawBtn.addEventListener('click', () => {
    if (isErasing || isDrawingEraser) {
        isErasing = false;
        isDrawingEraser = false;
        setActiveButton(drawBtn);
        
        // Restore last used color and brush size
        currentColor = lastUsedColor;
        canvases.forEach(canvas => {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush.color = currentColor;
            canvas.freeDrawingBrush.width = lastUsedBrushWidth;
            
            // Remove any existing event listeners
            canvas.off('mouse:down');
            canvas.off('mouse:move');
            canvas.off('mouse:up');
        });
        pickr.setColor(currentColor);
        brushSize.value = lastUsedBrushWidth;
        brushSizeValue.textContent = lastUsedBrushWidth + 'px';
    }
});

// White eraser mode (original eraser)
eraseBtn.addEventListener('click', () => {
    if (!isErasing) {
        isErasing = true;
        isDrawingEraser = false;
        setActiveButton(eraseBtn);
        
        // Store current color and brush size
        lastUsedColor = currentColor;
        lastUsedBrushWidth = parseInt(brushSize.value);
        
        // Set eraser properties
        currentColor = '#ffffff';
        canvases.forEach(canvas => {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush.color = currentColor;
            canvas.freeDrawingBrush.width = parseInt(brushSize.value);
            
            // Remove any existing event listeners
            canvas.off('mouse:down');
            canvas.off('mouse:move');
            canvas.off('mouse:up');
        });
        pickr.setColor(currentColor);
    }
});

// Drawing eraser mode (erases only drawn content)
drawEraserBtn.addEventListener('click', () => {
    if (!isDrawingEraser) {
        isDrawingEraser = true;
        isErasing = false;
        setActiveButton(drawEraserBtn);
        
        canvases.forEach(canvas => {
            // Disable drawing mode
            canvas.isDrawingMode = false;
            canvas.selection = false;
            canvas.defaultCursor = 'crosshair';
            
            // Remove existing event listeners
            canvas.off('mouse:down');
            canvas.off('mouse:move');
            canvas.off('mouse:up');
            
            let isErasing = false;
            let eraserPath = [];
            
            canvas.on('mouse:down', (options) => {
                isErasing = true;
                const pointer = canvas.getPointer(options.e);
                eraserPath = [{x: pointer.x, y: pointer.y}];
            });
            
            canvas.on('mouse:move', (options) => {
                if (!isErasing) return;
                
                const pointer = canvas.getPointer(options.e);
                eraserPath.push({x: pointer.x, y: pointer.y});
                
                // Get all drawn paths
                const paths = canvas.getObjects().filter(obj => obj instanceof fabric.Path);
                
                paths.forEach(path => {
                    // Convert the path's points to absolute coordinates
                    const points = path.path.map(point => {
                        if (point[0] === 'M' || point[0] === 'L') {
                            return {
                                x: path.left + (point[1] * path.scaleX),
                                y: path.top + (point[2] * path.scaleY)
                            };
                        }
                        return null;
                    }).filter(point => point !== null);
                    
                    // Check if any point in the eraser path intersects with the drawn path
                    const eraserRadius = parseInt(brushSize.value);
                    const lastEraserPoint = eraserPath[eraserPath.length - 1];
                    
                    for (let point of points) {
                        const dx = point.x - lastEraserPoint.x;
                        const dy = point.y - lastEraserPoint.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance <= eraserRadius) {
                            canvas.remove(path);
                            break;
                        }
                    }
                });
                
                canvas.renderAll();
            });
            
            canvas.on('mouse:up', () => {
                isErasing = false;
                eraserPath = [];
            });
        });
    }
});

// Color picker event
pickr.on('change', (color) => {
    if (!isErasing && !isDrawingEraser) {
        currentColor = color.toHEXA().toString();
        lastUsedColor = currentColor;
        canvases.forEach(canvas => {
            canvas.freeDrawingBrush.color = currentColor;
        });
    }
});

// Brush size slider
const brushSize = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
brushSize.addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    if (!isErasing && !isDrawingEraser) {
        lastUsedBrushWidth = size;
    }
    canvases.forEach(canvas => {
        if (canvas.isDrawingMode) {
            canvas.freeDrawingBrush.width = size;
        }
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
            currentFile = data.file_path;
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
        
        // Set initial brush properties based on current mode
        if (isErasing) {
            canvas.freeDrawingBrush.color = '#ffffff';
            canvas.freeDrawingBrush.width = parseInt(brushSize.value);
        } else if (isDrawingEraser) {
            canvas.isDrawingMode = false;
            canvas.selection = false;
            canvas.defaultCursor = 'crosshair';
        } else {
            canvas.freeDrawingBrush.color = currentColor;
            canvas.freeDrawingBrush.width = parseInt(brushSize.value);
        }
        
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

// Tab switching
const tabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// PDF Merge functionality
const mergePdfFiles = document.getElementById('mergePdfFiles');
const fileList = document.getElementById('fileList');
const mergeBtn = document.getElementById('mergeBtn');
let selectedFiles = [];

mergePdfFiles.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    // Add new files to the list
    files.forEach(file => {
        if (file.type !== 'application/pdf') {
            alert(`${file.name} is not a PDF file`);
            return;
        }
        
        if (!selectedFiles.some(f => f.name === file.name)) {
            selectedFiles.push(file);
            
            // Create file item element
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            const fileName = document.createElement('span');
            fileName.className = 'file-name';
            fileName.textContent = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file';
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.name !== file.name);
                fileItem.remove();
                updateMergeButton();
            };
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(removeBtn);
            fileList.appendChild(fileItem);
        }
    });
    
    // Reset file input
    e.target.value = '';
    updateMergeButton();
});

function updateMergeButton() {
    mergeBtn.disabled = selectedFiles.length < 2;
}

mergeBtn.addEventListener('click', async () => {
    if (selectedFiles.length < 2) return;
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files[]', file);
    });
    
    try {
        const response = await fetch('/merge', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            // Download the merged PDF
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `merged_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            // Clear the file list
            selectedFiles = [];
            fileList.innerHTML = '';
            updateMergeButton();
        } else {
            const data = await response.json();
            alert('Error merging PDFs: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error merging PDFs');
    }
});