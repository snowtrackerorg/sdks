---
'@snowtrackerpro/sdk-core': patch
'@snowtrackerpro/sdk-tracking-react': patch
---

A tractor whose driver has marked it broke down is now drawn with a red wrench on its marker and "Broke down" in its caption (`labels.brokeDown` to translate). `TrackingTractor` gains `status: 'on_route' | 'broke_down'` (new type `TrackingTractorStatus`); a server that sends no status reads as `on_route`.
