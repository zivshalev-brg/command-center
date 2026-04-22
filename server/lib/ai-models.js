/**
 * Central registry of Anthropic model IDs.
 *
 * Migrating away from retired `claude-*-4-20250514` IDs that now 404 on the API.
 * Import from here instead of hard-coding model strings, so future upgrades are
 * one-line changes. Override via env for quick experiments.
 */
'use strict';

const OPUS = process.env.ANTHROPIC_OPUS || 'claude-opus-4-7';
const SONNET = process.env.ANTHROPIC_SONNET || 'claude-sonnet-4-6';
const HAIKU = process.env.ANTHROPIC_HAIKU || 'claude-haiku-4-5-20251001';

module.exports = { OPUS, SONNET, HAIKU };
