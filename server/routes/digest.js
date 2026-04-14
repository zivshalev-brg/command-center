const fs = require('fs');
const path = require('path');
const { jsonReply, latestFolder, readJSON, listExtractions } = require('../lib/helpers');

module.exports = function handleDigest(req, res, parts, url, ctx) {
  const cadence = url.searchParams.get('cadence') || 'weekly';

  if (parts[1] === 'dates') {
    return jsonReply(res, 200, {
      cadence,
      dates: listExtractions(cadence, ctx.digestOutput)
    });
  }

  if (parts[1] === 'all') {
    const result = {};
    for (const cad of ['daily', 'weekly', 'monthly']) {
      const cadDir = path.join(ctx.digestOutput, cad);
      const folder = latestFolder(cadDir);
      if (folder) {
        const folderPath = path.join(cadDir, folder);
        result[cad] = {
          date: folder,
          summary: readJSON(path.join(folderPath, 'summary.json')),
          kpi_metrics: readJSON(path.join(folderPath, 'kpi_metrics.json')),
          performance: readJSON(path.join(folderPath, 'performance.json'))
        };
      } else {
        result[cad] = null;
      }
    }
    return jsonReply(res, 200, result);
  }

  const dateParam = url.searchParams.get('date');
  const cadDir = path.join(ctx.digestOutput, cadence);
  const folder = dateParam || latestFolder(cadDir);

  if (!folder) {
    return jsonReply(res, 404, { error: `No ${cadence} extractions found` });
  }

  const folderPath = path.join(cadDir, folder);
  if (!fs.existsSync(folderPath)) {
    return jsonReply(res, 404, { error: `No data for ${cadence}/${folder}` });
  }

  const data = { cadence, date: folder };
  try {
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const key = file.replace('.json', '');
      data[key] = readJSON(path.join(folderPath, file));
    }
  } catch (e) {
    data.error = e.message;
  }

  return jsonReply(res, 200, data);
};
