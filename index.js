#!/usr/bin/env node

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {execSync} from 'node:child_process';
import fetch, {Headers} from 'node-fetch';
import HLS from 'hls-parser';
import {getScteSegments} from 'hls-get-scte-segments';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playlistUrl = process.argv[2];

try {
  new URL(playlistUrl);
} catch {
  showMessageAndExit(`Invalid manifest URL: "${playlistUrl}"`, true, 1);
}

const args = process.argv.slice(3);

const outdir = checkArgs(args, '--outdir=', path.join(__dirname, `log_${formatDate(new Date())}`));

try {
  fs.mkdirSync(outdir);
} catch {
  showMessageAndExit(`Unable to create outdir: "${outdiir}"`, true, 1);
}

const cueInOnly = checkArgs(args, '--cue-in-only');

console.log(`\toutdir=${outdir}`);
console.log(`\tcueInOnly=${cueInOnly}`);

try {
  const response = await fetch(playlistUrl);
  const scteSegments = getScteSegments(await response.text());

  if (scteSegments.length === 0) {
    showMessageAndExit('No SCTE segment was found');
  }

  // List the URLs of CUE-OUT/CUE-IN segments
  const cueInSegments = [];
  const savedKeys = [];
  let targetDuration = 0;
  for (const segment of scteSegments) {
    const {programDateTime, dateRange, uri, key, duration} = segment;
    const plUrl = new URL(uri, playlistUrl);
    const pdt = programDateTime ? formatDate(programDateTime) : '';

    console.log(`${pdt}, event_id=${dateRange.id}, ${plUrl.href}`);

    if (!dateRange.end && cueInOnly) {
      // Skip CUE-OUT
      continue;
    }

    targetDuration = Math.max(targetDuration, Math.ceil(segment.duration));

    // Save the segment
    const filepath = path.join(outdir, path.basename(plUrl.pathname));
    const response = await fetch(plUrl.href);
    const buffer = await response.arrayBuffer();
    const plainData = new Uint8Array(buffer);
    fs.writeFileSync(filepath, plainData);

    // Save the key
    const keyUrl = new URL(key.uri, playlistUrl);
    const keyFilepath = path.join(outdir, path.basename(keyUrl.pathname));
    if (!savedKeys.includes(keyFilepath)) {
      const headers = new Headers({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15'
      });
      // console.log(`Fetch key: ${keyUrl.href}`);
      const response = await fetch(keyUrl.href, {headers});
      const buffer = await response.arrayBuffer();
      const decryptionKey = new Uint8Array(buffer);
      fs.writeFileSync(keyFilepath, decryptionKey);
      savedKeys.push(keyFilepath);
    }

    // Modify the segment for playback
    delete segment.programDateTime;
    delete segment.dateRange;
    segment.uri = path.basename(plUrl.pathname);
    segment.discontinuity = true;
    segment.key.uri = path.basename(keyUrl.pathname);
    cueInSegments.push(segment);
  }

  // Create a new playlist
  const {MediaPlaylist} = HLS.types;
  const playlist = new MediaPlaylist({
    version: 3,
    playlistType: 'VOD',
    targetDuration,
    segments: cueInSegments,
    endlist: true,
  });
  const manifestFilepath = path.join(outdir, 'index.m3u8');
  fs.writeFileSync(manifestFilepath, HLS.stringify(playlist));

  console.log(`${cueInSegments.length} segments have been written`);

  const outfile = checkArgs(args, '--outfile=');
  if (outfile) {
    // Concatenate the segments
    execSync(`cd ${outdir}; ffmpeg -allowed_extensions ALL -i index.m3u8 -c copy ${outfile}`);
    console.log(`All the segments have been concatenated into "${outfile}"`);
  }

} catch (err) {
  showMessageAndExit(`Failed to fetch and store the segment files.\n${err.stack}`, false, 1);
}

function showMessageAndExit(msg, help=false, exitCode=0) {
  console.log(msg);
  if (help) {
    console.log('');
    console.log('Usage:');
    console.log('\tfetch-scte-segments manifest-url [options]');
    console.log('Options:');
    console.log('\t--cue-in-only');
    console.log('\tIf set, only QUE-IN segments are fetched. The defalut behavior is fetching both QUE-OUT/IN segments.');
    console.log('');
    console.log('\t--outdir=[relative path to the directory]');
    console.log('\tIf specified, the fetched segment files are stored in the directory. The defalut outputdir path is "./log_YYYY-MM-DDTHH:MM:SS.SSSZ".');
    console.log('');
    console.log('\t--outfile=[filename]');
    console.log('\tIf specified, the fetched segment files are concatenated into a single file. If not specified, the concatenation is skipped.');
    console.log('Example:');
    console.log('\tfetch-scte-segments "https://example.com/live.m3u8?last-hour=6" --cue-in-only --outdir=SCTE_2023-01-01 --outfile=concatenated.ts');
  }
  process.exit(exitCode);
}

function checkArgs(args, prefix, defaultValue=false) {
  const arg = args.find(arg => arg.startsWith(prefix));
  if (!arg) {
    return defaultValue;
  }
  const v = arg.slice(prefix.length);
  return v === '' ? true : v;
}

function formatDate(dt) {
  const y = dt.getUTCFullYear();
  const m = `00${dt.getUTCMonth() + 1}`.slice(-2);
  const d = `00${dt.getUTCDate()}`.slice(-2);
  const h = `00${dt.getUTCHours()}`.slice(-2);
  const min = `00${dt.getUTCMinutes()}`.slice(-2);
  const sec = `00${dt.getUTCSeconds()}`.slice(-2);
  const msec = `000${dt.getUTCMilliseconds()}`.slice(-3);
  return `${y}-${m}-${d}T${h}:${min}:${sec}.${msec}Z`;
}

