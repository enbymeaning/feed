#!/usr/bin/env node
// Usage:
//   YOUTUBE_API_KEY=xxxx node pull-youtube.js
//
// Pulls the newest uploads from an allowlist of YouTube channels you
// curate (CHANNEL_IDS below) and drops any videos not already in
// feed-data.json / pending-review.json into pending-review.json for
// your approval.
//
// Why this one is worth automating: it uses channels.list + playlistItems.list
// (1 quota unit each) instead of search.list (100 units) — cheap enough to
// run daily against dozens of channels inside YouTube's free 10,000-unit/day
// quota. This is realistically the only platform where you can automate
// discovery yourself without a paid third-party scraper — TikTok has no
// commercial hashtag/discovery API, and Instagram's hashtag search requires
// your own Business account, Meta App Review, and is capped at 30 unique
// hashtags per rolling 7 days, so it's not worth building against for a v1.
//
// If you'd rather search by hashtag/keyword than maintain a channel list,
// swap getLatestVideos() calls for searchByHashtag() below — it works the
// same way, just costs 100 units per call instead of 1.
//
// Get an API key: console.cloud.google.com -> enable "YouTube Data API v3" -> Credentials.

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.YOUTUBE_API_KEY;
const PENDING_FILE = path.join(__dirname, "pending-review.json");
const FEED_FILE = path.join(__dirname, "feed-data.json");

// Maintain this list yourself — this is curation, not open discovery.
const CHANNEL_IDS = [
  // "UCdRxl_zUkt98NQtGaVvdqBQ",  // e.g. a filmmaker or musician you follow
];

const MAX_PER_CHANNEL = 5;

async function getUploadsPlaylistId(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`;
  const data = await fetch(url).then(r => r.json());
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
}

async function getLatestVideos(playlistId) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${MAX_PER_CHANNEL}&key=${API_KEY}`;
  const data = await fetch(url).then(r => r.json());
  return (data.items || []).map(it => ({
    videoId: it.snippet.resourceId.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    channelId: it.snippet.channelId,
    publishedAt: it.snippet.publishedAt,
  }));
}

// Optional alternative to the channel allowlist: keyword/hashtag search.
// Costs 100 units per call (vs 1 for playlistItems) so budget accordingly —
// the free tier gives you about 100 of these per day, total.
async function searchByHashtag(tag, maxResults = 10) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent("#" + tag)}&type=video&order=date&maxResults=${maxResults}&key=${API_KEY}`;
  const data = await fetch(url).then(r => r.json());
  return (data.items || []).map(it => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    channelId: it.snippet.channelId,
    publishedAt: it.snippet.publishedAt,
  }));
}

function alreadyKnown(videoId, feed, pending) {
  return feed.some(it => it.videoId === videoId) || pending.some(it => it.videoId === videoId);
}

async function main() {
  if (!API_KEY) { console.error("Set YOUTUBE_API_KEY first."); process.exit(1); }

  const feed = JSON.parse(fs.readFileSync(FEED_FILE, "utf8") || "[]");
  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8") || "[]");

  let added = 0;
  for (const channelId of CHANNEL_IDS) {
    const uploadsPlaylist = await getUploadsPlaylistId(channelId);
    if (!uploadsPlaylist) continue;
    const videos = await getLatestVideos(uploadsPlaylist);
    for (const v of videos) {
      if (alreadyKnown(v.videoId, feed, pending)) continue;
      pending.push({
        type: "video",
        platform: "YouTube",
        title: v.title,
        creator: v.channelTitle,
        creatorHandle: v.channelTitle,
        creatorUrl: `https://youtube.com/channel/${v.channelId}`,
        videoId: v.videoId,
        tags: ["Video"],
        date: v.publishedAt.slice(0, 10),
        excerpt: "",
        _note: "Auto-pulled from channel allowlist — write a real excerpt before promoting."
      });
      added++;
    }
  }

  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
  console.log(`Added ${added} new video(s) to pending-review.json.`);
}

main().catch(err => { console.error(err); process.exit(1); });
