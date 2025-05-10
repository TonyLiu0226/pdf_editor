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
            
            // Store current state
            const currentZoom = canvas.getZoom();
            const currentVpt = [...canvas.viewportTransform];
            
            // Reset to original state
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            canvas.setZoom(1);
            
            // Get the data URL of the entire canvas
            const dataURL = canvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: 1,  // Ensure 1:1 pixel ratio
                enableRetinaScaling: false,
                width: canvas.getWidth(),
                height: canvas.getHeight(),
                left: 0,
                top: 0,
                right: canvas.getWidth(),
                bottom: canvas.getHeight()
            });
            
            // Restore previous state
            canvas.setViewportTransform(currentVpt);
            canvas.setZoom(currentZoom);

            const response = await fetch('/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image_data: dataURL,
                    filename: currentFile,
                    current_page: pageNum,
                    width: canvas.getWidth(),
                    height: canvas.getHeight()
                })
            });

            if (!response.ok) {
                throw new Error("Error saving page " + pageNum);
            }
        }

        // Download the final PDF
        const response = await fetch("/get_final_pdf/" + currentFile);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "edited_" + currentFile;
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