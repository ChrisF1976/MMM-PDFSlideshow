Module.register("MMM-PDFSlideshow", {
  defaults: {
    pdfContainer: "pdfs/",       // Folder for all PDFs (local and downloaded, with trailing slash)
    pdfPath: "",                 // Specific PDF file URL or absolute path; if provided, it will be downloaded and added to the folder list.
    displayTime: 10000,          // Time (ms) each page (or PDF) is shown
    fullscreen: false,           // If true, module fills the entire screen
    width: "500px",              // Module width when fullscreen is false
    pageflip: true,              // If true, auto-advance through each page; if false, show scalable PDF
    transitionEffect: "fade",
    transitionEffectSpeed: 1000,
    pageflipTimeout: 10 * 1000,  // Manual control timeout (10 seconds)
    buttonsVisible: true         // Show control buttons if true
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    this.pdfFiles = [];
    this.currentPDF = 0;
    this.currentPdfPage = 1;
    this.currentPdfNumPages = 0; // Will be set after loading the PDF
    this.fallbackAttempted = false;
    this.manualControl = false;   // Indicates if manual control is active
    this.manualControlTimer = null;
    this.jumpToDownloaded = false; // Flag to jump directly to a just downloaded PDF

    // Always request the list of PDFs in the folder.
    this.sendSocketNotification("GET_PDF_LIST", this.config.pdfContainer);

    // Dynamically import PDF.js (ES module) from CDN.
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")
      .then((pdfjsModule) => {
        this.pdfjsLib = pdfjsModule;
        // Set worker source using the corresponding worker link.
        this.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

        // If a specific pdfPath is provided and it is a URL, download that PDF.
        if (this.config.pdfPath && this.config.pdfPath !== "") {
          if (
            this.config.pdfPath.startsWith("http://") ||
            this.config.pdfPath.startsWith("https://")
          ) {
            // Set flag so we jump to this downloaded PDF once downloaded.
            this.jumpToDownloaded = true;
            this.sendSocketNotification("DOWNLOAD_PDF", {
              pdfURL: this.config.pdfPath,
              pdfFolder: this.config.pdfContainer
            });
          }
        }
      })
      .catch((err) => {
        Log.error("Error loading PDF.js: " + err);
      });
  },

  // Listen to notifications for manual control and external PDF URL requests
  notificationReceived: function (notification, payload, sender) {
    let handled = false;
    if (notification === "PREVIOUS_PDF") {
      this.switchPDF(-1);
      handled = true;
    } else if (notification === "NEXT_PDF") {
      this.switchPDF(1);
      handled = true;
    } else if (notification === "NEXT_PAGE") {
      this.goToPage("next");
      handled = true;
    } else if (notification === "PREVIOUS_PAGE") {
      this.goToPreviousPage();
      handled = true;
    } else if (notification === "GET_PDF_URL") {
      // Download the PDF from the given URL and add it to the folder.
      if (typeof payload === "string" && (payload.startsWith("http://") || payload.startsWith("https://"))) {
        this.jumpToDownloaded = true;
        this.sendSocketNotification("DOWNLOAD_PDF", {
          pdfURL: payload,
          pdfFolder: this.config.pdfContainer
        });
        handled = true;
      } else {
        Log.error("GET_PDF_URL payload is invalid: " + payload);
      }
    }
    if (handled) {
      this.activateManualControl();
      this.updateDom(0, { lockString: "pdfUpdate" });
    }
  },

  // Activate manual control mode for pageflipTimeout
  activateManualControl: function () {
    this.manualControl = true;
    if (this.manualControlTimer) {
      clearTimeout(this.manualControlTimer);
    }
    this.manualControlTimer = setTimeout(() => {
      this.manualControl = false;
    }, this.config.pageflipTimeout);
  },

  // Helper to switch PDFs
  switchPDF: function (direction) {
    if (this.pdfFiles.length === 0) {
      return;
    }
    this.currentPDF = (this.currentPDF + direction + this.pdfFiles.length) % this.pdfFiles.length;
    // Reset page for new PDF
    this.currentPdfPage = 1;
  },

  // Helper to change pages within the current PDF
  goToPage: function (action) {
    if (!this.config.pageflip) {
      return;
    }
    if (action === "next") {
      if (this.currentPdfPage < this.currentPdfNumPages) {
        this.currentPdfPage++;
      }
    }
  },

  // Helper for going to the previous page
  goToPreviousPage: function () {
    if (!this.config.pageflip) {
      return;
    }
    if (this.currentPdfPage > 1) {
      this.currentPdfPage--;
    }
  },

  // Update automatic slideshow only if not in manual control mode
  scheduleUpdate: function () {
    var self = this;
    setInterval(function () {
      if (self.pdfFiles.length > 0 && !self.manualControl) {
        if (self.config.pageflip) {
          if (self.currentPdfNumPages && self.currentPdfPage < self.currentPdfNumPages) {
            self.currentPdfPage++;
          } else {
            self.currentPDF = (self.currentPDF + 1) % self.pdfFiles.length;
            self.currentPdfPage = 1;
          }
        } else {
          self.currentPDF = (self.currentPDF + 1) % self.pdfFiles.length;
        }
        self.updateDom(0, { lockString: "pdfUpdate" });
      }
    }, this.config.displayTime);
  },

  getDom: function () {
    var wrapper = document.createElement("div");
    if (this.config.fullscreen) {
      wrapper.style.position = "fixed";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
    } else {
      wrapper.style.width = this.config.width;
    }

    var pdfWrapper = document.createElement("div");
    pdfWrapper.id = "pdfContainer";
    pdfWrapper.style.width = "100%";
    pdfWrapper.style.overflowY = "auto";
    wrapper.appendChild(pdfWrapper);

    if (this.pdfFiles.length === 0) {
      pdfWrapper.innerHTML = "No PDF files found.";
      return wrapper;
    }

    // Render the current PDF (either a specific page or the full document)
    if (this.config.pageflip) {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF], this.currentPdfPage);
    } else {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF]);
    }

    // Only create control buttons if buttonsVisible is true.
    if (this.config.buttonsVisible) {
      var controls = document.createElement("div");
      controls.className = "pdf-controls";
      controls.style.textAlign = "center";
      controls.style.marginTop = "10px";

      // Button: Previous PDF
      var btnPrevPDF = document.createElement("button");
      btnPrevPDF.innerHTML = '<i class="fa fa-step-backward"></i>';
      btnPrevPDF.addEventListener("click", () => {
        this.switchPDF(-1);
        this.activateManualControl();
        this.updateDom(0, { lockString: "pdfUpdate" });
      });
      controls.appendChild(btnPrevPDF);

      // Button: Previous Page
      var btnPrevPage = document.createElement("button");
      btnPrevPage.innerHTML = '<i class="fa fa-backward"></i>';
      btnPrevPage.addEventListener("click", () => {
        this.goToPreviousPage();
        this.activateManualControl();
        this.updateDom(0, { lockString: "pdfUpdate" });
      });
      controls.appendChild(btnPrevPage);

      // Button: Next Page
      var btnNextPage = document.createElement("button");
      btnNextPage.innerHTML = '<i class="fa fa-forward"></i>';
      btnNextPage.addEventListener("click", () => {
        this.goToPage("next");
        this.activateManualControl();
        this.updateDom(0, { lockString: "pdfUpdate" });
      });
      controls.appendChild(btnNextPage);

      // Button: Next PDF
      var btnNextPDF = document.createElement("button");
      btnNextPDF.innerHTML = '<i class="fa fa-step-forward"></i>';
      btnNextPDF.addEventListener("click", () => {
        this.switchPDF(1);
        this.activateManualControl();
        this.updateDom(0, { lockString: "pdfUpdate" });
      });
      controls.appendChild(btnNextPDF);

      wrapper.appendChild(controls);
    }
    return wrapper;
  },

  /**
   * loadPDF renders the PDF.
   * When a pageNumber is provided (in pageflip mode), only that page is rendered.
   * Otherwise, all pages are rendered with the container height fixed to the first page.
   */
  loadPDF: function (container, pdfFile, pageNumber) {
    if (!this.pdfjsLib) {
      Log.error("pdfjsLib is not loaded. Please ensure PDF.js is available.");
      container.innerHTML = "PDF.js not loaded.";
      return;
    }

    var pdfPath;
    // If the pdfFile starts with "http://" or "https://" or an absolute path,
    // use it directly. Otherwise, assume it’s in the pdfContainer folder.
    if (
      pdfFile.startsWith("http://") ||
      pdfFile.startsWith("https://") ||
      pdfFile.startsWith("/")
    ) {
      pdfPath = this.file(pdfFile);
    } else {
      pdfPath = this.file(this.config.pdfContainer + pdfFile);
    }

    var self = this;
    this.pdfjsLib.getDocument(pdfPath).promise.then(function (pdf) {
      container.innerHTML = "";
      container.scrollTop = 0;

      if (self.config.pageflip && pageNumber) {
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
          var renderContext = { canvasContext: context, viewport: viewport };

          page.render(renderContext).promise.then(function () {
            container.appendChild(canvas);
            container.style.height = canvas.height + "px";
            self.currentPdfNumPages = pdf.numPages;
          });
        }).catch(function (error) {
          Log.error("Error rendering page " + pageNumber + ": " + error);
        });
      } else {
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
              container.style.height = canvas.height + "px";
              firstPageRendered = true;
            }
            var context = canvas.getContext("2d");
            var renderContext = { canvasContext: context, viewport: viewport };
            return page.render(renderContext).promise.then(function () {
              container.appendChild(canvas);
            });
          }).catch(function (error) {
            Log.error("Error rendering page " + i + ": " + error);
          });
          pagePromises.push(pagePromise);
        }
        Promise.all(pagePromises).then(function () {
          container.scrollTop = 0;
        });
      }
    }).catch(function (error) {
      Log.error("Error loading PDF: " + error);
      container.innerHTML = "Error loading PDF.";
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "PDF_LIST") {
      if (payload.error) {
        Log.error("Error retrieving PDF list: " + payload.error);
        return;
      }
      // Set the list of PDFs from the folder.
      this.pdfFiles = payload.pdfFiles;
      if (this.pdfFiles.length === 0) {
        Log.error("No PDF files found in the folder.");
      } else {
        if (this.config.pageflip) {
          this.currentPdfPage = 1;
        }
        // Start the auto slideshow.
        this.scheduleUpdate();
        this.updateDom(0, { lockString: "pdfUpdate" });
      }
    } else if (notification === "PDF_DOWNLOADED") {
      Log.info("PDF_DOWNLOADED received with payload: " + JSON.stringify(payload));
      if (payload && payload.pdfFile) {
        // Add the downloaded PDF to the list if it isn’t already there.
        if (this.pdfFiles.indexOf(payload.pdfFile) === -1) {
          this.pdfFiles.push(payload.pdfFile);
        }
        // If the jumpToDownloaded flag is set, set the current PDF index to this file.
        if (this.jumpToDownloaded) {
          let idx = this.pdfFiles.indexOf(payload.pdfFile);
          if (idx !== -1) {
            this.currentPDF = idx;
            this.currentPdfPage = 1;
          }
          this.jumpToDownloaded = false;
        }
      } else {
        Log.error("Invalid payload for PDF_DOWNLOADED: " + JSON.stringify(payload));
      }
      this.scheduleUpdate();
      this.updateDom(0, { lockString: "pdfUpdate" });
    } else if (notification === "PDF_DOWNLOAD_ERROR") {
      Log.error("Download failed: " + payload.error);
      if (!this.fallbackAttempted && this.config.pdfContainer) {
        this.fallbackAttempted = true;
        Log.info("Falling back to local PDFs from container: " + this.config.pdfContainer);
        this.sendSocketNotification("GET_PDF_LIST", this.config.pdfContainer);
        this.updateDom(0, { lockString: "pdfUpdate" });
      }
    }
  },

  getStyles: function () {
    return ["MMM-PDFSlideshow.css"];
  }
});
