# Rail Drift Wallpaper

An animated high top-down train wallpaper for Wallpaper Engine. The map now reads more like a tiny Earth-atlas view, with varied land biomes, a slim northern coastline, narrow rivers, small lakes, and boats moving through the waterways. The railway is a loop-safe dynamic network: stations are graph nodes, tracks are graph edges, and every active main route has a return path.

Tracks appear in stages: survey marks, construction, active rails, then optional dismantling. Trains bias toward longer station-to-station routes across the currently active network, stop briefly at stations, then choose new far destinations. Each track now behaves like a tiny two-lane corridor, so opposite-direction trains can pass. A forgiving signal system slows or briefly holds trains when another train is too close ahead, then lets traffic creep through so the wallpaper never deadlocks.

Roads, boat lanes, and rails are visually separated and scaled for a farther-away map view. Rail-road intersections become underpasses/crossings, rail-over-water spans get short bridge decks and guard rails, and boats run underneath the bridge layer instead of fighting the trains for the same space.

The generator keeps scenery off water, clears trees, buildings, and freight yards away from rail corridors, rejects long water crossings, and filters out messy rail overlaps so tracks read like an organized miniature transport map instead of a tangle.

## Run Locally

Open `index.html` in a browser.

For browser previews, you can use URL parameters such as:

`?networkactivity=1.8&mouseinfluence=2&stationcount=28&traincount=30&miniaturescale=0.5`

## Interaction

Move the mouse to choose a build point, then click to create one loop-safe construction beacon there. The generator still validates the network shape so new tracks either complete organized loops, create outer express arcs, or connect a temporary station through at least two exits.

## Import Into Wallpaper Engine

1. Open Wallpaper Engine.
2. Choose **Create Wallpaper**.
3. Drag `index.html` from this folder into the editor.
4. Wallpaper Engine will copy the folder and use `project.json` for the configurable properties and preview image.

## Wallpaper Controls

Controls include train speed, train count, station count, world detail, network activity, click-built tracks, track dismantling, view altitude, train colors, night mode, water color, traffic, weather, camera drift, and cinematic effects.
