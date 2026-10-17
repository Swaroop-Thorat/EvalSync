const pdfParseModule = require('pdf-parse');


async function extractText(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Valid PDF buffer is required for text extraction');
  }

  let text = '';

  if (typeof pdfParseModule === 'function') {
    const data = await pdfParseModule(buffer);
    text = (data && data.text) ? data.text.trim() : '';
  } else if (pdfParseModule.PDFParse) {
    const parser = new pdfParseModule.PDFParse(new Uint8Array(buffer));
    const result = await parser.getText();
    text = (result && typeof result.text === 'string') ? result.text.trim() : '';
  } else {
    throw new Error('Unsupported pdf-parse interface');
  }

  if (!text) {
    throw new Error('PDF has no extractable text. Scanned or image-only PDFs are not supported.');
  }

  return text;
}

module.exports = extractText;
