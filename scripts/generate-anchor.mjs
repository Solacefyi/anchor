#!/usr/bin/env node
/**
 * Generate today's Solace Anchor file from the live Hermes decision ledger.
 *
 * Usage:
 *   node scripts/generate-anchor.mjs
 *   SOLACE_API_URL=https://solace.fyi node scripts/generate-anchor.mjs
 *
 * The script reads existing YYYY-MM-DD.json files in the anchor directory,
 * fetches the current chain head, writes today's anchor, and verifies
 * continuity.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SOLACE_API_URL = (process.env.SOLACE_API_URL || 'https://solace.fyi').replace(/\/$/, '');

const __filename = fileURLToPath(import.meta.url);
const ANCHOR_DIR = path.resolve(path.dirname(__filename), '..');

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalAnchorPayload(anchor) {
  return JSON.stringify({
    chain_head: anchor.chain_head,
    date: anchor.date,
    previous_anchor: anchor.previous_anchor,
    row_number: anchor.row_number,
    sealed_at: anchor.sealed_at,
    source_url: anchor.source_url,
  });
}

function anchorFileHash(anchor) {
  return sha256Hex(canonicalAnchorPayload(anchor));
}

async function fetchLedger() {
  const url = `${SOLACE_API_URL}/api/hermes/decision-ledger`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Ledger fetch failed: HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

async function listAnchorFiles() {
  const entries = await fs.readdir(ANCHOR_DIR);
  const files = entries.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(ANCHOR_DIR, file), 'utf8');
      return JSON.parse(raw);
    }),
  );
}

function verifyContinuity(anchors) {
  const sorted = [...anchors].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    if (i === 0) {
      if (anchor.previous_anchor !== null) {
        throw new Error(`Genesis anchor ${anchor.date} must have previous_anchor null`);
      }
    } else {
      const prev = sorted[i - 1];
      if (anchor.previous_anchor !== prev.chain_head) {
        throw new Error(
          `Continuity broken at ${anchor.date}: previous_anchor ${anchor.previous_anchor} != ${prev.date} chain_head ${prev.chain_head}`,
        );
      }
    }
  }
}

function todayUtc() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

async function main() {
  const today = todayUtc();
  const outputPath = path.join(ANCHOR_DIR, `${today}.json`);

  const existingAnchors = await listAnchorFiles();
  const sortedExisting = existingAnchors.sort((a, b) => a.date.localeCompare(b.date));
  const previous = sortedExisting.filter((a) => a.date < today).pop() ?? null;

  const ledger = await fetchLedger();
  const chainHead = ledger?.chain?.head;
  const rowNumber = ledger?.count ?? 0;

  if (!chainHead) {
    throw new Error('Ledger returned no chain head. Cannot anchor an empty chain.');
  }

  const expectedPrevious = previous ? previous.chain_head : null;
  const existingToday = sortedExisting.find((a) => a.date === today);
  if (existingToday) {
    const sameHead = existingToday.chain_head === chainHead;
    const sameRow = existingToday.row_number === rowNumber;
    const samePrevious = existingToday.previous_anchor === expectedPrevious;
    if (sameHead && sameRow && samePrevious) {
      console.log(`Anchor for ${today} already up to date.`);
      return;
    }
    console.log(`Updating existing anchor for ${today}.`);
  }

  const anchor = {
    date: today,
    chain_head: chainHead,
    row_number: rowNumber,
    sealed_at: new Date().toISOString(),
    previous_anchor: previous ? previous.chain_head : null,
    source_url: `https://solace.fyi/anchor/${today}`,
  };

  // Verify the new anchor maintains continuity before writing,
  // replacing any existing anchor for today.
  const priorAnchors = sortedExisting.filter((a) => a.date < today);
  verifyContinuity([...priorAnchors, anchor]);

  const payload = canonicalAnchorPayload(anchor);
  const fileHash = anchorFileHash(anchor);

  await fs.writeFile(outputPath, JSON.stringify(anchor, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${outputPath}`);
  console.log(`  date:        ${anchor.date}`);
  console.log(`  chain_head:  ${anchor.chain_head}`);
  console.log(`  row_number:  ${anchor.row_number}`);
  console.log(`  previous:    ${anchor.previous_anchor ?? 'GENESIS'}`);
  console.log(`  file_hash:   ${fileHash}`);
  console.log(`  payload:     ${payload}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
