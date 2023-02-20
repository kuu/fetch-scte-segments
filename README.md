# fetch-scte-segments
CLI for parsing HLS media playlist and fetching SCTE35 CUE-OUT/IN segments

## Install
[![NPM](https://nodei.co/npm/fetch-scte-segments.png?mini=true)](https://nodei.co/npm/fetch-scte-segments/)

## Usage
```
Usage:
	fetch-scte-segments manifest-url [options]
Options:
	--cue-in-only
	If set, only CUE-IN segments are fetched. The defalut behavior is fetching both CUE-OUT/IN segments.

	--outdir=[relative path to the directory]
	If specified, the fetched segment files are stored in the directory. The defalut outputdir path is "./log_YYYY-MM-DDTHH:MM:SS.SSSZ".

	--outfile=[filename]
	If specified, the fetched segment files are concatenated into a single file using FFmpeg. If not specified, the concatenation is skipped.
Example:
	$ fetch-scte-segments "https://example.com/live.m3u8?last-hour=6" --cue-in-only --outdir=SCTE_2023-01-01 --outfile=concatenated.ts
        $ open SCTE_2023-01-01/concatenated.ts
```
* _Please make sure that FFmpeg is installed in case the `--outfile` option is specified._
