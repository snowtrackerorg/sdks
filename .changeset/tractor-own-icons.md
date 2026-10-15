---
'@snowtrackerpro/sdk-core': patch
'@snowtrackerpro/sdk-tracking-react': patch
---

A tractor can carry the icon its driver picked. `TrackingTractor` gains `iconUrl: string | null` (an http(s) URL of a small PNG; anything else, or an older API that omits `icon_url`, reads as null). `<LiveTracker>` draws that image centred on the tractor's position, without the heading arrow, and falls back to the preset glyph from `icon` when there is no URL or the image fails to load. A broke-down tractor keeps the red wrench badge, drawn over the picked image.
