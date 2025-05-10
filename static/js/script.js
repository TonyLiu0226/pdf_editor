let canvases = [];
let currentColor = '#ff0000';
let currentFile = null;
let totalPages = 0;
let isErasing = false;
let isDrawingEraser = false;
let lastUsedColor = currentColor;
let lastUsedBrushWidth = 2;
let currentZoom = 1;
let currentPage = 1;  // Track current page

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



// Helper functions
async function loadAllPages() {
    const container = document.querySelector('.canvas-container');
    currentPage = 1;  // Reset to first page when loading new document
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        // Create canvas wrapper with page number
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = "Page " + pageNum;
        wrapper.appendChild(pageLabel);
        
        // Create canvas element
        const canvasElement = document.createElement('canvas');
        canvasElement.id = "canvas-" + pageNum;
        wrapper.appendChild(canvasElement);
        container.appendChild(wrapper);

        // Initialize Fabric.js canvas
        const canvas = new fabric.Canvas(canvasElement, {
            isDrawingMode: true
        });
        
        // Add a border rect that matches the PDF dimensions
        const border = new fabric.Rect({
            left: 0,
            top: 0,
            width: canvas.width,
            height: canvas.height,
            fill: 'transparent',
            stroke: '#666666',  // Border color
            strokeWidth: 1,
            selectable: false,
            evented: false,
            excludeFromExport: true  // Don't include border in saved PDF
        });
        
        canvas.add(border);
        canvas.renderAll();
        
        // Move border to back and lock it
        border.moveTo(0);  // Move to bottom layer
        canvas.requestRenderAll();
        
        canvas.on('mouse:wheel', function(opt) {
            opt.e.preventDefault();
            opt.e.stopPropagation();
          
            // compute new zoom (clamped)
            let zoom = canvas.getZoom() * (opt.e.deltaY > 0 ? 0.9 : 1.1);
            zoom = Math.min(Math.max(zoom, 0.01), 20);
          
            // zoom about the CENTER of the canvas
            const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
            canvas.zoomToPoint(center, zoom);
          
            canvas.renderAll();
          });

        // Add pan functionality when zoomed
        canvas.on('mouse:down', function(opt) {
            if (opt.e.altKey) {
                this.isDragging = true;
                this.lastPosX = opt.e.clientX;
                this.lastPosY = opt.e.clientY;
            }
        });

        canvas.on('mouse:move', function(opt) {
            if (this.isDragging) {
                const e = opt.e;
                const zoom = canvas.getZoom();
                let vpt = canvas.viewportTransform;
                
                // Calculate new position
                let newX = vpt[4] + e.clientX - this.lastPosX;
                let newY = vpt[5] + e.clientY - this.lastPosY;
                
                // Limit panning to page boundaries
                const maxX = 0;
                const minX = canvas.width * (1 - zoom);
                const maxY = 0;
                const minY = canvas.height * (1 - zoom);
                
                vpt[4] = Math.min(Math.max(newX, minX), maxX);
                vpt[5] = Math.min(Math.max(newY, minY), maxY);
                
                canvas.requestRenderAll();
                this.lastPosX = e.clientX;
                this.lastPosY = e.clientY;
            }
        });

        canvas.on('mouse:up', function(opt) {
            this.isDragging = false;
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
            const response = await fetch("/get_page/" + currentFile + "/" + pageNum);
            const data = await response.json();

            if (data.success) {
                const img = new Image();
                img.onload = function() {
                    canvas.setWidth(data.width);
                    canvas.setHeight(data.height);
                    
                    // Update border dimensions to match canvas
                    border.set({
                        width: data.width,
                        height: data.height
                    });
                    
                    // Set background image
                    fabric.Image.fromURL(img.src, function(img) {
                        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                            scaleX: 1,
                            scaleY: 1,
                            originX: 'left',
                            originY: 'top',
                            crossOrigin: 'anonymous'
                        });
                    });
                };
                img.src = 'data:image/png;base64,' + data.image_data;
            }
        } catch (error) {
            console.error("Error loading page " + pageNum + ":", error);
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
        document.getElementById(tabId + "-tab").classList.add('active');
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
            alert(file.name + " is not a PDF file");
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
            a.download = "merged_" + Date.now() + ".pdf";
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

// Add page navigation functions
function setCurrentPage(pageNum) {
    if (pageNum >= 1 && pageNum <= totalPages) {
        currentPage = pageNum;
    }
}

function zoomIn() {
    if (!canvases[currentPage - 1]) return;
    const canvas = canvases[currentPage - 1];
  
    let zoom = canvas.getZoom() * 1.1;
    zoom = Math.min(zoom, 20);
  
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, zoom);
    canvas.renderAll();
  }

  function zoomOut() {
    if (!canvases[currentPage - 1]) return;
    const canvas = canvases[currentPage - 1];
  
    let zoom = canvas.getZoom() / 1.1;
    zoom = Math.max(zoom, 0.01);
  
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, zoom);
    canvas.renderAll();
  }

 // listen for object selection
canvases.forEach(canvas => {
    canvas.on('selection:created', updateTextControls);
    canvas.on('selection:updated', updateTextControls);
  });
  
function updateTextControls(e) {
    const obj = e.selected[0];
    if (obj && obj.type === 'textbox') {
      // reflect its settings in the UI
      fontFamilySelect.value = obj.fontFamily.replace(' ', '+');
      fontSizeSelect.value   = obj.fontSize;
    }
}
  
// when user changes fontFamilySelect or fontSizeSelect, apply to active textbox
fontFamilySelect.addEventListener('change', () => {
    const obj = fabric.Canvas.activeInstance?.getActiveObject();
    if (obj?.type === 'textbox') {
      loadGoogleFont(fontFamilySelect.value);
      obj.set('fontFamily', fontFamilySelect.value.replace('+',' '));
      fabric.Canvas.activeInstance.renderAll();
    }
});
  
fontSizeSelect.addEventListener('input', () => {
    const obj = fabric.Canvas.activeInstance?.getActiveObject();
    if (obj?.type === 'textbox') {
      obj.set('fontSize', parseInt(fontSizeSelect.value,10));
      fabric.Canvas.activeInstance.renderAll();
    }
});

// Update font selection handler
document.addEventListener('DOMContentLoaded', () => {
    loadGoogleFonts(); // Load all fonts initially
    
    const fontSelect = document.getElementById('fontFamily');
    const fontSizeInput = document.getElementById('fontSizeSelect');
    
    fontSelect.addEventListener('change', () => {
        const selectedFont = fontSelect.value;
        // Load the selected font if it's not a system font
        if (!SYSTEM_FONTS.includes(selectedFont)) {
            loadGoogleFont(selectedFont);
        }
        
        canvases.forEach(canvas => {
            const activeObject = canvas.getActiveObject();
            if (activeObject && activeObject.type === 'textbox') {
                activeObject.set('fontFamily', selectedFont);
                canvas.renderAll();
            }
        });
    });
});