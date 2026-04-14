const fs = require('fs');
const path = require('path');
const store = path.join(__dirname, 'news-store.json');
const empty = { version: 1, lastRefreshed: null, articles: [], competitorAlerts: [], stats: {}, sourceStatus: {} };
fs.writeFileSync(store, JSON.stringify(empty, null, 2));
console.log('News store cleared');
