#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers everything the LLM needs to produce a digest:
// - Fetches the central feeds (tweets + youtube + blogs)
// - Fetches the latest prompts from GitHub
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// The LLM's ONLY job is to read this JSON, remix the content, and output
// the digest text. Everything else is handled here deterministically.
//
// Usage: node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');

// This repo owns both the feeds and the prompts. Everything is read from the
// working tree first (see readTextFile/readJSONFile) and only falls back to
// this repo's raw URL when the file is not on disk.
const REPO_SLUG = 'good2luck/follow-builders';
const REPO_RAW_BASE = `https://raw.githubusercontent.com/${REPO_SLUG}/main`;

const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const REPO_ROOT = join(SCRIPT_DIR, '..');

const FEED_FILES = {
  x: 'feed-x.json',
  youtube: 'feed-youtube.json',
  blogs: 'feed-blogs.json'
};

const PROMPT_FILES = [
  'summarize-tweets.md',
  'summarize-blogs.md',
  'digest-intro.md',
  'translate.md'
];

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

// -- Read helpers ------------------------------------------------------------
//
// Everything this script consumes is owned by this repo: the feeds are written
// by the "Generate feeds" step, which runs in the same CI job immediately
// before this one. Read them off disk, because that copy is always the
// freshest. Fetching them from raw.githubusercontent.com instead would hit its
// 5-minute CDN cache and hand back the PREVIOUS run's feed — content that has
// already been digested and delivered — so the digest would repeat a day.
// The raw URL is only the fallback for a checkout without the files.

async function readJSONFile(filename) {
  const localPath = join(REPO_ROOT, filename);
  if (existsSync(localPath)) {
    try {
      return JSON.parse(await readFile(localPath, 'utf-8'));
    } catch {
      // unreadable or malformed — fall through to the remote copy
    }
  }
  return fetchJSON(`${REPO_RAW_BASE}/${filename}`);
}

async function readTextFile(relativePath) {
  const localPath = join(REPO_ROOT, relativePath);
  if (existsSync(localPath)) {
    try {
      return await readFile(localPath, 'utf-8');
    } catch {
      // unreadable — fall through to the remote copy
    }
  }
  return fetchText(`${REPO_RAW_BASE}/${relativePath}`);
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];

  // 1. Read user config
  let config = {
    language: 'zh',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }

  // 2. Load all three feeds
  const [feedX, feedYouTube, feedBlogs] = await Promise.all([
    readJSONFile(FEED_FILES.x),
    readJSONFile(FEED_FILES.youtube),
    readJSONFile(FEED_FILES.blogs)
  ]);

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedYouTube) errors.push('Could not fetch youtube feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');
  if (feedX?.errors?.length) {
    errors.push(
      ...feedX.errors.map((error) => `Tweet feed problem: ${error}`)
    );
  }
  if (feedYouTube?.errors?.length) {
    errors.push(
      ...feedYouTube.errors.map((error) => `YouTube feed problem: ${error}`)
    );
  }
  if (feedBlogs?.errors?.length) {
    errors.push(
      ...feedBlogs.errors.map((error) => `Blog feed problem: ${error}`)
    );
  }

  // 3. Load prompts with priority: user custom > this repo's copy
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it). Otherwise use this repo's prompts/
  // directory — edits made there take effect on the next run.
  const prompts = {};
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);

    // Priority 1: user's custom prompt (they personalized it)
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    // Priority 2: this repo's copy — the working tree, else the raw URL
    const prompt = await readTextFile(join('prompts', filename));
    if (prompt) {
      prompts[key] = prompt;
    } else {
      errors.push(`Could not load prompt: ${filename}`);
    }
  }

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'zh',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },

    // Content to remix
    x: feedX?.x || [],
    youtube: feedYouTube?.youtube || [],
    blogs: feedBlogs?.blogs || [],

    // Stats for the LLM to reference
    stats: {
      xBuilders: feedX?.x?.length || 0,
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      youtubeVideos: feedYouTube?.youtube?.length || 0,
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedYouTube?.generatedAt || feedBlogs?.generatedAt || null
    },

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
