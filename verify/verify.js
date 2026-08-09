#!/usr/bin/env node
/**
 * Solace Anchor verifier (Node).
 *
 * Usage:
 *   node verify.js [hash]
 *   ANCHOR_BASE_URL=https://solace.fyi node verify.js [hash]
 */

const BASE = (process.env.ANCHOR_BASE_URL || 'https://solace.fyi').replace(/\/$/, '');

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function verifyContinuity(anchors) {
  const sorted = [...anchors].sort((a, b) => a.date.localeCompare(b.date));
  const breaks = [];
  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    if (i === 0) {
      if (anchor.previousAnchor !== null) {
        breaks.push(`Genesis anchor ${anchor.date} must have previousAnchor null`);
      }
    } else {
      const prev = sorted[i - 1];
      if (anchor.previousAnchor !== prev.chainHead) {
        breaks.push(
          `Anchor ${anchor.date} previousAnchor does not match ${prev.date} chainHead`,
        );
      }
    }
  }
  return { sorted, breaks };
}

async function main() {
  const targetHash = process.argv[2] || null;

  console.log(`Fetching anchor index from ${BASE}/api/anchor ...`);
  const index = await fetchJson(`${BASE}/api/anchor`);
  const anchors = index.anchors || index.recent || [];

  if (!anchors.length) {
    console.error('No anchors returned by index.');
    process.exit(1);
  }

  const { sorted, breaks } = verifyContinuity(anchors);

  console.log(`\nAnchors loaded: ${sorted.length}`);
  console.log(`Latest: ${sorted[sorted.length - 1].date} → ${sorted[sorted.length - 1].chainHead}`);

  if (breaks.length) {
    console.error('\n❌ Chain continuity broken:');
    breaks.forEach((b) => console.error(`   - ${b}`));
    process.exit(1);
  }

  console.log('\n✅ Chain continuity verified.');

  if (targetHash) {
    const match = sorted.find((a) => a.chainHead === targetHash);
    if (match) {
      console.log(`\n✅ Hash found in chain:`);
      console.log(`   Date: ${match.date}`);
      console.log(`   Row:  ${match.rowNumber}`);
      console.log(`   Sealed: ${match.sealedAt}`);
    } else {
      console.log(`\n❌ Hash not found in chain.`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
