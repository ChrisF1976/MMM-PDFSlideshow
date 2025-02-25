Module.register("MMM-PDFSlideshow", {
  defaults: {
    pdfContainer: "pdfs/",       // Relative folder (with trailing slash)
    displayTime: 10000,          // Time (ms) each page (or PDF) is shown
    fullscreen: false,           // If true, module fills entire screen
    width: "800px",              // Module width when fullscreen is false
    pageflip: false,       // If true, auto-advance through each page; if false, show scalable PDF
    transitionEffect: "fade",
    transitionEffectSpeed: 1000
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    this.pdfFiles = [];
    this.currentPDF = 0;
    // For pageflip mode, track the current page within the PDF.
    this.currentPdfPage = 1;
    this.currentPdfNumPages = 0; // Will be set after loading the PDF

    // Dynamically import PDF.js (ES module) from CDN
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")
      .then((pdfjsModule) => {
        this.pdfjsLib = pdfjsModule;
        // Set worker source using the corresponding worker link
        this.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
        // Request the PDF file list from the node helper
        this.sendSocketNotification("GET_PDF_LIST", this.config.pdfContainer);
      })
      .catch((err) => {
        Log.error("Error loading PDF.js: " + err);
      });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "PDF_LIST") {
      if (payload.error) {
        Log.error("Error retrieving PDF list: " + payload.error);
        return;
      }
      this.pdfFiles = payload.pdfFiles;
      if (this.pdfFiles.length === 0) {
        Log.error("No PDF files found in the folder.");
      } else {
        // In pageflip mode, reset the page counter.
        if (this.config.pageflip) {
          this.currentPdfPage = 1;
        }
        this.scheduleUpdate();
        // Force an immediate full redraw.
        this.updateDom(0, { lockString: "pdfUpdate" });
      }
    }
  },

  scheduleUpdate: function () {
    var self = this;
    setInterval(function () {
      if (self.pdfFiles.length > 0) {
        if (self.config.pageflip) {
          // Auto-advance: if not on the last page, show next page; otherwise, next PDF.
          if (self.currentPdfNumPages && self.currentPdfPage < self.currentPdfNumPages) {
            self.currentPdfPage++;
          } else {
            self.currentPDF = (self.currentPDF + 1) % self.pdfFiles.length;
            self.currentPdfPage = 1;
          }
        } else {
          // Normal behavior: cycle through PDFs.
          self.currentPDF = (self.currentPDF + 1) % self.pdfFiles.length;
        }
        self.updateDom(0, { lockString: "pdfUpdate" });
      }
    }, this.config.displayTime);
  },

  getDom: function () {
    var wrapper = document.createElement("div");

    if (this.config.fullscreen) {
      // Fullscreen: fill the entire screen.
      wrapper.style.position = "fixed";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
    } else {
      // Non-fullscreen: use the defined width.
      wrapper.style.width = this.config.width;
      // Do not set height here; it will be set dynamically based on the first page.
    }

    // Create the container for PDF rendering.
    var pdfWrapper = document.createElement("div");
    pdfWrapper.id = "pdfContainer";
    pdfWrapper.style.width = "100%";
    // In fullscreen, use full height; in non-fullscreen, height is set when rendering.
    pdfWrapper.style.overflowY = "auto";
    wrapper.appendChild(pdfWrapper);

    if (this.pdfFiles.length === 0) {
      pdfWrapper.innerHTML = "No PDF files found.";
      return wrapper;
    }

    // Render the PDF:
    // - If pageflip is true, render only the current page.
    // - If false, render all pages—but fix container height to the first page's height.
    if (this.config.pageflip) {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF], this.currentPdfPage);
    } else {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF]);
    }
    return wrapper;
  },

  /**
   * loadPDF renders the PDF.
   * When a pageNumber is provided (and pageflip is true), only that page is rendered.
   * Otherwise (pageflip false), all pages are rendered but the container height is fixed to the first page.
   */
  loadPDF: function (container, pdfFile, pageNumber) {
    if (!this.pdfjsLib) {
      Log.error("pdfjsLib is not loaded. Please ensure PDF.js is available.");
      container.innerHTML = "PDF.js not loaded.";
      return;
    }

    // Build the full URL to the PDF file.
    var pdfPath = this.file(this.config.pdfContainer + pdfFile);
    var self = this;

    this.pdfjsLib.getDocument(pdfPath).promise.then(function (pdf) {
      // Clear container and reset scroll.
      container.innerHTML = "";
      container.scrollTop = 0;

      if (self.config.pageflip && pageNumber) {
        // Render only the specified page.
        pdf.getPage(pageNumber).then(function (page) {
          var initialViewport = page.getViewport({ scale: 1 });
          var containerWidth = container.clientWidth;
          var scale = containerWidth / initialViewport.width;
          var viewport = page.getViewport({ scale: scale });

          var canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto";

          var context = canvas.getContext("2d");
          var renderContext = {
            canvasContext: context,
            viewport: viewport
          };

          page.render(renderContext).promise.then(function () {
            container.appendChild(canvas);
            // Set container height to exactly one page's height.
            container.style.height = canvas.height + "px";
            // Store total pages for scheduling.
            self.currentPdfNumPages = pdf.numPages;
          });
        }).catch(function (error) {
          Log.error("Error rendering page " + pageNumber + ": " + error);
        });
      } else {
        // Render all pages.
        let firstPageRendered = false;
        let pagePromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          let pagePromise = pdf.getPage(i).then(function (page) {
            var initialViewport = page.getViewport({ scale: 1 });
            var containerWidth = container.clientWidth;
            var scale = containerWidth / initialViewport.width;
            var viewport = page.getViewport({ scale: scale });

            var canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.display = "block";
            canvas.style.margin = "0 auto 20px";

            if (!firstPageRendered) {
              // Fix container height to first page's height so that only one page is visible at a time.
              container.style.height = canvas.height + "px";
              firstPageRendered = true;
            }

            var context = canvas.getContext("2d");
            var renderContext = {
              canvasContext: context,
              viewport: viewport
            };

            return page.render(renderContext).promise.then(function () {
              container.appendChild(canvas);
            });
          }).catch(function (error) {
            Log.error("Error rendering page " + i + ": " + error);
          });
          pagePromises.push(pagePromise);
        }
        // Once all pages are rendered, ensure the scroll position is at the top.
        Promise.all(pagePromises).then(function () {
          container.scrollTop = 0;
        });
      }
    }).catch(function (error) {
      Log.error("Error loading PDF: " + error);
      container.innerHTML = "Error loading PDF.";
    });
  },

  getStyles: function () {
    return ["MMM-PDFSlideshow.css"];
  }
});
