// Define fonts that are not from Google Fonts
const SYSTEM_FONTS = ['Arial', 'Times New Roman'];

function loadGoogleFont(fontName) {
    // Skip if it's a system font
    if (SYSTEM_FONTS.includes(fontName)) return;
    
    // Format font name for URL
    const formattedFont = fontName.replace(/\s+/g, '+');
    
    // Create and append link element
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${formattedFont}&display=swap`;
    document.head.appendChild(link);
}

// Function to load Google Fonts
function loadGoogleFonts() {
    // Get all font options from the select element
    const fontSelect = document.getElementById('fontFamily');
    const fonts = Array.from(fontSelect.options)
        .map(option => option.value)
        .filter(font => !SYSTEM_FONTS.includes(font)) // Filter out system fonts
        .map(font => font.replace(/\s+/g, '+')); // Replace spaces with + for URL

    // Create link element for Google Fonts
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fonts.join('&family=')}&display=swap`;
    document.head.appendChild(link);
} 