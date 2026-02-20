const { PDFDocument } = require('pdf-lib');
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

  console.log("Width Regular (Latin):", customFont.widthOfTextAtSize("Ivan", 24));
  console.log("Width Regular (Cyrillic):", customFont.widthOfTextAtSize("Иван", 24));
  
  console.log("Width Bold (Latin):", customFontBold.widthOfTextAtSize("Ivan", 24));
  console.log("Width Bold (Cyrillic):", customFontBold.widthOfTextAtSize("Иван", 24));
  console.log("Done");
}

test().catch(e => console.error("Caught error:", e));
