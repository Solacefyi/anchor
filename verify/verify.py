#!/usr/bin/env python3
"""
Solace Anchor verifier (Python).

Usage:
    python3 verify.py [hash]
    ANCHOR_BASE_URL=https://solace.fyi python3 verify.py [hash]
"""

import json
import os
import sys
import urllib.request

BASE = os.environ.get("ANCHOR_BASE_URL", "https://solace.fyi").rstrip("/")


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def verify_continuity(anchors):
    sorted_anchors = sorted(anchors, key=lambda a: a["date"])
    breaks = []
    for i, anchor in enumerate(sorted_anchors):
        if i == 0:
            if anchor.get("previousAnchor") is not None:
                breaks.append(
                    f'Genesis anchor {anchor["date"]} must have previousAnchor null'
                )
        else:
            prev = sorted_anchors[i - 1]
            if anchor.get("previousAnchor") != prev["chainHead"]:
                breaks.append(
                    f'Anchor {anchor["date"]} previousAnchor does not match '
                    f'{prev["date"]} chainHead'
                )
    return sorted_anchors, breaks


def main():
    target_hash = sys.argv[1] if len(sys.argv) > 1 else None

    print(f"Fetching anchor index from {BASE}/api/anchor ...")
    index = fetch_json(f"{BASE}/api/anchor")
    anchors = index.get("anchors") or index.get("recent") or []

    if not anchors:
        print("No anchors returned by index.", file=sys.stderr)
        sys.exit(1)

    sorted_anchors, breaks = verify_continuity(anchors)

    print(f"\nAnchors loaded: {len(sorted_anchors)}")
    latest = sorted_anchors[-1]
    print(f'Latest: {latest["date"]} → {latest["chainHead"]}')

    if breaks:
        print("\n❌ Chain continuity broken:", file=sys.stderr)
        for b in breaks:
            print(f"   - {b}", file=sys.stderr)
        sys.exit(1)

    print("\n✅ Chain continuity verified.")

    if target_hash:
        match = next((a for a in sorted_anchors if a["chainHead"] == target_hash), None)
        if match:
            print("\n✅ Hash found in chain:")
            print(f'   Date:   {match["date"]}')
            print(f'   Row:    {match["rowNumber"]}')
            print(f'   Sealed: {match["sealedAt"]}')
        else:
            print("\n❌ Hash not found in chain.")
            sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        sys.exit(1)
