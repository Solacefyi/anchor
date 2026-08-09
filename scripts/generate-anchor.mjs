#!/usr/bin/env node
/**
 * Generate the latest Solace Anchor file from the live Hermes decision ledger.
 *
 * Usage:
 *   node scripts/generate-anchor.mjs
 *   SOLACE_API_URL=https://solace.fyi node scripts/generate-anchor.mjs
 *
 * The script reads existing anchor files in the anchor directory, fetches the
 * current chain head, writes a new timestamped anchor if the chain has moved,
 * and verifies continuity.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SOLACE_API_URL = (process.env.SOLACE_API_URL || 'https://solace.fyi').replace(/\/$/, '');

const __filename = fileURLToPath(import.meta.url);
const ANCHOR_DIR = path.resolve(path.dirname(__filename), '..');

// Matches both legacy daily files (YYYY-MM-DD.json) and new timestamped files
// (YYYY-MM-DDTHH-MM-SS.json). Colons are replaced with dashes for filesystem safety.
const ANCHOR_FILE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2})?\.json$/;

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
  const files = entries.filter((f) => ANCHOR_FILE_RE.test(f));
  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(ANCHOR_DIR, file), 'utf8');
      return JSON.parse(raw);
    }),
  );
}

function sortAnchors(anchors) {
  return [...anchors].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return String(a.sealed_at ?? '').localeCompare(String(b.sealed_at ?? ''));
  });
}

function verifyContinuity(anchors) {
  const sorted = sortAnchors(anchors);
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

function nowUtcIso() {
  return new Date().toISOString();
}

function filenameFromIso(iso) {
  // 2026-08-09T12:34:56.000Z -> 2026-08-09T12-34-56.json
  const [date, time] = iso.split('T');
  const [hh, mm, ss] = time.split(':');
  return `${date}T${hh}-${mm}-${ss.split('.')[0]}.json`;
}

async function main() {
  const existingAnchors = await listAnchorFiles();
  const sortedExisting = sortAnchors(existingAnchors);
  const previous = sortedExisting[sortedExisting.length - 1] ?? null;

  const ledger = await fetchLedger();
  const chainHead = ledger?.chain?.head;
  const rowNumber = ledger?.count ?? 0;

  if (!chainHead) {
    throw new Error('Ledger returned no chain head. Cannot anchor an empty chain.');
  }

  // Idempotent: if the latest anchor already captures this chain head, do nothing.
  if (previous && previous.chain_head === chainHead && previous.row_number === rowNumber) {
    console.log(`Chain head already anchored at ${previous.sealed_at}.`);
    return;
  }

  const sealedAt = nowUtcIso();
  const outputPath = path.join(ANCHOR_DIR, filenameFromIso(sealedAt));

  const anchor = {
    date: sealedAt,
    chain_head: chainHead,
    row_number: rowNumber,
    sealed_at: sealedAt,
    previous_anchor: previous ? previous.chain_head : null,
    source_url: `https://solace.fyi/anchor/${path.basename(outputPath, '.json')}`,
  };

  verifyContinuity([...sortedExisting, anchor]);

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
