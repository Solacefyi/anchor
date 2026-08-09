# Solace Anchor

This repository witnesses the Solace decision chain head in near-real time.

The anchor is not GitHub. The anchor is the **cryptographic hash chain**:
every Hermes decision is a canonical record, SHA-256 hashed, and chained to the
record before it. This repository publishes the chain head almost instantly so
anyone can verify ordering and integrity without trusting Solace infrastructure.

GitHub is the public distribution and independent-observation layer. It makes
the chain observable, not trustworthy.

## For everyone: one-click verification

👉 [Verify the latest anchor in your browser](https://solace.fyi/anchor)

## Near-real-time publication

A GitHub Actions workflow in `.github/workflows/near-realtime-anchor.yml` runs
every 5 minutes. It fetches the live Hermes decision ledger, writes a new
timestamped anchor file, verifies continuity, and commits the result.

To generate the latest anchor manually:

```bash
node scripts/generate-anchor.mjs
# or against a local Solace instance
SOLACE_API_URL=http://localhost:3000 node scripts/generate-anchor.mjs
```

## For engineers: CLI verification

```bash
curl -sL https://raw.githubusercontent.com/Solacefyi/anchor/main/verify/verify.sh | bash
```

Python and Node verifiers are also available in `verify/`. Point them at any Solace base URL:

```bash
ANCHOR_BASE_URL=https://solace.fyi python3 verify.py [hash]
```

## What this proves

- The chain head at time T was hash Y.
- Each anchor's `previous_anchor` matches the previous anchor's `chain_head`.
- Anyone rewriting history would break continuity with this record.
- GitHub's publication history provides independent observation.

## File format

`YYYY-MM-DDTHH-MM-SS.json`:

```json
{
  "date": "2026-08-09T12:34:56Z",
  "chain_head": "9101fcbdcf3ff0a2d2722b3140edcbb8b7278c4017fdb37fa7d030ffa7511404",
  "row_number": 289,
  "sealed_at": "2026-08-09T12:34:56Z",
  "previous_anchor": "f8a82bdf5d6496e1e4593942b8489b35aed21afc21a7622be8e0d72b1e619cb6",
  "source_url": "https://solace.fyi/anchor/2026-08-09T12-34-56"
}
```

Legacy daily files (`YYYY-MM-DD.json`) are still valid and read alongside the
new timestamped files.

## Future: external anchoring

Once the chain has meaningful volume, Solace can periodically anchor the Merkle
root of all decisions to an external timestamp service (e.g., Bitcoin). One
transaction can then provide independent evidence for a large collection of
decisions. This repository is designed to support that upgrade without changing
the anchor file format.

## License

Public domain. Verify, don't trust.
