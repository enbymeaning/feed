#!/usr/bin/env node
// Usage:
//   node curate-add.js <url> ["tag1,tag2"]
//
// Fetches oEmbed metadata for a pasted content URL (YouTube, TikTok —
// Instagram best-effort, Bandcamp manual) and appends a normalized
// item to pending-review.json. Nothing goes live automatically —
// review pending-review.json, adjust tags/excerpt, then run
// `node promote.js <index>` to move an approved item into feed-data.json.
//
// Requires Node 18+ (built-in fetch).

const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.join(__dirname, "pending-review.json");

async function main() {
  const url = process.argv[2];
  const tagsArg = process.argv[3];
  if (!url) {
    console.error('Usage: node curate-add.js <url> ["tag1,tag2"]');
    process.exit(1);
  }
  const tags = tagsArg ? tagsArg.split(",").map(t => t.trim()).filter(Boolean) : [];

  let item;
  if (/youtube\.com|youtu\.be/.test(url)) {
    item = await fromYouTube(url, tags);
  } else if (/tiktok\.com/.test(url)) {
    item = await fromTikTok(url, tags);
  } else if (/instagram\.com/.test(url)) {
    item = await fromInstagram(url, tags);
  } else if (/bandcamp\.com/.test(url)) {
    item = fromBandcampStub(url, tags);
  } else {
    console.error("Unrecognized URL — add it to feed-data.json manually.");
    process.exit(1);
  }

  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8") || "[]");
  pending.push(item);
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
  console.log(`Added to pending-review.json (index ${pending.length - 1}):`);
  console.log(item);
}

function extractYouTubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

async function fromYouTube(url, tags) {
  const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`).then(r => r.json());
  return {
    type: "video",
    platform: "YouTube",
    title: oembed.title,
    creator: oembed.author_name,
    creatorHandle: oembed.author_name,
    creatorUrl: oembed.author_url,
    videoId: extractYouTubeId(url),
    tags: tags.length ? tags : ["Video"],
    date: new Date().toISOString().slice(0, 10),
    excerpt: "" // oEmbed doesn't return a description — write your own blurb
  };
}

async function fromTikTok(url, tags) {
  const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`).then(r => r.json());
  const handle = oembed.author_unique_id || oembed.author_name || "";
  return {
    type: "social",
    platform: "TikTok",
    title: oembed.title,
    creator: oembed.author_name,
    creatorHandle: `@${handle}`,
    creatorUrl: `https://www.tiktok.com/@${handle}`,
    tiktokUrl: url,
    tags: tags.length ? tags : ["Short-form"],
    date: new Date().toISOString().slice(0, 10),
    excerpt: ""
  };
}

async function fromInstagram(url, tags) {
  // Meta's oEmbed access requirements have shifted more than once (tokenless
  // calls were required, then reversed in 2026) — confirm the current
  // endpoint at https://developers.facebook.com/docs/instagram-platform/oembed
  // before relying on this. Falls back to a manual template if the call fails.
  try {
    const oembed = await fetch(`https://graph.facebook.com/v20.0/instagram_oembed?url=${encodeURIComponent(url)}`).then(r => r.json());
    return {
      type: "social",
      platform: "Instagram",
      title: oembed.title || "(add a title)",
      creator: oembed.author_name,
      creatorHandle: `@${oembed.author_name}`,
      creatorUrl: `https://instagram.com/${oembed.author_name}`,
      tags: tags.length ? tags : ["Instagram"],
      date: new Date().toISOString().slice(0, 10),
      excerpt: "",
      _note: "Instagram oEmbed fetched — double check every field before promoting."
    };
  } catch (e) {
    return manualTemplate(url, "Instagram", tags, "Instagram oEmbed call failed — fill in by hand.");
  }
}

function fromBandcampStub(url, tags) {
  return manualTemplate(url, "Bandcamp", tags,
    "Bandcamp has no general oEmbed — open the track/album, use its Share > Embed panel, and paste that iframe src into bandcampSrc.");
}

function manualTemplate(url, platform, tags, note) {
  return {
    type: platform === "Bandcamp" ? "audio" : "social",
    platform,
    title: "(add a title)",
    creator: "(add creator name)",
    creatorHandle: "(add @handle)",
    creatorUrl: url,
    tags: tags.length ? tags : [platform],
    date: new Date().toISOString().slice(0, 10),
    excerpt: "",
    _note: note
  };
}

main().catch(err => { console.error(err); process.exit(1); });
