# MMM-PDFSlideshow

MMM-PDFSlideshow is a MagicMirror module that displays PDF documents as a slideshow. It utilizes PDF.js to dynamically render PDFs and supports two modes:

- **Pageflip Mode:** Displays one page at a time and automatically advances to the next. Once the last page is reached, it moves to the next PDF.
- **Standard Mode:** Renders the entire PDF in a scrollable container with the height fixed to the first page, ensuring only one page is visible at a time.

![MMM-PDFSlideshow Architecture](MMM-PDFSlideshow.jpg)

## Features

- **Dynamic PDF Listing:** Fetches and displays all PDFs from a specified directory.
- **Flexible Display:** Can run in fullscreen mode or within a fixed-width container.
- **Automatic Updates:** Switches PDFs/pages based on a configurable display time.
- **Responsive Scaling:** Automatically scales PDFs to fit the display area.
- **Transition Effects:** Customizable transitions between PDFs for a smooth experience.

---

## Installation

1. **Clone the repository** into your MagicMirror `modules` folder:
   ```sh
   cd ~/MagicMirror/modules
   git clone https://github.com/ChrisF1976/MMM-PDFSlideshow.git
   ```
2. **No additional dependencies are required** as PDF.js is loaded dynamically.
3. **Add the module to your `config.js`:**
   ```js
   {
     module: "MMM-PDFSlideshow",
     position: "bottom_center", // Adjust as needed.
     config: {
       pdfContainer: "pdfs/",       // Folder containing PDF files. The "/" is necessary.
       displayTime: 10000,          // Time in milliseconds per PDF/page
       fullscreen: false,           // Enable or disable fullscreen mode. If true, set also `position` to a fulscreen region.
       width: "500px",              // Width when fullscreen is disabled
       pageflip: false,             // Automatically flip through pages
       transitionEffect: "fade",
       transitionEffectSpeed: 1000
     }
   }
   ```
4. **Place PDF files** in the specified directory (e.g., `pdfs/`).

---

## How It Works

### Frontend
- Loads PDF.js dynamically from a CDN.
- Requests the list of PDF files from the backend.
- Displays the PDFs based on the selected mode (pageflip or standard).
- Automatically switches between PDFs/pages based on the `displayTime`.

### Node Helper
- Reads the specified PDF directory and filters only valid PDF files.
- Sends the list of PDFs back to the frontend for display.
- Logs errors if the directory cannot be read or contains no PDFs.

---

## Customization

- Adjust settings like `displayTime`, `fullscreen`, `width`, `pageflip`, and `transitionEffect` to fit your needs.
- Modify `MMM-PDFSlideshow.css` for further styling.

---

## Troubleshooting

- **PDF.js Not Loaded:** Ensure you have an active internet connection.
- **No PDFs Found:** Check the configured folder path and ensure PDFs are present.
- **Rendering Issues:** Check for CSS conflicts with other modules.

---

### License
This project is open-source and available under the MIT License.

Enjoy using **MMM-PDFSlideshow** to display your PDFs on MagicMirror!
