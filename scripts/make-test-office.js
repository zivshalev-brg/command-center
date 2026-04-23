// Creates a small .xlsx and .pptx for testing notebook ingestion.
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const JSZip = require('jszip');

async function main() {
  // ── xlsx ──
  const wb = xlsx.utils.book_new();
  const sheet1 = xlsx.utils.aoa_to_sheet([
    ['Region', 'FY25 Revenue AUD', 'FY26 Revenue AUD', 'YoY %'],
    ['AU', 2800000, 3200000, 14.3],
    ['UK', 3900000, 4600000, 17.9],
    ['US', 5200000, 6800000, 30.8],
    ['DE', 300000, 678000, 126.0]
  ]);
  const sheet2 = xlsx.utils.aoa_to_sheet([
    ['Roaster', 'Bags', 'MOT status'],
    ['Veneziano', 2450, 'on track'],
    ['Market Lane', 2100, 'on track'],
    ['Industry Beans', 1580, 'below MOT']
  ]);
  xlsx.utils.book_append_sheet(wb, sheet1, 'RevenueByRegion');
  xlsx.utils.book_append_sheet(wb, sheet2, 'RoasterMOT');
  const xlsxPath = path.join(__dirname, '..', 'beanz-test.xlsx');
  xlsx.writeFile(wb, xlsxPath);
  console.log('wrote', fs.statSync(xlsxPath).size, 'bytes at', xlsxPath);

  // ── pptx ──
  const zip = new JSZip();
  const slideXml = (title, bullets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>${title}</a:t></a:r></a:p>
      ${bullets.map(b => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join('')}
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('ppt/slides/slide1.xml', slideXml('FY27 Priorities', ['Retention and LTV optimization', 'FTBP v2 conversion scaling', 'Platinum Roaster expansion']));
  zip.file('ppt/slides/slide2.xml', slideXml('Q1 Performance', ['Revenue: $14.2M +15% YoY', 'FTBP conversion at 18.9%', 'SLA average 2.0d on target']));
  zip.file('ppt/slides/slide3.xml', slideXml('Project Feral', ['AI-first retention initiative', '26-week workstream', 'Cancellation, collections, onboarding, email']));
  const pptxBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const pptxPath = path.join(__dirname, '..', 'beanz-test.pptx');
  fs.writeFileSync(pptxPath, pptxBuf);
  console.log('wrote', fs.statSync(pptxPath).size, 'bytes at', pptxPath);
}
main().catch(e => { console.error(e); process.exit(1); });
