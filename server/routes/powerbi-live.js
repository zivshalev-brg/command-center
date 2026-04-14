/**
 * Power BI Live API Routes — /api/pbi/*
 *
 * Provides live Power BI data access using the SSO token captured by
 * beanz-digest Playwright sessions. No Azure AD app registration required.
 *
 * Endpoints:
 *   GET  /api/pbi/status          — Token validity, connection health
 *   GET  /api/pbi/datasets        — List available datasets
 *   GET  /api/pbi/schema          — Dataset tables/columns/measures
 *   GET  /api/pbi/pages           — Report pages list
 *   POST /api/pbi/query           — Execute DAX query
 *   GET  /api/pbi/metrics         — Pre-built metrics via DAX
 *   GET  /api/pbi/refresh-history — Dataset refresh timestamps
 *   GET  /api/pbi/templates       — List available DAX query templates
 *   POST /api/pbi/refresh-token   — Trigger token refresh
 */
const { jsonReply, readBody } = require('../lib/helpers');
const pbi = require('../lib/powerbi-api');
const dax = require('../lib/powerbi-dax');
const { logAction } = require('../lib/db');
const { cachedDAXQuery } = require('../lib/pbi-refresh-scheduler');

async function handlePowerBILive(req, res, parts, url, ctx) {
  const sub = parts[1]; // e.g. 'status', 'datasets', 'query', etc.

  // ── GET /api/pbi/status ──────────────────────────────────────────────────
  if (sub === 'status' && req.method === 'GET') {
    const tokenStatus = pbi.getTokenStatus(ctx);
    let datasetsCount = null;

    // If token is available, try a quick API call to verify
    if (tokenStatus.available) {
      try {
        const datasets = await pbi.getDatasets(ctx);
        datasetsCount = datasets.length;
      } catch (e) {
        tokenStatus.apiError = e.message;
      }
    }

    return jsonReply(res, 200, {
      connected: tokenStatus.available && datasetsCount !== null,
      token: tokenStatus,
      datasetsFound: datasetsCount,
      config: {
        groupId: ctx.pbi?.groupId || null,
        reportId: ctx.pbi?.reportId || null,
      }
    });
  }

  // ── GET /api/pbi/datasets ────────────────────────────────────────────────
  if (sub === 'datasets' && req.method === 'GET') {
    try {
      const datasets = await pbi.getDatasets(ctx);
      logAction('pbi_datasets', null, 'api', { count: datasets.length });
      return jsonReply(res, 200, { datasets });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/schema?datasetId=xxx ────────────────────────────────────
  // Uses REST API /datasets/{id}/tables (not DAX DMVs which are unsupported)
  if (sub === 'schema' && req.method === 'GET') {
    try {
      let datasetId = url.searchParams.get('datasetId');
      let datasetName = null;

      // If no datasetId provided, discover it
      if (!datasetId) {
        const datasets = await pbi.getDatasets(ctx);
        if (datasets.length === 0) {
          return jsonReply(res, 404, { error: 'No datasets found in workspace' });
        }
        datasetId = datasets[0].id;
        datasetName = datasets[0].name;
      }

      const schema = { datasetId, datasetName };

      // Use REST API tables endpoint (works reliably, unlike DAX DMVs)
      try {
        const tables = await pbi.getDatasetSchema(ctx, datasetId);
        schema.tables = tables.map(t => ({
          name: t.name,
          columns: (t.columns || []).map(c => ({
            name: c.name,
            dataType: c.dataType,
            isHidden: c.isHidden || false
          })),
          measures: (t.measures || []).map(m => ({
            name: m.name,
            expression: m.expression,
            isHidden: m.isHidden || false
          })),
          isHidden: t.isHidden || false
        }));
      } catch (e) {
        schema.tablesError = e.message;
        // Fallback: try a simple EVALUATE ROW() to at least verify connectivity
        try {
          await pbi.executeDAXQuery(ctx, datasetId, 'EVALUATE ROW("Status", "Connected")');
          schema.connected = true;
        } catch {
          schema.connected = false;
        }
      }

      // Also try to list all datasets for context
      try {
        const allDatasets = await pbi.getDatasets(ctx);
        schema.availableDatasets = allDatasets.map(d => ({ id: d.id, name: d.name }));
      } catch {}

      logAction('pbi_schema', null, 'api', { datasetId });
      return jsonReply(res, 200, schema);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/pages ───────────────────────────────────────────────────
  if (sub === 'pages' && req.method === 'GET') {
    try {
      const pages = await pbi.getReportPages(ctx);
      return jsonReply(res, 200, { pages });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── POST /api/pbi/query ──────────────────────────────────────────────────
  // Body: { template: "kpi_overview", params: {}, datasetId: "optional" }
  // Or:   { dax: "EVALUATE ...", datasetId: "optional" }
  if (sub === 'query' && req.method === 'POST') {
    try {
      const body = await readBody(req);

      // Resolve datasetId — prefer BeanzCore for business queries
      let datasetId = body.datasetId;
      if (!datasetId) {
        const datasets = await pbi.getDatasets(ctx);
        if (datasets.length === 0) {
          return jsonReply(res, 404, { error: 'No datasets found in workspace' });
        }
        const beanzDs = datasets.find(d => d.name && d.name.includes('BeanzCore'));
        datasetId = beanzDs ? beanzDs.id : datasets[0].id;
      }

      // Build DAX query
      let daxQuery;
      if (body.template) {
        daxQuery = dax.buildQuery(body.template, body.params || {});
      } else if (body.dax) {
        daxQuery = body.dax;
      } else {
        return jsonReply(res, 400, { error: 'Provide either "template" or "dax" in request body' });
      }

      // Execute
      const result = await pbi.executeDAXQuery(ctx, datasetId, daxQuery);

      logAction('pbi_query', null, 'api', {
        template: body.template || 'custom',
        datasetId,
        rowCount: result.rows?.length || 0
      });

      return jsonReply(res, 200, {
        template: body.template || 'custom',
        datasetId,
        query: daxQuery,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows?.length || 0
      });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/metrics ─────────────────────────────────────────────────
  // Runs the standard KPI overview query and returns structured metrics
  if (sub === 'metrics' && req.method === 'GET') {
    try {
      const datasets = await pbi.getDatasets(ctx);
      if (datasets.length === 0) {
        return jsonReply(res, 404, { error: 'No datasets found' });
      }
      // Prefer BeanzCore dataset for business metrics
      const beanzDs = datasets.find(d => d.name && d.name.includes('BeanzCore'));
      const datasetId = beanzDs ? beanzDs.id : datasets[0].id;
      const datasetName = beanzDs ? beanzDs.name : datasets[0].name;
      const metrics = {};

      // Determine FY from query param (default: current FY based on BRG Jul-Jun)
      const now = new Date();
      const currentFY = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(); // Jul+ = next FY
      const requestedFY = parseInt(url.searchParams.get('fy')) || currentFY;
      const prevFY = requestedFY - 1;

      // Run FY-filtered templates
      const fyParams = { fy: requestedFY };
      const prevFyParams = { fy: prevFY };

      const templates = [
        { name: 'kpi_overview', params: fyParams },
        { name: 'kpi_overview_prev', template: 'kpi_overview', params: prevFyParams },
        { name: 'kpi_by_fy', params: {} },
        { name: 'regional_breakdown', params: fyParams },
        { name: 'subscription_health', params: {} },
        { name: 'revenue_by_program', params: fyParams },
      ];
      for (const t of templates) {
        const templateName = t.template || t.name;
        try {
          const query = dax.buildQuery(templateName, t.params);
          const result = await pbi.executeDAXQuery(ctx, datasetId, query);
          metrics[t.name] = { rows: result.rows, columns: result.columns };
        } catch (e) {
          metrics[t.name] = { error: e.message };
        }
      }

      logAction('pbi_metrics', null, 'api', { templatesRun: templates.length, fy: requestedFY });
      return jsonReply(res, 200, {
        datasetId,
        datasetName,
        fy: requestedFY,
        prevFy: prevFY,
        metrics,
        queriedAt: new Date().toISOString()
      });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/refresh-history?datasetId=xxx ───────────────────────────
  if (sub === 'refresh-history' && req.method === 'GET') {
    try {
      let datasetId = url.searchParams.get('datasetId');
      if (!datasetId) {
        const datasets = await pbi.getDatasets(ctx);
        if (datasets.length === 0) return jsonReply(res, 404, { error: 'No datasets found' });
        datasetId = datasets[0].id;
      }

      const history = await pbi.getRefreshHistory(ctx, datasetId);
      return jsonReply(res, 200, { datasetId, refreshes: history });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/templates ───────────────────────────────────────────────
  if (sub === 'templates' && req.method === 'GET') {
    return jsonReply(res, 200, { templates: dax.listTemplates() });
  }

  // ── POST /api/pbi/refresh-token ──────────────────────────────────────────
  if (sub === 'refresh-token' && req.method === 'POST') {
    try {
      const token = await pbi.triggerTokenRefresh(ctx);
      if (token) {
        return jsonReply(res, 200, { ok: true, message: 'Token refreshed successfully' });
      } else {
        return jsonReply(res, 500, { ok: false, error: 'Token refresh failed. Ensure beanz-digest is properly configured.' });
      }
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── POST /api/pbi/slice ───────────────────────────────────────────────────
  // Parameterized slice-and-dice queries with caching.
  // Body: { dimension: "market"|"program"|"month"|"status",
  //         metric: "revenue"|"subscribers"|"cancellations"|"bags",
  //         filters: { market: "AU", dateFrom: "2025-01-01", dateTo: "2025-12-31" },
  //         datasetId: "optional" }
  if (sub === 'slice' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { dimension, metric, filters } = body;

      if (!dimension || !metric) {
        return jsonReply(res, 400, { error: 'Provide "dimension" and "metric" in request body' });
      }

      // Resolve datasetId — prefer BeanzCore for business data
      let datasetId = body.datasetId;
      if (!datasetId) {
        const datasets = await pbi.getDatasets(ctx);
        if (datasets.length === 0) return jsonReply(res, 404, { error: 'No datasets found' });
        const beanzDs = datasets.find(d => d.name && d.name.includes('BeanzCore'));
        datasetId = beanzDs ? beanzDs.id : datasets[0].id;
      }

      // Build parameterized DAX query
      const daxQuery = dax.buildSliceQuery(dimension, metric, filters);
      if (!daxQuery) {
        return jsonReply(res, 400, { error: `Unsupported dimension "${dimension}" or metric "${metric}"` });
      }

      // Try cache first
      const cacheKey = `slice:${dimension}:${metric}:${JSON.stringify(filters || {})}`;
      const { getCached, setCache } = require('../lib/pbi-refresh-scheduler');
      const cached = getCached(cacheKey);
      if (cached) {
        logAction('pbi_slice', null, 'cache', { dimension, metric, cached: true });
        return jsonReply(res, 200, {
          dimension, metric, filters,
          datasetId,
          columns: cached.columns,
          rows: cached.rows,
          rowCount: cached.rows?.length || 0,
          fromCache: true,
          query: daxQuery
        });
      }

      // Execute
      const result = await pbi.executeDAXQuery(ctx, datasetId, daxQuery);
      setCache(cacheKey, result, datasetId);

      logAction('pbi_slice', null, 'api', { dimension, metric, rowCount: result.rows?.length || 0 });

      return jsonReply(res, 200, {
        dimension, metric, filters,
        datasetId,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows?.length || 0,
        fromCache: false,
        query: daxQuery
      });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/pbi/discover ─────────────────────────────────────────────────
  // Deep schema discovery: lists all datasets, picks the best one, probes tables
  // with simple DAX queries to find which tables actually exist.
  if (sub === 'discover' && req.method === 'GET') {
    try {
      const datasets = await pbi.getDatasets(ctx);
      if (datasets.length === 0) {
        return jsonReply(res, 404, { error: 'No datasets found in workspace' });
      }

      const results = [];
      for (const ds of datasets) {
        const entry = { id: ds.id, name: ds.name, tables: [], measures: [], probeResults: {} };

        // Try REST API schema first
        try {
          const tables = await pbi.getDatasetSchema(ctx, ds.id);
          entry.tables = tables.map(t => ({
            name: t.name,
            columnCount: (t.columns || []).length,
            columns: (t.columns || []).map(c => c.name),
            measureCount: (t.measures || []).length,
            measures: (t.measures || []).map(m => m.name)
          }));
        } catch (e) {
          entry.schemaError = e.message;
        }

        // If REST schema returned nothing, probe common table names via DAX
        if (entry.tables.length === 0) {
          const probeNames = [
            'Sales', 'Revenue', 'Orders', 'Transactions',
            'Subscription', 'Subscriptions', 'Customers', 'Customer',
            'Calendar', 'Date', 'Dates',
            'Geography', 'Market', 'Markets', 'Region',
            'Product', 'Products', 'SKU',
            'FTBP', 'Cancellation', 'Cancellations',
            'Fact_Sales', 'Dim_Date', 'Dim_Customer', 'Dim_Product',
            'P&L', 'PnL', 'Finance', 'Budget'
          ];

          for (const tableName of probeNames) {
            try {
              const result = await pbi.executeDAXQuery(ctx, ds.id,
                `EVALUATE TOPN(1, '${tableName}')`
              );
              entry.probeResults[tableName] = {
                exists: true,
                columns: result.columns || [],
                sampleRow: result.rows?.[0] || null
              };
            } catch (e) {
              // Table doesn't exist — that's expected, just skip
              if (e.message.includes('Cannot find table')) {
                entry.probeResults[tableName] = { exists: false };
              } else {
                entry.probeResults[tableName] = { exists: false, error: e.message };
              }
            }
          }
        }

        results.push(entry);
      }

      logAction('pbi_discover', null, 'api', { datasetsScanned: results.length });
      return jsonReply(res, 200, { datasets: results, discoveredAt: new Date().toISOString() });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  return jsonReply(res, 404, { error: `Unknown PBI endpoint: /api/pbi/${sub || ''}` });
}

module.exports = handlePowerBILive;
