// Creates a minimal valid PDF for testing notebook ingestion.
const fs = require('fs');
const path = require('path');

const text = 'Beanz internal test document. FY27 priorities include Retention, FTBP Conversion, Platinum Roasters, PBB, and AI Project Feral. DE delivery SLA is 2.08d vs 2.0d target.';
const safe = text.replace(/[()\\]/g, ' ');
const contents = 'BT /F1 12 Tf 50 720 Td (' + safe + ') Tj ET';

const pdf =
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>/Contents 4 0 R>>endobj\n' +
  '4 0 obj<</Length ' + contents.length + '>>\nstream\n' + contents + '\nendstream\nendobj\n' +
  'xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000054 00000 n \n0000000101 00000 n \n0000000205 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n0\n%%EOF';

const out = path.join(__dirname, '..', 'beanz-test.pdf');
fs.writeFileSync(out, pdf);
console.log('wrote', pdf.length, 'bytes at', out);
