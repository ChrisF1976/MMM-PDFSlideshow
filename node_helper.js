var NodeHelper = require("node_helper");
var fs = require("fs");
var path = require("path");
var https = require("https");
var http = require("http");

module.exports = NodeHelper.create({
  start: function () {
    console.log("MMM-PDFSlideshow node_helper started!");
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "GET_PDF_LIST") {
      let pdfFolder = path.join(__dirname, payload);
      console.log("Reading PDF folder at:", pdfFolder);
      fs.readdir(pdfFolder, (err, files) => {
        if (err) {
          this.sendSocketNotification("PDF_LIST", { error: err.message });
          return;
        }
        let pdfFiles = files.filter(file => path.extname(file).toLowerCase() === ".pdf");
        this.sendSocketNotification("PDF_LIST", { pdfFiles: pdfFiles });
      });
    } else if (notification === "DOWNLOAD_PDF") {
      let pdfUrl = payload.pdfURL;
      // Use the provided pdfFolder (if given) or default to "pdfs/"
      let folderName = payload.pdfFolder || "pdfs/";
      let downloadFolder = path.join(__dirname, folderName);
      // Create the download folder if it doesn't exist.
      if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder);
      }
      let fileName = path.basename(pdfUrl);
      let filePath = path.join(downloadFolder, fileName);

      // If the file already exists, return it immediately.
      if (fs.existsSync(filePath)) {
        console.log("File already downloaded:", filePath);
        this.sendSocketNotification("PDF_DOWNLOADED", { pdfFile: fileName });
        return;
      }

      // Choose the appropriate client based on protocol.
      let client = pdfUrl.startsWith("https://") ? https : http;
      let file = fs.createWriteStream(filePath);
      client.get(pdfUrl, (response) => {
        if (response.statusCode !== 200) {
          this.sendSocketNotification("PDF_DOWNLOAD_ERROR", { error: "Status code: " + response.statusCode });
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            console.log("Downloaded file saved to", filePath);
            // Notify the module with the downloaded file's name.
            this.sendSocketNotification("PDF_DOWNLOADED", { pdfFile: fileName });
          });
        });
      }).on("error", (err) => {
        fs.unlink(filePath, () => {}); // Remove partially downloaded file.
        this.sendSocketNotification("PDF_DOWNLOAD_ERROR", { error: err.message });
      });
    }
  }
});
