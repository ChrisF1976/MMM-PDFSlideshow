Module.register("MMM-PDFSlideshow", {
  defaults: {
    pdfContainer: "pdfs/",
    displayTime: 10000,
    fullscreen: false,
    width: "500px",
    pageflip: false,
    transitionEffect: "fade",
    transitionEffectSpeed: 1000
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    this.pdfFiles = [];
    this.currentPDF = 0;

    this.currentPdfPage = 1;
    this.currentPdfNumPages = 0; // Will be set after loading the PDF

    // Dynamically import PDF.js (ES module) from CDN
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")
      .then((pdfjsModule) => {
        this.pdfjsLib = pdfjsModule;

        this.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

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
        if (this.config.pageflip) {
          this.currentPdfPage = 1;
        }
        this.scheduleUpdate();
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

    if (this.config.pageflip) {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF], this.currentPdfPage);
    } else {
      this.loadPDF(pdfWrapper, this.pdfFiles[this.currentPDF]);
    }
    return wrapper;
  },

  loadPDF: function (container, pdfFile, pageNumber) {
    if (!this.pdfjsLib) {
      Log.error("pdfjsLib is not loaded. Please ensure PDF.js is available.");
      container.innerHTML = "PDF.js not loaded.";
      return;
    }


    var pdfPath = this.file(this.config.pdfContainer + pdfFile);
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
          var renderContext = {
            canvasContext: context,
            viewport: viewport
          };

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
