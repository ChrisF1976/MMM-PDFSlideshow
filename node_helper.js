var NodeHelper = require("node_helper");
var fs = require("fs");
var path = require("path");

module.exports = NodeHelper.create({
  start: function () {
    console.log("MMM-PDFSlideshow node_helper started!");
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "GET_PDF_LIST") {
      // Build the absolute path by joining __dirname with the relative folder name.
      let pdfFolder = path.join(__dirname, payload);
      console.log("Reading PDF folder at:", pdfFolder);
      fs.readdir(pdfFolder, (err, files) => {
        if (err) {
          this.sendSocketNotification("PDF_LIST", { error: err.message });
          return;
        }
        // Filter only PDF files (case-insensitive)
        let pdfFiles = files.filter(file => path.extname(file).toLowerCase() === ".pdf");
        this.sendSocketNotification("PDF_LIST", { pdfFiles: pdfFiles });
      });
    }
  }
});
