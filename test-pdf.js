const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('fontkit');
const fs = require('fs');
const path = require('path');

async function test() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontPath = path.join(__dirname, "public", "fonts", "Roboto-Regular.ttf");
  const fontBoldPath = path.join(__dirname, "public", "fonts", "Roboto-Bold.ttf");

  const fontBytes = fs.readFileSync(fontPath);
  const fontBoldBytes = fs.readFileSync(fontBoldPath);

  const customFont = await pdfDoc.embedFont(fontBytes);
  const customFontBold = await pdfDoc.embedFont(fontBoldBytes);

  const page = pdfDoc.addPage([500, 500]);
  
  try {
      page.drawText("Иван Иванов Regular", {
        x: 50,
        y: 400,
        size: 24,
        font: customFont,
        color: rgb(0, 0, 0),
      });
  } catch(e) { console.error("Error drawing regular:", e.message) }
  
  try {
      page.drawText("Иван Иванов Bold", {
        x: 50,
        y: 350,
        size: 24,
        font: customFontBold,
        color: rgb(0, 0, 0),
      });
  } catch(e) { console.error("Error drawing bold:", e.message) }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync("test-output.pdf", pdfBytes);
  console.log("Done");
}

test().catch(e => console.error(e));
