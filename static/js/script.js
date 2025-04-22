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

function handleTextModeClick(opt) {
    if (!isTextMode) return;
    const canvas = opt.target?.canvas || this;
    const pointer = canvas.getPointer(opt.e);
    if (!opt.target) {
        openTextInputDialog(canvas, pointer.x, pointer.y);
    }
}

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

// Helper to clear any eraser listeners
function clearEraserListeners(canvas) {
    canvas.off('mouse:down');
    canvas.off('mouse:move');
}
  
  // Drawing mode
  drawBtn.addEventListener('click', () => {
    if (isTextMode) setTextMode(false);
    if (isErasing || isDrawingEraser) {
      isErasing = false;
      isDrawingEraser = false;
      setActiveButton(drawBtn);
  
      // Restore last used color and brush size
      currentColor = lastUsedColor;
      canvases.forEach(canvas => {
        canvas.isDrawingMode = true;
        clearEraserListeners(canvas);
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = lastUsedBrushWidth;
      });
      pickr.setColor(currentColor);
      brushSize.value = lastUsedBrushWidth;
      brushSizeValue.textContent = lastUsedBrushWidth + 'px';
    }
});
  
  // White eraser mode (just paints white)
  eraseBtn.addEventListener('click', () => {
    if (isTextMode) setTextMode(false);
    if (!isErasing || isDrawingEraser) {
      isErasing = true;
      isDrawingEraser = false;
      setActiveButton(eraseBtn);
  
      lastUsedColor = currentColor;
      lastUsedBrushWidth = parseInt(brushSize.value);
      currentColor = '#ffffff';
  
      canvases.forEach(canvas => {
        canvas.isDrawingMode = true;
        clearEraserListeners(canvas);
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = lastUsedBrushWidth;
      });
      pickr.setColor(currentColor);
    }
});
  
  // Drawing eraser mode (truly erases only drawn paths)
  drawEraserBtn.addEventListener('click', () => {
    if (isTextMode) setTextMode(false);
    if (!isErasing || !isDrawingEraser) {
      isErasing = true;
      isDrawingEraser = true;
      setActiveButton(drawEraserBtn);
  
      // Store current tool settings
      lastUsedColor = currentColor;
      lastUsedBrushWidth = parseInt(brushSize.value);
  
      canvases.forEach(canvas => {
        // turn off brush mode
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        clearEraserListeners(canvas);
  
        // on mousedown (or move, if you want click‑and‑drag)
        canvas.on('mouse:down', function(opt) {
          const target = opt.target;
          // only remove free‑drawn paths (type 'path')
          if (target && target.type === 'path') {
            canvas.remove(target);
          }
        });
        // Optional: support drag‑to‑erase
        canvas.on('mouse:move', function(opt) {
          if (opt.e.buttons !== 1) return; // only while mouse is down
          const target = canvas.findTarget(opt.e);
          if (target && target.type === 'path') {
            canvas.remove(target);
          }
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

        // After initializing the canvas:
        canvas.on('mouse:down', function(opt) {
            if (!isTextMode) return;
            const pointer = canvas.getPointer(opt.e);
            // Only add new text if not clicking on an existing object
            if (!opt.target) {
                openTextInputDialog(canvas, pointer.x, pointer.y);
            }
        });
        // Ensure text objects are selectable for resizing/moving
        canvas.on('object:added', function(opt) {
            if (opt.target && opt.target.type === 'textbox') {
                opt.target.selectable = true;
                opt.target.evented = true;
            }
        });
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

// --- Text Insertion Functionality ---

// Add a button for text tool in your HTML with id 'textBtn'
const textBtn = document.getElementById('textBtn');

// Track text tool state
let isTextMode = false;

function setTextMode(active) {
    isTextMode = active;
    if (active) {
        setActiveButton(textBtn);
        canvases.forEach(canvas => {
            canvas.isDrawingMode = false;
            canvas.defaultCursor = 'text';
            canvas.selection = true;

            // Remove previous listener to avoid duplicates
            canvas.off('mouse:down', handleTextModeClick);

            // Add handler again
            canvas.on('mouse:down', handleTextModeClick);

            canvas.forEachObject(obj => {
                obj.selectable = obj.type === 'textbox';
                obj.evented = obj.type === 'textbox';
            });
        });
    } else {
        textBtn.classList.remove('active');
        canvases.forEach(canvas => {
            canvas.off('mouse:down', handleTextModeClick); // Clean up listener

            canvas.forEachObject(obj => {
                obj.selectable = obj.type === 'textbox';
                obj.evented = obj.type === 'textbox';
            });
            canvas.isDrawingMode = !isErasing && !isDrawingEraser;
            canvas.defaultCursor = 'default';
            canvas.selection = false;
        });
    }
}

// Text tool button event
textBtn.addEventListener('click', () => {
    setTextMode(!isTextMode);
});

// Add text on canvas click when in text mode
canvases.forEach(canvas => {
    canvas.on('mouse:down', function(opt) {
        if (!isTextMode) return;
        const pointer = canvas.getPointer(opt.e);
        openTextInputDialog(canvas, pointer.x, pointer.y);
    });
});

// Helper to open a prompt for text input and add to canvas
function openTextInputDialog(canvas, x, y) {
    const text = prompt('Enter text:');
    if (text && text.trim() !== '') {
        const textbox = new fabric.Textbox(text, {
            left: x,
            top: y,
            fontSize: 32,
            fill: currentColor,
            editable: true
        });
        canvas.add(textbox);
        canvas.setActiveObject(textbox);
        canvas.renderAll();
    }
}

