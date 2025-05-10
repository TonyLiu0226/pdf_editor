// Update the handleTextModeClick function to ensure font is loaded
function handleTextModeClick(opt) {
    if (!isTextMode) return;
    const canvas = opt.target?.canvas || this;
    const pointer = canvas.getPointer(opt.e);
    if (!opt.target) {
      const text = prompt('Enter text:');
      if (!text) return;
      const selectedFont = document.getElementById('fontFamily').value;
      const size = parseInt(document.getElementById('fontSizeSelect').value,10);
      loadGoogleFont(selectedFont);
      const textbox = new fabric.Textbox(text, {
        left: pointer.x,
        top:  pointer.y,
        fontFamily: selectedFont.replace('+',' '),
        fontSize:   size,
        fill:       currentColor,
        editable:   true
      });
      canvas.add(textbox).setActiveObject(textbox);
      canvas.renderAll();
    }
  }

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
/* This block is redundant as handleTextModeClick already covers this.
canvases.forEach(canvas => {
    canvas.on('mouse:down', function(opt) {
        if (!isTextMode) return;
        const pointer = canvas.getPointer(opt.e);
        openTextInputDialog(canvas, pointer.x, pointer.y);
    });
});
*/

// Helper to open a prompt for text input and add to canvas
const fontFamilySelect = document.getElementById('fontFamily');
const fontSizeSelect   = document.getElementById('fontSizeSelect');

function openTextInputDialog(canvas, x, y) {
  const text = prompt('Enter text:');
  if (!text || !text.trim()) return;

  const fontFamily = fontFamilySelect.value;
  const fontSize   = parseInt(fontSizeSelect.value, 10);

  // load the font so Fabric can use it
  loadGoogleFont(fontFamily);

  const textbox = new fabric.Textbox(text, {
    left: x,
    top: y,
    fontFamily: fontFamily.replace('+', ' '), // Fabric wants space
    fontSize: fontSize,
    fill: currentColor,
    editable: true
  });
  canvas.add(textbox).setActiveObject(textbox);
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