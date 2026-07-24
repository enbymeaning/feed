#!/usr/bin/env node
// Usage:
//   node promote.js <index>
//
// Moves pending-review.json[index] into feed-data.json (added to the
// front, i.e. newest-first) and removes it from the pending queue.
// Review and edit the pending item's fields BEFORE promoting — this
// script just moves data, it doesn't validate content quality.
//
// To see current pending items with their indexes:
//   node -e "JSON.parse(require('fs').readFileSync('pending-review.json')).forEach((it,i)=>console.log(i, '-', it.title))"

const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.join(__dirname, "pending-review.json");
const FEED_FILE = path.join(__dirname, "feed-data.json");

const idx = parseInt(process.argv[2], 10);
if (Number.isNaN(idx)) {
  console.error("Usage: node promote.js <index>");
  process.exit(1);
}

const pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8") || "[]");
const feed = JSON.parse(fs.readFileSync(FEED_FILE, "utf8") || "[]");

if (idx < 0 || idx >= pending.length) {
  console.error(`No pending item at index ${idx}. There are ${pending.length} pending item(s).`);
  process.exit(1);
}

const [item] = pending.splice(idx, 1);
delete item._note; // internal-only field, don't ship it to the live feed
feed.unshift(item); // newest first — switch to feed.push(item) if you want oldest-first

fs.writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2));
fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

console.log(`Promoted "${item.title}" into feed-data.json.`);
