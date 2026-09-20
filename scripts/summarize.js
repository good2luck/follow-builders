#!/usr/bin/env node

// ============================================================================
// Follow Builders — Summarize Digest
// ============================================================================
// Takes the JSON output from prepare-digest.js, sends it to DeepSeek
// along with the prompts, and outputs the final digest text.
//
// Usage:
//   node prepare-digest.js | node summarize.js
//   node summarize.js < prepared.json
//   node summarize.js --file prepared.json
//
// Requires DEEPSEEK_API_KEY in the environment (or ~/.follow-builders/.env)
// Output: plain text digest to stdout
// ============================================================================

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.follow-builders');
const ENV_PATH = join(USER_DIR, '.env');

loadEnv({ path: ENV_PATH });

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

async function getPreparedJSON() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return JSON.parse(await readFile(args[fileIdx + 1], 'utf-8'));
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function buildSystemPrompt(prepared) {
  const { prompts, config } = prepared;
  const parts = [];

  // Main digest prompt — overall format and tone
  if (prompts.digest_intro) parts.push(prompts.digest_intro);

  // Content-specific prompts
  if (prompts.summarize_tweets) parts.push(prompts.summarize_tweets);
  if (prompts.summarize_blogs) parts.push(prompts.summarize_blogs);

  // Translation — English content is translated into Chinese by default.
  // Only skipped when the language is explicitly set to 'en'.
  const lang = config?.language || 'zh';
  if (lang !== 'en' && prompts.translate) {
    // translate.md is authored for Chinese (and documents bilingual mode), so
    // for those two it is used verbatim — rewriting the target to "zh" would
    // leave the prompt reading "translating ... from English to zh".
    // Any other language code swaps the target language in the opening line.
    let prompt = lang === 'zh' || lang === 'bilingual'
      ? prompts.translate
      : prompts.translate.replace('from English to Chinese', `from English to ${lang}`);

    // 'zh' means Chinese and nothing else. translate.md also documents the
    // bilingual layout (English paragraph, then its Chinese translation), and
    // left in place that clause leaks into the output. Drop it and state the
    // requirement outright.
    if (lang === 'zh') {
      prompt = prompt.replace(/\n- For bilingual mode:[\s\S]*?(?=\n- )/, '');
      prompt += [
        '',
        '- Output the Chinese version ONLY. Never include the English original,',
        '  and never put English and Chinese side by side.',
        '- Everything in the output is Chinese except the technical terms, proper',
        '  nouns and URLs listed above, including any status or boilerplate lines.',
      ].join('\n');
    }

    parts.push(prompt);
  }

  return parts.join('\n\n---\n\n');
}

function buildUserMessage(prepared) {
  const content = {
    x: prepared.x,
    youtube: prepared.youtube,
    blogs: prepared.blogs,
    stats: prepared.stats,
    generatedAt: prepared.generatedAt,
    config: prepared.config,
  };

  return [
    'Below is the feed data in JSON format. Follow the system instructions to produce the digest.',
    'Only use content from this data. Do not fabricate anything.',
    'Every item must include its original source link from the JSON.',
    '',
    JSON.stringify(content, null, 2),
  ].join('\n');
}

async function callDeepSeek(systemPrompt, userMessage) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not found in environment');
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`DeepSeek API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`DeepSeek API returned no content: ${JSON.stringify(data)}`);
  }
  return text;
}

async function main() {
  try {
    const prepared = await getPreparedJSON();

    if (prepared.status === 'error') {
      console.error(JSON.stringify(prepared));
      process.exit(1);
    }

    const systemPrompt = buildSystemPrompt(prepared);
    const userMessage = buildUserMessage(prepared);
    const digest = await callDeepSeek(systemPrompt, userMessage);

    // Output the digest text for deliver.js to pick up
    process.stdout.write(digest);
  } catch (err) {
    console.error(JSON.stringify({
      status: 'error',
      stage: 'summarize',
      message: err.message,
    }));
    process.exit(1);
  }
}

main();
