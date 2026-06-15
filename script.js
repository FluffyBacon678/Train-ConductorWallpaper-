(() => {
  "use strict";

  const canvas = document.getElementById("rail-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const background = document.createElement("canvas");
  const bg = background.getContext("2d", { alpha: false });

  const TAU = Math.PI * 2;
  const BASE_GAUGE = 6.4;

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    lastTime: performance.now(),
    lastFrameAt: performance.now(),
    backgroundDirty: true,
    stations: [],
    edges: [],
    groups: [],
    trains: [],
    roads: [],
    roadCars: [],
    boatRoutes: [],
    boats: [],
    scenery: [],
    yards: [],
    weatherParticles: [],
    constructionTimer: 1.5,
    mouse: { x: 0, y: 0, activeUntil: 0 },
    forceBuild: false,
    nextDebugReport: 0,
    seed: 61426
  };

  const settings = {
    speed: 1,
    trainCount: 20,
    stationCount: 23,
    density: 1.24,
    networkActivity: 1,
    mouseInfluence: 1,
    decaySpeed: 0.75,
    miniatureScale: 0.52,
    trafficDensity: 1.05,
    weather: "clear",
    weatherIntensity: 0.8,
    cameraDrift: 0.35,
    cinematicFx: 1,
    nightMode: false,
    signalGlow: true,
    palette: "classic",
    accent: { r: 67, g: 183, b: 194 }
  };

  const trainPalettes = {
    classic: ["#d83f31", "#1f2736", "#c27b37", "#2e614d", "#7f2c36", "#cfc7b2"],
    cargo: ["#aa4936", "#345f50", "#956138", "#5d5765", "#b58b3c", "#2e4057"],
    bright: ["#d64a3a", "#2f80b7", "#e4a72e", "#4a9d68", "#9a4da3", "#d9d2ba"]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function wrap(value, max) {
    return ((value % max) + max) % max;
  }

  function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function colorWithAlpha(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function accentColor(alpha = 1) {
    return `rgba(${settings.accent.r}, ${settings.accent.g}, ${settings.accent.b}, ${alpha})`;
  }

  function parseWallpaperColor(value) {
    if (typeof value !== "string") {
      return null;
    }

    const parts = value.trim().split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      return null;
    }

    return {
      r: Math.round(clamp(parts[0], 0, 1) * 255),
      g: Math.round(clamp(parts[1], 0, 1) * 255),
      b: Math.round(clamp(parts[2], 0, 1) * 255)
    };
  }

  function gauge() {
    return BASE_GAUGE * settings.miniatureScale;
  }

  function worldScale() {
    return clamp(settings.miniatureScale, 0.42, 1);
  }

  function trainScale() {
    return worldScale() * 0.66;
  }

  function sceneryScale() {
    return clamp(worldScale() / 0.68, 0.58, 1.08);
  }

  function roadOuterWidth() {
    return Math.max(5.5, 14 * worldScale());
  }

  function roadInnerWidth() {
    return Math.max(3.5, roadOuterWidth() * 0.58);
  }

  function resize() {
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(240, window.innerHeight);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    state.width = width;
    state.height = height;
    state.dpr = dpr;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    background.width = canvas.width;
    background.height = canvas.height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.imageSmoothingEnabled = false;
    bg.imageSmoothingEnabled = false;

    buildWorld();
  }

  function buildWorld() {
    state.seed = 61426 + Math.round(state.width * 0.7 + state.height * 1.3);
    state.stations = [];
    state.edges = [];
    state.groups = [];
    state.trains = [];
    state.constructionTimer = 1.2;

    buildTerrainDetails();
    buildRailGraph();
    clearSceneryFromRails();
    buildTrains();
    buildWeather();
    state.backgroundDirty = true;
  }

  function buildTerrainDetails() {
    const rand = seededRandom(state.seed + 9);
    const w = state.width;
    const h = state.height;
    state.roads = [
      makeRoad([
        { x: -w * 0.04, y: h * 0.72 },
        { x: w * 0.20, y: h * 0.67 },
        { x: w * 0.48, y: h * 0.78 },
        { x: w * 0.73, y: h * 0.66 },
        { x: w * 1.04, y: h * 0.80 }
      ], 38),
      makeRoad([
        { x: w * 0.30, y: -h * 0.04 },
        { x: w * 0.33, y: h * 0.24 },
        { x: w * 0.44, y: h * 0.48 },
        { x: w * 0.41, y: h * 1.04 }
      ], 32),
      makeRoad([
        { x: w * 0.76, y: -h * 0.04 },
        { x: w * 0.70, y: h * 0.23 },
        { x: w * 0.78, y: h * 0.46 },
        { x: w * 0.77, y: h * 1.04 }
      ], 34)
    ];
    buildRoadCars(rand);
    buildBoatRoutes(w, h);
    buildBoats(rand);

    state.yards = makeYardRects();

    const count = Math.round((w * h) / 7200 * settings.density);
    state.scenery = [];
    for (let i = 0; i < count; i += 1) {
      let x = 0;
      let y = 0;
      let accepted = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        x = rand() * w;
        y = rand() * h;
        if (canPlaceScenery(x, y)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        continue;
      }
      const town = x > w * 0.36 && x < w * 0.65 && y > h * 0.30 && y < h * 0.73;
      state.scenery.push({
        type: town && rand() > 0.42 ? "building" : "tree",
        x,
        y,
        scale: (0.34 + rand() * 0.56) * sceneryScale(),
        tone: rand()
      });
    }
  }

  function clearSceneryFromRails() {
    state.scenery = state.scenery.filter((item) => !isNearRailPath(item.x, item.y, item.type === "building" ? 24 : 10));
  }

  function makeOpenPath(points, samplesPerSegment) {
    const samples = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let step = 0; step < samplesPerSegment; step += 1) {
        samples.push(catmull(p0, p1, p2, p3, step / samplesPerSegment));
      }
    }
    samples.push(points[points.length - 1]);
    return samples;
  }

  function makeRoad(points, speed) {
    const roadPoints = makeOpenPath(points, 22);
    const metrics = measurePoints(roadPoints);
    return { points: roadPoints, length: metrics.length, cumulative: metrics.cumulative, speed };
  }

  function buildRoadCars(rand) {
    const count = clamp(Math.round((state.width * state.height) / 115000 * settings.trafficDensity), 0, 32);
    const colors = ["#e8d75f", "#d8463c", "#275f8f", "#e6e8df", "#2e8757", "#b95888"];
    state.roadCars = [];
    for (let i = 0; i < count; i += 1) {
      const road = state.roads[i % state.roads.length];
      state.roadCars.push({
        roadIndex: i % state.roads.length,
        distance: rand() * road.length,
        speed: road.speed * (0.75 + (i % 5) * 0.12) * (i % 3 === 0 ? -1 : 1),
        color: colors[i % colors.length],
        length: i % 4 === 0 ? 13 : 9,
        width: i % 4 === 0 ? 5.8 : 4.2
      });
    }
  }

  function buildBoatRoutes(w, h) {
    const coastStops = [0.04, 0.24, 0.47, 0.72, 0.96].map((xFactor) => {
      const x = w * xFactor;
      return { x, y: atlasCoastlineY(x) * 0.48 };
    });
    const mainRiverStops = [];
    for (let i = 0; i <= 5; i += 1) {
      const y = h * (0.09 + i * 0.19);
      mainRiverStops.push({ x: atlasMainRiverX(y), y });
    }
    const tributaryEnd = atlasTributaryConfluenceX() / w;
    const tributaryStops = [0.05, 0.18, 0.32, Math.max(0.36, tributaryEnd - 0.035), tributaryEnd].map((xFactor) => {
      const x = w * xFactor;
      return { x, y: atlasTributaryY(x) };
    });

    state.boatRoutes = [
      makeBoatRoute([
        { x: -w * 0.04, y: coastStops[0].y },
        ...coastStops,
        { x: w * 1.04, y: coastStops[coastStops.length - 1].y }
      ], 15),
      makeBoatRoute(mainRiverStops, 10),
      makeBoatRoute(tributaryStops, 8)
    ];
  }

  function makeBoatRoute(points, speed) {
    const lanePoints = makeOpenPath(points, 24);
    const metrics = measurePoints(lanePoints);
    return { points: lanePoints, length: metrics.length, cumulative: metrics.cumulative, speed };
  }

  function makeYardRects() {
    const footprint = clamp(0.48 + worldScale() * 0.24, 0.56, 0.74);
    return [
      makeRectZone(0.13, 0.145, 0.16 * footprint, 0.085 * footprint),
      makeRectZone(0.73, 0.115, 0.20 * footprint, 0.09 * footprint),
      makeRectZone(0.43, 0.80, 0.145 * footprint, 0.085 * footprint)
    ];
  }

  function makeRectZone(x, y, w, h) {
    return {
      x: state.width * x,
      y: state.height * y,
      w: state.width * w,
      h: state.height * h
    };
  }

  function canPlaceScenery(x, y) {
    if (isWaterPoint({ x, y }) || isNearAnyYard(x, y, 18)) {
      return false;
    }
    return state.scenery.every((item) => Math.hypot(item.x - x, item.y - y) > 10);
  }

  function atlasMinDim() {
    return Math.max(1, Math.min(state.width, state.height));
  }

  function atlasCoastlineY(x) {
    const w = Math.max(1, state.width);
    const h = Math.max(1, state.height);
    const t = clamp(x / w, 0, 1);
    const westGulf = 0.038 * Math.exp(-1 * (((t - 0.14) / 0.105) ** 2));
    const eastBay = 0.062 * Math.exp(-1 * (((t - 0.86) / 0.095) ** 2));
    const ripple = 0.012 * Math.sin(t * TAU * 1.6 + 0.55) + 0.008 * Math.sin(t * TAU * 4.4 + 1.2);
    return h * clamp(0.052 + westGulf + eastBay + ripple, 0.034, 0.145);
  }

  function atlasMainRiverX(y) {
    const h = Math.max(1, state.height);
    const w = Math.max(1, state.width);
    const t = clamp(y / h, 0, 1);
    return w * (0.515 + 0.035 * Math.sin(t * TAU * 1.05 + 0.66) + 0.018 * Math.sin(t * TAU * 2.65 + 2.1));
  }

  function atlasMainRiverHalfWidth(y) {
    const t = clamp(y / Math.max(1, state.height), 0, 1);
    return atlasMinDim() * (0.014 + 0.009 * Math.sin(t * Math.PI) ** 2);
  }

  function atlasTributaryY(x) {
    const w = Math.max(1, state.width);
    const h = Math.max(1, state.height);
    const t = clamp(x / w, 0, 1);
    return h * (0.565 + 0.026 * Math.sin(t * TAU * 1.25 + 1.35) + 0.012 * Math.sin(t * TAU * 3.3));
  }

  function atlasTributaryHalfWidth(x) {
    const t = clamp(x / Math.max(1, state.width), 0, 1);
    return atlasMinDim() * (0.008 + 0.004 * Math.sin(t * Math.PI));
  }

  function atlasTributaryConfluenceX() {
    const w = Math.max(1, state.width);
    let bestX = w * 0.48;
    let bestGap = Infinity;
    for (let i = 0; i <= 64; i += 1) {
      const x = w * (0.36 + i / 64 * 0.22);
      const y = atlasTributaryY(x);
      const gap = Math.abs(x - (atlasMainRiverX(y) - atlasMainRiverHalfWidth(y) * 0.88));
      if (gap < bestGap) {
        bestGap = gap;
        bestX = x;
      }
    }
    return bestX;
  }

  function atlasLakes() {
    const w = Math.max(1, state.width);
    const h = Math.max(1, state.height);
    const s = atlasMinDim();
    return [
      { x: w * 0.185, y: h * 0.365, rx: s * 0.036, ry: s * 0.019, angle: -0.25 },
      { x: w * 0.815, y: h * 0.315, rx: s * 0.033, ry: s * 0.020, angle: 0.32 },
      { x: w * 0.705, y: h * 0.785, rx: s * 0.027, ry: s * 0.015, angle: -0.34 }
    ];
  }

  function pointInLake(point, lake, padding = 0) {
    const cos = Math.cos(-lake.angle);
    const sin = Math.sin(-lake.angle);
    const dx = point.x - lake.x;
    const dy = point.y - lake.y;
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    return (x * x) / ((lake.rx + padding) ** 2) + (y * y) / ((lake.ry + padding) ** 2) <= 1;
  }

  function buildBoats(rand) {
    const count = clamp(Math.round(2 + settings.cinematicFx * 3), 1, 7);
    const colors = ["#f4e5b5", "#b54a3f", "#2f6a91", "#e7d078", "#2f7d63"];
    state.boats = [];
    for (let i = 0; i < count; i += 1) {
      const route = state.boatRoutes[i % state.boatRoutes.length];
      state.boats.push({
        routeIndex: i % state.boatRoutes.length,
        distance: rand() * route.length,
        speed: route.speed * (0.75 + (i % 4) * 0.14) * (i % 2 === 0 ? 1 : -1),
        color: colors[i % colors.length],
        length: i % 2 === 0 ? 22 : 17,
        width: i % 2 === 0 ? 7 : 5.4
      });
    }
  }

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function buildRailGraph() {
    const rand = seededRandom(state.seed + 101);
    const w = state.width;
    const h = state.height;
    const targetStations = clamp(Math.round(settings.stationCount), 10, 34);
    const ringCount = clamp(Math.round(targetStations * 0.72), 8, 26);
    const innerCount = targetStations - ringCount;
    const center = { x: w * 0.50, y: h * 0.54 };
    const rx = w * 0.46;
    const ry = h * 0.39;
    const ringIds = [];

    for (let i = 0; i < ringCount; i += 1) {
      const angle = -Math.PI / 2 + i / ringCount * TAU;
      const wobble = 0.96 + rand() * 0.07;
      const x = center.x + Math.cos(angle) * rx * wobble + (rand() - 0.5) * w * 0.012;
      const y = center.y + Math.sin(angle) * ry * wobble + (rand() - 0.5) * h * 0.018;
      ringIds.push(addStation(x, y, { core: true, ring: true, kind: "ring", angle, name: `J${i + 1}` }));
    }

    for (let i = 0; i < ringIds.length; i += 1) {
      const a = stationById(ringIds[i]);
      const b = stationById(ringIds[(i + 1) % ringIds.length]);
      addEdge(a.id, b.id, {
        core: true,
        state: "active",
        progress: 1,
        group: "core-ring",
        allowProtected: true,
        allowLongBridge: true,
        avoidCrossings: false,
        bend: ringBend(a, b, center)
      });
    }

    for (let i = 0; i < innerCount; i += 1) {
      const angle = -Math.PI / 2 + (i + 0.5) / Math.max(1, innerCount) * TAU + (rand() - 0.5) * 0.16;
      const radius = 0.34 + (i % 2) * 0.15 + (rand() - 0.5) * 0.035;
      const x = center.x + Math.cos(angle) * rx * radius + (rand() - 0.5) * w * 0.018;
      const y = center.y + Math.sin(angle) * ry * radius + (rand() - 0.5) * h * 0.018;
      const stationId = addStation(x, y, { core: true, inner: true, kind: "inner", angle, radius, name: `S${ringCount + i + 1}` });
      const anchorIndex = ringIndexForAngle(angle, ringCount);
      const neighborOffset = i % 2 === 0 ? 1 : -1;
      const anchors = [
        stationById(ringIds[anchorIndex]),
        stationById(ringIds[positiveModulo(anchorIndex + neighborOffset, ringCount)])
      ].filter(Boolean);
      const group = `core-pocket-${i}`;
      const added = [];
      for (const anchor of anchors) {
        const edge = addEdge(stationId, anchor.id, {
          core: true,
          state: "active",
          progress: 1,
          group,
          bend: softBend(stationById(stationId), anchor, 0.08 + rand() * 0.05)
        });
        if (edge) added.push(edge);
      }
      if (added.length < 2) {
        state.edges = state.edges.filter((edge) => edge.group !== group);
        state.stations = state.stations.filter((station) => station.id !== stationId);
      }
    }

    const expressCount = Math.max(2, Math.round(targetStations * 0.14));
    for (let i = 0; i < expressCount; i += 1) {
      const aIndex = Math.floor(i * ringCount / expressCount);
      const step = Math.max(3, Math.round(ringCount * (0.18 + (i % 2) * 0.035)));
      const a = stationById(ringIds[aIndex]);
      const b = stationById(ringIds[positiveModulo(aIndex + step, ringCount)]);
      if (a && b && a.id !== b.id && !hasEdge(a.id, b.id)) {
        addEdge(a.id, b.id, {
          core: true,
          state: "active",
          progress: 1,
          group: `core-shortcut-${i}`,
          bend: ringBend(a, b, center) * 1.45
        });
      }
    }
  }

  function positiveModulo(value, max) {
    return ((value % max) + max) % max;
  }

  function ringIndexForAngle(angle, ringCount) {
    const normalized = positiveModulo(angle + Math.PI / 2, TAU);
    return positiveModulo(Math.round(normalized / TAU * ringCount), ringCount);
  }

  function ringBend(a, b, center) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / dist;
    const ny = dx / dist;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const outward = Math.sign(nx * (mid.x - center.x) + ny * (mid.y - center.y)) || 1;
    return outward * dist * 0.12;
  }

  function softBend(a, b, amount) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const centerSign = (a.x + b.x) / 2 < state.width / 2 ? 1 : -1;
    return centerSign * dist * amount;
  }

  function addStation(x, y, options = {}) {
    const id = `station-${state.stations.length}`;
    state.stations.push({
      id,
      x: clamp(x, state.width * 0.04, state.width * 0.96),
      y: clamp(y, state.height * 0.06, state.height * 0.94),
      core: Boolean(options.core),
      temporary: Boolean(options.temporary),
      ring: Boolean(options.ring),
      inner: Boolean(options.inner),
      kind: options.kind || (options.temporary ? "temporary" : "station"),
      angle: options.angle ?? null,
      radius: options.radius ?? null,
      group: options.group || null,
      state: "active",
      pulse: 0,
      name: options.name || id
    });
    return id;
  }

  function addEdge(aId, bId, options = {}) {
    if (aId === bId || hasEdge(aId, bId)) {
      return null;
    }

    const a = stationById(aId);
    const b = stationById(bId);
    if (!a || !b) {
      return null;
    }

    const id = `edge-${state.edges.length}-${aId}-${bId}`;
    const points = makeEdgePoints(a, b, options.bend ?? 0);
    if (!edgeIsAcceptable(points, a, b, options)) {
      return null;
    }
    const metrics = measurePoints(points);
    const edge = {
      id,
      a: aId,
      b: bId,
      group: options.group || id,
      core: Boolean(options.core),
      state: options.state || "surveying",
      progress: options.progress ?? 0,
      points,
      length: metrics.length,
      cumulative: metrics.cumulative,
      lastUsed: state.time,
      age: 0,
      hue: options.hue || 0
    };
    state.edges.push(edge);
    return edge;
  }

  function edgeIsAcceptable(points, a, b, options) {
    const minSpan = Math.min(state.width, state.height);
    const allowProtected = Boolean(options.allowProtected);
    const allowLongBridge = Boolean(options.allowLongBridge);
    const avoidCrossings = options.avoidCrossings !== false;

    if (!allowProtected && pathHitsProtectedZone(points, a, b)) {
      return false;
    }

    if (!allowLongBridge && longestWaterRun(points) > minSpan * 0.16) {
      return false;
    }

    if (avoidCrossings && hasMessyRailConflict(points, a, b)) {
      return false;
    }

    return true;
  }

  function pathHitsProtectedZone(points, a, b) {
    return pathHitsYard(points, a, b) || pathHitsBuilding(points, a, b);
  }

  function pathHitsYard(points, a, b) {
    for (let i = 1; i < points.length - 1; i += 1) {
      const point = points[i];
      if (Math.hypot(point.x - a.x, point.y - a.y) < 24 || Math.hypot(point.x - b.x, point.y - b.y) < 24) {
        continue;
      }
      if (isNearAnyYard(point.x, point.y, 12)) {
        return true;
      }
    }
    return false;
  }

  function pathHitsBuilding(points, a, b) {
    for (let i = 1; i < points.length - 1; i += 1) {
      const point = points[i];
      if (Math.hypot(point.x - a.x, point.y - a.y) < 24 || Math.hypot(point.x - b.x, point.y - b.y) < 24) {
        continue;
      }
      if (isNearBuilding(point.x, point.y, 18)) {
        return true;
      }
    }
    return false;
  }

  function longestWaterRun(points) {
    let longest = 0;
    let current = 0;
    for (let i = 1; i < points.length; i += 1) {
      const segment = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (isWaterPoint(points[i]) || isWaterPoint(points[i - 1])) {
        current += segment;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
    return longest;
  }

  function hasMessyRailConflict(points, a, b) {
    for (const edge of state.edges) {
      const sharedEndpoint = edge.a === a.id || edge.b === a.id || edge.a === b.id || edge.b === b.id;
      for (let i = 1; i < points.length; i += 1) {
        const p0 = points[i - 1];
        const p1 = points[i];
        for (let j = 1; j < edge.points.length; j += 1) {
          const q0 = edge.points[j - 1];
          const q1 = edge.points[j];
          const hit = segmentIntersection(p0, p1, q0, q1);
          if (hit && !sharedEndpoint && !nearAnyStation(hit, 30)) {
            return true;
          }

          if (!sharedEndpoint && segmentMidDistance(p0, p1, q0, q1) < gauge() * 2.6 && segmentAngleGap(p0, p1, q0, q1) < 0.22) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function makeEdgePoints(a, b, bend) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / dist;
    const ny = dx / dist;
    const c1 = {
      x: a.x + dx * 0.33 + nx * bend,
      y: a.y + dy * 0.33 + ny * bend
    };
    const c2 = {
      x: a.x + dx * 0.67 + nx * bend,
      y: a.y + dy * 0.67 + ny * bend
    };

    const samples = Math.max(14, Math.min(44, Math.round(dist / 28)));
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const mt = 1 - t;
      points.push({
        x: mt ** 3 * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * b.x,
        y: mt ** 3 * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * b.y
      });
    }
    return points;
  }

  function measurePoints(points) {
    const cumulative = [0];
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      cumulative.push(length);
    }
    return { length, cumulative };
  }

  function stationById(id) {
    return state.stations.find((station) => station.id === id);
  }

  function edgeById(id) {
    return state.edges.find((edge) => edge.id === id);
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function isNearAnyYard(x, y, padding = 0) {
    return state.yards.some((yard) => (
      x > yard.x - yard.w / 2 - padding &&
      x < yard.x + yard.w / 2 + padding &&
      y > yard.y - yard.h / 2 - padding &&
      y < yard.y + yard.h / 2 + padding
    ));
  }

  function isNearBuilding(x, y, radius = 16) {
    return state.scenery.some((item) => item.type === "building" && Math.hypot(item.x - x, item.y - y) < radius + item.scale * 8);
  }

  function isNearRailPath(x, y, radius) {
    const point = { x, y };
    for (const edge of state.edges) {
      if (edge.state === "dismantling") {
        continue;
      }
      for (let i = 1; i < edge.points.length; i += 1) {
        if (distanceToSegment(point, edge.points[i - 1], edge.points[i]) < radius) {
          return true;
        }
      }
    }
    return false;
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  }

  function nearAnyStation(point, radius) {
    return state.stations.some((station) => Math.hypot(station.x - point.x, station.y - point.y) < radius);
  }

  function segmentMidDistance(a, b, c, d) {
    const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const q = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  function segmentAngleGap(a, b, c, d) {
    const angleA = Math.atan2(b.y - a.y, b.x - a.x);
    const angleB = Math.atan2(d.y - c.y, d.x - c.x);
    const diff = Math.abs(Math.atan2(Math.sin(angleA - angleB), Math.cos(angleA - angleB)));
    return Math.min(diff, Math.abs(Math.PI - diff));
  }

  function hasEdge(aId, bId) {
    return state.edges.some((edge) => (edge.a === aId && edge.b === bId) || (edge.a === bId && edge.b === aId));
  }

  function nearestStations(x, y, count, exclude = [], minSeparation = 80) {
    const banned = new Set(exclude);
    const candidates = state.stations
      .filter((station) => station.state !== "dismantling" && !banned.has(station.id))
      .map((station) => ({ station, dist: Math.hypot(station.x - x, station.y - y) }))
      .sort((a, b) => a.dist - b.dist);
    const picked = [];
    for (const item of candidates) {
      if (picked.every((other) => distance(item.station, other) > minSeparation)) {
        picked.push(item.station);
      }
      if (picked.length >= count) {
        break;
      }
    }
    return picked;
  }

  function buildTrains() {
    const colors = trainPalettes[settings.palette] || trainPalettes.classic;
    const count = clamp(Math.round(settings.trainCount), 1, 36);
    const stations = activeStations();
    state.trains = [];

    for (let i = 0; i < count; i += 1) {
      const station = stations[i % stations.length];
      const train = {
        id: `train-${i}`,
        stationId: station.id,
        destinationId: null,
        path: [],
        pathIndex: 0,
        distance: 0,
        wait: 0.35 + (i % 5) * 0.18,
        speed: 19 + (i % 6) * 2.4,
        speedFactor: 1,
        signalHold: false,
        signalWait: 0,
        color: colors[i % colors.length],
        trim: colors[(i + 2) % colors.length],
        cars: 3 + (i % 4),
        arrived: 0
      };
      pickTrainRoute(train, i);
      state.trains.push(train);
    }
  }

  function activeStations() {
    return state.stations.filter((station) => station.state === "active");
  }

  function buildWeather() {
    const particles = [];
    if (settings.weather === "clear" || settings.weatherIntensity <= 0) {
      state.weatherParticles = particles;
      return;
    }

    const rand = seededRandom(state.seed + 404);
    const base = settings.weather === "snow" ? 11500 : 6200;
    const count = clamp(Math.round((state.width * state.height) / base * settings.weatherIntensity), 10, 280);
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: rand() * state.width,
        y: rand() * state.height,
        speed: settings.weather === "snow" ? 15 + rand() * 25 : 300 + rand() * 180,
        drift: settings.weather === "snow" ? -18 + rand() * 36 : -90 + rand() * 50,
        size: settings.weather === "snow" ? 1 + rand() * 2.2 : 8 + rand() * 10,
        phase: rand() * TAU,
        alpha: 0.25 + rand() * 0.45
      });
    }
    state.weatherParticles = particles;
  }

  function renderBackground() {
    if (!state.backgroundDirty) {
      return;
    }

    bg.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    bg.clearRect(0, 0, state.width, state.height);
    drawTerrain(bg);
    drawWater(bg);
    drawRoads(bg);
    drawScenery(bg);
    drawYards(bg);
    state.backgroundDirty = false;
  }

  function drawTerrain(target) {
    const w = state.width;
    const h = state.height;
    const gradient = target.createLinearGradient(0, 0, w, h);
    if (settings.nightMode) {
      gradient.addColorStop(0, "#0a1b24");
      gradient.addColorStop(0.46, "#173127");
      gradient.addColorStop(1, "#2b3026");
    } else {
      gradient.addColorStop(0, "#6aa576");
      gradient.addColorStop(0.42, "#9dbc6e");
      gradient.addColorStop(0.72, "#b49a68");
      gradient.addColorStop(1, "#668e6e");
    }
    target.fillStyle = gradient;
    target.fillRect(0, 0, w, h);

    drawEarthLandforms(target);
    drawFields(target);

    target.globalAlpha = 1;
  }

  function drawEarthLandforms(target) {
    const patches = settings.nightMode
      ? [
          [0.18, 0.30, 0.23, 0.18, -0.35, "#253d32", "#445845", 0.45],
          [0.68, 0.24, 0.28, 0.17, 0.18, "#303a32", "#5a5e4b", 0.42],
          [0.78, 0.66, 0.25, 0.20, -0.22, "#3a3425", "#695d3c", 0.36],
          [0.34, 0.76, 0.25, 0.16, 0.10, "#213b38", "#405c55", 0.34]
        ]
      : [
          [0.18, 0.30, 0.23, 0.18, -0.35, "#5f9b69", "#9db472", 0.32],
          [0.67, 0.23, 0.28, 0.17, 0.18, "#c0b678", "#8ea365", 0.30],
          [0.78, 0.66, 0.25, 0.20, -0.22, "#b9875d", "#d4bf77", 0.28],
          [0.33, 0.77, 0.26, 0.17, 0.10, "#4c9373", "#87b786", 0.24],
          [0.54, 0.48, 0.22, 0.15, 0.42, "#dde2c3", "#a7b789", 0.18]
        ];

    target.save();
    for (const patch of patches) {
      drawTerrainPatch(target, ...patch);
    }
    drawLatitudeMarks(target);
    target.restore();
  }

  function drawTerrainPatch(target, cxFactor, cyFactor, rxFactor, ryFactor, angle, fill, stroke, alpha) {
    const cx = state.width * cxFactor;
    const cy = state.height * cyFactor;
    const rx = state.width * rxFactor;
    const ry = state.height * ryFactor;
    const steps = 18;

    target.save();
    target.translate(cx, cy);
    target.rotate(angle);
    target.globalAlpha = alpha;
    target.fillStyle = fill;
    target.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const a = i / steps * TAU;
      const wobble = 1 + 0.10 * Math.sin(a * 2.8 + cxFactor * 8) + 0.06 * Math.sin(a * 5.1 + cyFactor * 11);
      const x = Math.cos(a) * rx * wobble;
      const y = Math.sin(a) * ry * wobble;
      if (i === 0) {
        target.moveTo(x, y);
      } else {
        target.lineTo(x, y);
      }
    }
    target.closePath();
    target.fill();

    target.globalAlpha = alpha * 0.74;
    target.strokeStyle = stroke;
    target.lineWidth = 1.2;
    for (let band = 0.42; band < 0.95; band += 0.18) {
      target.beginPath();
      for (let i = 0; i <= steps; i += 1) {
        const a = i / steps * TAU;
        const wobble = 1 + 0.07 * Math.sin(a * 3.2 + band * 5) + 0.035 * Math.sin(a * 6.0 + cxFactor * 4);
        const x = Math.cos(a) * rx * band * wobble;
        const y = Math.sin(a) * ry * band * wobble;
        if (i === 0) {
          target.moveTo(x, y);
        } else {
          target.lineTo(x, y);
        }
      }
      target.closePath();
      target.stroke();
    }
    target.restore();
  }

  function drawLatitudeMarks(target) {
    target.save();
    target.globalAlpha = settings.nightMode ? 0.09 : 0.13;
    target.strokeStyle = settings.nightMode ? "#8ba498" : "#f2e8ba";
    target.lineWidth = 1;
    target.setLineDash([8, 18]);
    for (let i = 1; i < 4; i += 1) {
      const y = state.height * (0.22 + i * 0.18);
      target.beginPath();
      target.moveTo(0, y);
      target.bezierCurveTo(state.width * 0.26, y - state.height * 0.04, state.width * 0.58, y + state.height * 0.04, state.width, y);
      target.stroke();
    }
    target.setLineDash([]);
    target.restore();
  }

  function drawFields(target) {
    const fields = [
      [0.06, 0.74, 0.18, 0.19, -0.08],
      [0.78, 0.76, 0.17, 0.18, 0.11],
      [0.08, 0.19, 0.18, 0.15, 0.05],
      [0.54, 0.16, 0.16, 0.13, 0.02],
      [0.86, 0.52, 0.13, 0.14, -0.05]
    ];

    for (const field of fields) {
      const [x, y, w, h, angle] = field;
      target.save();
      target.translate(state.width * x, state.height * y);
      target.rotate(angle);
      target.fillStyle = settings.nightMode ? "rgba(31, 61, 43, 0.72)" : "#82aa62";
      target.fillRect(-state.width * w / 2, -state.height * h / 2, state.width * w, state.height * h);
      target.globalAlpha = settings.nightMode ? 0.2 : 0.42;
      target.fillStyle = "#d7c96b";
      for (let row = -state.height * h / 2; row < state.height * h / 2; row += 14) {
        target.fillRect(-state.width * w / 2, row, state.width * w, 4);
      }
      target.globalAlpha = 1;
      target.strokeStyle = settings.nightMode ? "#253626" : "#d8d383";
      target.lineWidth = 2;
      target.strokeRect(-state.width * w / 2, -state.height * h / 2, state.width * w, state.height * h);
      target.restore();
    }
  }

  function drawWater(target) {
    const w = state.width;
    const h = state.height;
    const water = settings.nightMode ? "#123845" : accentColor(0.78);
    const deep = settings.nightMode ? "#0c2731" : "#3fa6b4";
    const edge = settings.nightMode ? "#30544e" : "#3f8a6f";
    const sand = settings.nightMode ? "rgba(109, 101, 70, 0.42)" : "rgba(234, 211, 134, 0.62)";

    target.save();
    drawNorthCoast(target, deep, water, edge, sand);
    drawLakeSet(target, water, edge, sand);
    drawAtlasRiver(target, atlasTributarySamples(52), water, edge, sand);
    drawAtlasRiver(target, atlasMainRiverSamples(72), water, edge, sand);
    target.restore();
  }

  function drawNorthCoast(target, deep, water, edge, sand) {
    const w = state.width;
    const h = state.height;
    target.beginPath();
    target.moveTo(0, 0);
    target.lineTo(w, 0);
    target.lineTo(w, atlasCoastlineY(w));
    for (let i = 64; i >= 0; i -= 1) {
      const x = w * i / 64;
      target.lineTo(x, atlasCoastlineY(x));
    }
    target.closePath();
    target.fillStyle = deep;
    target.fill();

    target.globalAlpha = settings.nightMode ? 0.26 : 0.32;
    target.strokeStyle = water;
    target.lineWidth = Math.max(8, atlasMinDim() * 0.024);
    target.lineCap = "round";
    target.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const x = w * i / 64;
      const y = Math.max(h * 0.018, atlasCoastlineY(x) * 0.55);
      if (i === 0) {
        target.moveTo(x, y);
      } else {
        target.lineTo(x, y);
      }
    }
    target.stroke();
    target.globalAlpha = 1;

    target.strokeStyle = sand;
    target.lineWidth = Math.max(1, atlasMinDim() * 0.003);
    target.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const x = w * i / 64;
      const y = atlasCoastlineY(x) + atlasMinDim() * 0.004;
      if (i === 0) {
        target.moveTo(x, y);
      } else {
        target.lineTo(x, y);
      }
    }
    target.stroke();

    target.strokeStyle = edge;
    target.lineWidth = Math.max(1.2, atlasMinDim() * 0.0035);
    target.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const x = w * i / 64;
      const y = atlasCoastlineY(x);
      if (i === 0) {
        target.moveTo(x, y);
      } else {
        target.lineTo(x, y);
      }
    }
    target.stroke();
  }

  function atlasMainRiverSamples(count) {
    const points = [];
    for (let i = 0; i <= count; i += 1) {
      const y = state.height * (-0.02 + i / count * 1.06);
      points.push({ x: atlasMainRiverX(y), y, halfWidth: atlasMainRiverHalfWidth(y) });
    }
    return points;
  }

  function atlasTributarySamples(count) {
    const points = [];
    const endX = atlasTributaryConfluenceX();
    for (let i = 0; i <= count; i += 1) {
      const x = lerp(-state.width * 0.02, endX, i / count);
      points.push({ x, y: atlasTributaryY(x), halfWidth: atlasTributaryHalfWidth(x) });
    }
    return points;
  }

  function drawAtlasRiver(target, points, water, edge, sand) {
    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";
    for (let pass = 0; pass < 3; pass += 1) {
      if (pass === 0) {
        target.strokeStyle = sand;
      } else if (pass === 1) {
        target.strokeStyle = edge;
      } else {
        target.strokeStyle = water;
      }
      for (let i = 1; i < points.length; i += 1) {
        const width = points[i - 1].halfWidth + points[i].halfWidth;
        target.lineWidth = width + (pass === 0 ? atlasMinDim() * 0.012 : pass === 1 ? atlasMinDim() * 0.006 : 0);
        target.beginPath();
        target.moveTo(points[i - 1].x, points[i - 1].y);
        target.lineTo(points[i].x, points[i].y);
        target.stroke();
      }
    }
    target.restore();
  }

  function drawLakeSet(target, water, edge, sand) {
    for (const lake of atlasLakes()) {
      target.save();
      target.translate(lake.x, lake.y);
      target.rotate(lake.angle);
      target.fillStyle = sand;
      target.beginPath();
      target.ellipse(0, 0, lake.rx + atlasMinDim() * 0.006, lake.ry + atlasMinDim() * 0.005, 0, 0, TAU);
      target.fill();
      target.fillStyle = water;
      target.strokeStyle = edge;
      target.lineWidth = Math.max(1, atlasMinDim() * 0.003);
      target.beginPath();
      target.ellipse(0, 0, lake.rx, lake.ry, 0, 0, TAU);
      target.fill();
      target.stroke();
      target.restore();
    }
  }

  function drawRoads(target) {
    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";
    const outer = roadOuterWidth();
    const inner = roadInnerWidth();
    for (const road of state.roads) {
      target.globalAlpha = settings.nightMode ? 0.58 : 0.42;
      target.strokeStyle = settings.nightMode ? "#273231" : "#63745f";
      target.lineWidth = outer;
      strokePath(target, road.points, false);
      target.globalAlpha = settings.nightMode ? 0.46 : 0.34;
      target.strokeStyle = settings.nightMode ? "#56645f" : "#a4a77d";
      target.lineWidth = inner;
      strokePath(target, road.points, false);
      target.globalAlpha = 1;
    }
    target.restore();
  }

  function drawScenery(target) {
    for (const item of state.scenery) {
      if (item.type === "building") {
        drawTinyBuilding(target, item);
      } else {
        drawTinyTree(target, item);
      }
    }
  }

  function drawTinyTree(target, item) {
    target.save();
    target.translate(item.x, item.y);
    target.scale(item.scale, item.scale);
    target.fillStyle = settings.nightMode ? "#2d241d" : "#5b3b23";
    target.fillRect(-1, 4, 2, 6);
    target.fillStyle = settings.nightMode ? (item.tone > 0.5 ? "#244533" : "#1b3a2b") : (item.tone > 0.5 ? "#2d6f3e" : "#3f8745");
    target.beginPath();
    target.arc(-3, 0, 5, 0, TAU);
    target.arc(3, -2, 6, 0, TAU);
    target.arc(5, 3, 4, 0, TAU);
    target.arc(0, 4, 5, 0, TAU);
    target.fill();
    target.restore();
  }

  function drawTinyBuilding(target, item) {
    const size = 10 + item.tone * 9;
    target.save();
    target.translate(item.x, item.y);
    target.rotate((item.tone - 0.5) * 0.2);
    target.scale(item.scale, item.scale);
    target.fillStyle = colorWithAlpha("#000000", settings.nightMode ? 0.3 : 0.15);
    target.fillRect(-size / 2 + 2, -size / 2 + 3, size, size * 0.75);
    target.fillStyle = settings.nightMode ? "#3b4349" : "#e8dcc7";
    target.fillRect(-size / 2, -size / 2, size, size * 0.75);
    target.fillStyle = settings.nightMode ? "#293443" : (item.tone > 0.5 ? "#c85d4a" : "#e0bf5a");
    target.fillRect(-size / 2 - 2, -size / 2 - 2, size + 4, 5);
    if (settings.nightMode) {
      target.fillStyle = "#f0c96a";
      target.fillRect(-size / 5, -size / 8, 2, 3);
      target.fillRect(size / 8, -size / 8, 2, 3);
    }
    target.restore();
  }

  function drawYards(target) {
    const colors = settings.nightMode ? ["#5f2c33", "#304459", "#4d4730", "#2d4d42"] : ["#c94f40", "#2f6a91", "#d2a64a", "#397c61"];
    const crateW = 24 * worldScale();
    const crateH = 8 * worldScale();

    for (const yard of state.yards) {
      const { x, y, w, h } = yard;
      roundedRect(target, x - w / 2, y - h / 2, w, h, 6);
      target.fillStyle = settings.nightMode ? "#303235" : "#a6a191";
      target.fill();
      target.strokeStyle = settings.nightMode ? "#171b1e" : "#776f60";
      target.lineWidth = 2;
      target.stroke();
      let index = 0;
      for (let row = y - h / 2 + 10; row < y + h / 2 - 8; row += 13 * worldScale()) {
        for (let col = x - w / 2 + 10; col < x + w / 2 - crateW; col += 30 * worldScale()) {
          target.fillStyle = colors[index % colors.length];
          target.fillRect(col, row, crateW, crateH);
          index += 1;
        }
      }
    }
  }

  function update(now) {
    stepFrame(now);
    requestAnimationFrame(update);
  }

  function stepFrame(now) {
    const dt = Math.min(0.05, (now - state.lastTime) / 1000 || 0);
    state.lastTime = now;
    state.lastFrameAt = now;
    state.time += dt;

    renderBackground();
    updateNetwork(dt);
    updateTrains(dt);
    updateVehicles(dt);
    updateDebugReport();

    drawFrame();
  }

  function updateNetwork(dt) {
    for (const edge of state.edges) {
      edge.age += dt;
      if (edge.state === "surveying") {
        edge.progress += dt * (0.45 + settings.networkActivity * 0.2);
        if (edge.progress >= 1) {
          edge.state = "building";
          edge.progress = 0;
        }
      } else if (edge.state === "building") {
        edge.progress += dt * (0.30 + settings.networkActivity * 0.18);
        if (edge.progress >= 1) {
          edge.progress = 1;
          const group = state.groups.find((item) => item.id === edge.group);
          if (group && group.temporaryStationId) {
            edge.state = "pending";
            activateGroupIfReady(group);
          } else {
            edge.state = "active";
            edge.lastUsed = state.time;
          }
        }
      } else if (edge.state === "pending") {
        const group = state.groups.find((item) => item.id === edge.group);
        if (group) {
          activateGroupIfReady(group);
        }
      } else if (edge.state === "dismantling") {
        edge.progress -= dt * (0.36 + settings.networkActivity * 0.18);
      }
    }

    state.edges = state.edges.filter((edge) => edge.progress > 0 || edge.state !== "dismantling");
    state.groups = state.groups.filter((group) => state.edges.some((edge) => edge.group === group.id));
    for (const station of state.stations) {
      station.pulse = Math.max(0, station.pulse - dt);
    }
    state.stations = state.stations.filter((station) => station.core || state.edges.some((edge) => edge.a === station.id || edge.b === station.id));

    const activity = clamp(settings.networkActivity, 0, 2);
    state.constructionTimer -= dt * (0.45 + activity);
    if (state.forceBuild || state.constructionTimer <= 0) {
      proposeConstruction();
      state.forceBuild = false;
      state.constructionTimer = 2.8 / Math.max(0.35, 0.5 + activity) + Math.random() * 2.0;
    }

    maybeDismantleOptionalGroup(dt);
  }

  function activateGroupIfReady(group) {
    const groupEdges = state.edges.filter((edge) => edge.group === group.id && edge.state !== "dismantling");
    if (groupEdges.length === 0 || groupEdges.some((edge) => edge.progress < 1 || (edge.state !== "pending" && edge.state !== "active"))) {
      return false;
    }
    for (const edge of groupEdges) {
      edge.state = "active";
      edge.lastUsed = state.time;
    }
    return true;
  }

  function proposeConstruction() {
    const optionalGroups = state.groups.filter((group) => !group.core && !group.dismantling);
    const targetGroups = Math.round(3 + settings.networkActivity * 7);
    if (optionalGroups.length > targetGroups) {
      markOldestGroupForDismantle();
      return;
    }

    if (state.forceBuild) {
      if (settings.mouseInfluence > 0) {
        createPocketLoop(state.mouse.x, state.mouse.y, true);
      }
      return;
    }

    if (Math.random() < 0.35 && createShortcutLoop()) {
      return;
    }

    const x = state.width * (0.12 + Math.random() * 0.76);
    const y = state.height * (0.14 + Math.random() * 0.72);
    createPocketLoop(x, y, false);
  }

  function createPocketLoop(x, y, fromMouse) {
    const nearby = nearestStations(x, y, 2, [], Math.min(state.width, state.height) * 0.13);
    if (nearby.length < 2) {
      return false;
    }

    const nearestDistance = Math.min(...state.stations.map((station) => Math.hypot(station.x - x, station.y - y)));
    if (nearestDistance < Math.min(state.width, state.height) * 0.07) {
      x += (Math.random() - 0.5) * state.width * 0.10;
      y += (Math.random() - 0.5) * state.height * 0.10;
    }

    const span = Math.max(1, distance(nearby[0], nearby[1]));
    const mid = { x: (nearby[0].x + nearby[1].x) / 2, y: (nearby[0].y + nearby[1].y) / 2 };
    const nx = -(nearby[1].y - nearby[0].y) / span;
    const ny = (nearby[1].x - nearby[0].x) / span;
    const outward = Math.sign(nx * (mid.x - state.width / 2) + ny * (mid.y - state.height / 2)) || 1;
    const organized = {
      x: mid.x + nx * outward * Math.min(span * 0.24, Math.min(state.width, state.height) * 0.12),
      y: mid.y + ny * outward * Math.min(span * 0.24, Math.min(state.width, state.height) * 0.12)
    };
    const blend = fromMouse ? 0.32 : 0.82;
    x = lerp(x, organized.x, blend);
    y = lerp(y, organized.y, blend);

    const groupId = `loop-${Math.round(state.time * 1000)}-${state.groups.length}`;
    const stationId = addStation(x, y, { temporary: true, group: groupId, name: fromMouse ? "Beacon" : "Branch" });
    const newStation = stationById(stationId);
    const bendSign = fromMouse ? 1 : (Math.random() > 0.5 ? 1 : -1);
    const bendAmount = fromMouse ? 0.13 : 0.08;
    const e1 = addEdge(stationId, nearby[0].id, { group: groupId, bend: bendSign * distance(newStation, nearby[0]) * bendAmount, hue: fromMouse ? 1 : 0 });
    const e2 = addEdge(stationId, nearby[1].id, { group: groupId, bend: -bendSign * distance(newStation, nearby[1]) * bendAmount, hue: fromMouse ? 1 : 0 });

    if (!e1 || !e2) {
      state.edges = state.edges.filter((edge) => edge.group !== groupId);
      state.stations = state.stations.filter((station) => station.id !== stationId);
      return false;
    }

    state.groups.push({
      id: groupId,
      core: false,
      temporaryStationId: stationId,
      createdAt: state.time,
      lifespan: 24 + Math.random() * 40 + settings.networkActivity * 16,
      fromMouse
    });
    return true;
  }

  function createShortcutLoop() {
    const candidates = activeStations().filter((station) => station.ring);
    const center = { x: state.width * 0.50, y: state.height * 0.54 };
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const a = candidates[Math.floor(Math.random() * candidates.length)];
      const b = candidates[Math.floor(Math.random() * candidates.length)];
      if (!a || !b || a.id === b.id || hasEdge(a.id, b.id)) {
        continue;
      }
      const dist = distance(a, b);
      const angleGap = circularAngleGap(a.angle ?? 0, b.angle ?? 0);
      if (angleGap < 0.70 || angleGap > 2.35 || dist > Math.max(state.width, state.height) * 0.58) {
        continue;
      }

      const groupId = `shortcut-${Math.round(state.time * 1000)}-${state.groups.length}`;
      const edge = addEdge(a.id, b.id, { group: groupId, bend: ringBend(a, b, center) * 1.2 });
      if (!edge) {
        continue;
      }
      state.groups.push({
        id: groupId,
        core: false,
        createdAt: state.time,
        lifespan: 22 + Math.random() * 34 + settings.networkActivity * 14
      });
      return true;
    }
    return false;
  }

  function circularAngleGap(a, b) {
    const diff = Math.abs(positiveModulo(a - b + Math.PI, TAU) - Math.PI);
    return Math.min(diff, TAU - diff);
  }

  function maybeDismantleOptionalGroup(dt) {
    if (settings.decaySpeed <= 0) {
      return;
    }

    for (const group of state.groups) {
      if (group.core || group.dismantling) {
        continue;
      }
      group.createdAt += 0;
      const age = state.time - group.createdAt;
      if (age > group.lifespan / Math.max(0.15, settings.decaySpeed)) {
        markGroupForDismantle(group);
        return;
      }
    }

    if (Math.random() < dt * settings.decaySpeed * 0.18) {
      const optional = state.groups.filter((group) => !group.core && !group.dismantling);
      if (optional.length > 5 + settings.networkActivity * 5) {
        markOldestGroupForDismantle();
      }
    }
  }

  function markOldestGroupForDismantle() {
    const groups = state.groups
      .filter((group) => !group.core && !group.dismantling)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const group of groups) {
      if (markGroupForDismantle(group)) {
        return true;
      }
    }
    return false;
  }

  function markGroupForDismantle(group) {
    const groupEdges = state.edges.filter((edge) => edge.group === group.id);
    if (groupEdges.length === 0 || groupEdges.some((edge) => trainUsesEdge(edge.id))) {
      return false;
    }
    group.dismantling = true;
    for (const edge of groupEdges) {
      if (!edge.core) {
        edge.state = "dismantling";
        edge.progress = Math.min(edge.progress, 1);
      }
    }
    if (group.temporaryStationId) {
      const station = stationById(group.temporaryStationId);
      if (station) {
        station.state = "dismantling";
      }
    }
    return true;
  }

  function trainUsesEdge(edgeId) {
    return state.trains.some((train) => train.path[train.pathIndex] && train.path[train.pathIndex].edgeId === edgeId);
  }

  function updateTrains(dt) {
    for (const train of state.trains) {
      train.signalHold = false;
      train.speedFactor = train.wait > 0 ? 0 : 1;
      if (train.wait > 0) {
        train.wait -= dt;
        if (train.wait <= 0) {
          pickTrainRoute(train);
        }
        continue;
      }

      const step = train.path[train.pathIndex];
      const edge = step ? edgeById(step.edgeId) : null;
      if (!edge || edge.state !== "active") {
        train.wait = 1.2;
        pickTrainRoute(train);
        continue;
      }

      const block = trainBlockState(train, edge, step);
      train.signalHold = block.hold;
      train.speedFactor = block.factor;
      if (block.factor <= 0.02) {
        train.signalWait += dt;
        continue;
      }
      train.signalWait = 0;

      train.distance += train.speed * settings.speed * block.factor * dt;
      edge.lastUsed = state.time;
      if (train.distance >= edge.length) {
        const nextStep = train.path[train.pathIndex + 1];
        const nextEdge = nextStep ? edgeById(nextStep.edgeId) : null;
        if (nextStep && nextEdge && edgeEntryBlocked(train, nextStep, nextEdge)) {
          train.distance = Math.max(0, edge.length - 0.2);
          train.signalHold = true;
          train.speedFactor = 0;
          train.signalWait += dt;
          continue;
        }

        train.stationId = step.to;
        train.pathIndex += 1;
        train.distance = 0;
        if (train.pathIndex >= train.path.length) {
          const station = stationById(train.stationId);
          if (station) {
            station.pulse = 1;
          }
          train.wait = 0.8 + Math.random() * 1.3;
          train.path = [];
          train.pathIndex = 0;
          train.destinationId = null;
        }
      }
    }
  }

  function trainBlockState(train, edge, step) {
    const own = edgeCoordinate(train, edge, step);
    const stopGap = trainStopGap(train);
    const slowGap = stopGap * 2.15;
    let nearestGap = Infinity;

    for (const other of state.trains) {
      if (other === train || other.wait > 0) {
        continue;
      }

      const otherStep = other.path[other.pathIndex];
      if (!otherStep || otherStep.edgeId !== edge.id) {
        continue;
      }

      const otherPosition = edgeCoordinate(other, edge, otherStep);
      if (otherPosition.lane !== own.lane) {
        continue;
      }

      const ahead = (otherPosition.position - own.position) * own.direction;
      if (ahead > 0) {
        nearestGap = Math.min(nearestGap, ahead);
      }
    }

    if (!Number.isFinite(nearestGap)) {
      return { factor: 1, hold: false };
    }

    if (train.signalWait > trainReleaseTime(train)) {
      return { factor: 0.38, hold: false, released: true };
    }

    if (nearestGap <= stopGap) {
      return { factor: 0, hold: true };
    }

    const t = (nearestGap - stopGap) / Math.max(1, slowGap - stopGap);
    return { factor: clamp(0.18 + smoothstep(t) * 0.82, 0.18, 1), hold: false };
  }

  function edgeEntryBlocked(train, nextStep, nextEdge) {
    if (train.signalWait > trainReleaseTime(train)) {
      return false;
    }

    const enteringDirection = nextEdge.a === nextStep.from ? 1 : -1;
    const enteringLane = laneForStep(nextEdge, nextStep);
    const stopGap = trainStopGap(train);
    for (const other of state.trains) {
      if (other === train || other.wait > 0) {
        continue;
      }

      const otherStep = other.path[other.pathIndex];
      if (!otherStep || otherStep.edgeId !== nextEdge.id) {
        continue;
      }

      const otherPosition = edgeCoordinate(other, nextEdge, otherStep);
      if (otherPosition.lane !== enteringLane) {
        continue;
      }

      const distanceFromEntry = enteringDirection === 1 ? otherPosition.position : nextEdge.length - otherPosition.position;
      if (distanceFromEntry < stopGap * 1.55) {
        return true;
      }
    }
    return false;
  }

  function edgeCoordinate(train, edge, step) {
    const direction = edge.a === step.from ? 1 : -1;
    return {
      direction,
      lane: laneForStep(edge, step),
      position: direction === 1 ? train.distance : edge.length - train.distance
    };
  }

  function trainStopGap(train) {
    return 18 + train.cars * 4.2 * trainScale();
  }

  function trainReleaseTime(train) {
    return 1.45 + (trainNumericId(train) % 5) * 0.22;
  }

  function laneForStep(edge, step) {
    return edge.a === step.from ? 0 : 1;
  }

  function trainNumericId(train) {
    return Number.parseInt(train.id.replace("train-", ""), 10) || 0;
  }

  function pickTrainRoute(train, salt = 0) {
    const route = chooseLongRoute(train.stationId, salt);
    if (!route) {
      train.wait = 1.4;
      return;
    }

    train.destinationId = route.destinationId;
    train.path = route.path;
    train.pathIndex = 0;
    train.distance = 0;
  }

  function chooseLongRoute(fromId, salt = 0) {
    const origin = stationById(fromId);
    if (!origin) {
      return null;
    }

    const stations = activeStations().filter((station) => station.id !== fromId);
    if (stations.length === 0) {
      return null;
    }

    const mapSpan = Math.min(state.width, state.height);
    const candidates = [];
    for (const station of stations) {
      const path = findPath(fromId, station.id);
      if (path.length === 0) {
        continue;
      }
      const routeLength = pathDistance(path);
      const direct = distance(origin, station);
      candidates.push({
        station,
        path,
        routeLength,
        direct,
        score: routeLength + direct * 0.45 + Math.min(path.length, 7) * 85 + Math.random() * mapSpan * 0.12 + salt * 3.7
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    const longRoutes = candidates.filter((item) => item.routeLength > mapSpan * 0.68 || item.direct > mapSpan * 0.42 || item.path.length >= 4);
    const pool = longRoutes.length ? longRoutes : candidates;
    const topCount = clamp(Math.ceil(pool.length * 0.36), 1, Math.min(8, pool.length));
    const choice = pool[Math.floor(Math.random() * topCount)];
    return { destinationId: choice.station.id, path: choice.path };
  }

  function pathDistance(path) {
    let total = 0;
    for (const step of path) {
      const edge = edgeById(step.edgeId);
      if (edge) {
        total += edge.length;
      }
    }
    return total;
  }

  function findPath(fromId, toId) {
    if (fromId === toId) {
      return [];
    }

    const activeEdges = state.edges.filter((edge) => edge.state === "active");
    const dist = new Map();
    const prev = new Map();
    const unvisited = new Set(activeStations().map((station) => station.id));
    for (const id of unvisited) {
      dist.set(id, Infinity);
    }
    dist.set(fromId, 0);

    while (unvisited.size) {
      let current = null;
      let best = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id);
        if (d < best) {
          best = d;
          current = id;
        }
      }
      if (!current || current === toId) {
        break;
      }
      unvisited.delete(current);

      for (const edge of activeEdges) {
        let next = null;
        if (edge.a === current) next = edge.b;
        if (edge.b === current) next = edge.a;
        if (!next || !unvisited.has(next)) {
          continue;
        }
        const score = best + edge.length;
        if (score < dist.get(next)) {
          dist.set(next, score);
          prev.set(next, { station: current, edgeId: edge.id });
        }
      }
    }

    if (!prev.has(toId)) {
      return [];
    }

    const path = [];
    let cursor = toId;
    while (cursor !== fromId) {
      const item = prev.get(cursor);
      if (!item) {
        return [];
      }
      path.unshift({ edgeId: item.edgeId, from: item.station, to: cursor });
      cursor = item.station;
    }
    return path;
  }

  function updateVehicles(dt) {
    for (const car of state.roadCars) {
      const road = state.roads[car.roadIndex];
      car.distance = wrap(car.distance + car.speed * dt, road.length);
    }
    for (const boat of state.boats) {
      const route = state.boatRoutes[boat.routeIndex];
      boat.distance = wrap(boat.distance + boat.speed * dt, route.length);
    }
  }

  function drawFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const conflicts = collectTransportConflicts();
    ctx.save();
    applyCameraTransform(ctx);
    ctx.drawImage(background, 0, 0, state.width, state.height);
    drawWaterAmbience(ctx);
    drawBoats(ctx);
    drawRoadTraffic(ctx, conflicts);
    drawRoadUnderpasses(ctx, conflicts);
    drawWaterBridgeDecks(ctx, conflicts);
    drawTracks(ctx);
    drawCrossingDetails(ctx, conflicts);
    drawConstructionEffects(ctx);
    drawStations(ctx);
    drawTrains(ctx);
    drawMouseInfluence(ctx);
    ctx.restore();

    drawCinematicOverlay(ctx);
    drawWeather(ctx);
    drawVignette(ctx);
  }

  function applyCameraTransform(target) {
    const drift = clamp(settings.cameraDrift, 0, 1);
    if (drift <= 0) {
      return;
    }
    const zoom = 1 + drift * 0.025;
    const panX = Math.sin(state.time * 0.04) * state.width * 0.012 * drift;
    const panY = Math.cos(state.time * 0.035) * state.height * 0.012 * drift;
    target.translate(state.width / 2, state.height / 2);
    target.scale(zoom, zoom);
    target.translate(-state.width / 2 + panX, -state.height / 2 + panY);
  }

  function collectTransportConflicts() {
    const railRoad = [];
    const waterSpans = [];

    for (const edge of state.edges) {
      if (edge.state === "surveying") {
        continue;
      }
      const fraction = edge.state === "active" ? 1 : smoothstep(edge.progress);
      const points = partialPoints(edge, fraction);
      if (points.length < 2) {
        continue;
      }

      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        for (let roadIndex = 0; roadIndex < state.roads.length; roadIndex += 1) {
          const road = state.roads[roadIndex];
          for (let j = 1; j < road.points.length; j += 1) {
            const c = road.points[j - 1];
            const d = road.points[j];
            const hit = segmentIntersection(a, b, c, d);
            if (!hit) {
              continue;
            }
            if (railRoad.some((item) => Math.hypot(item.x - hit.x, item.y - hit.y) < 28)) {
              continue;
            }
            railRoad.push({
              x: hit.x,
              y: hit.y,
              railAngle: Math.atan2(b.y - a.y, b.x - a.x),
              roadAngle: Math.atan2(d.y - c.y, d.x - c.x),
              edgeId: edge.id,
              roadIndex
            });
          }
        }
      }

      waterSpans.push(...collectWaterSpans(edge, points));
    }

    return { railRoad, waterSpans };
  }

  function segmentIntersection(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denominator = r.x * s.y - r.y * s.x;
    if (Math.abs(denominator) < 0.0001) {
      return null;
    }
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denominator;
    if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) {
      return null;
    }
    return {
      x: a.x + t * r.x,
      y: a.y + t * r.y,
      t,
      u
    };
  }

  function collectWaterSpans(edge, points) {
    const spans = [];
    let current = [];
    const flush = () => {
      if (current.length > 1) {
        const metrics = measurePoints(current);
        if (metrics.length > 8) {
          spans.push({ edgeId: edge.id, points: current, length: metrics.length });
        }
      }
      current = [];
    };

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
      const samples = Math.max(1, Math.ceil(segmentLength / 6));
      for (let step = 0; step <= samples; step += 1) {
        if (i > 1 && step === 0) {
          continue;
        }
        const t = step / samples;
        const point = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        if (isWaterPoint(point)) {
          current.push(point);
        } else {
          flush();
        }
      }
    }
    flush();
    return spans;
  }

  function isWaterPoint(point) {
    const w = state.width;
    const coast = point.y < atlasCoastlineY(point.x);
    const mainRiver = Math.abs(point.x - atlasMainRiverX(point.y)) < atlasMainRiverHalfWidth(point.y);
    const tributaryEnd = atlasTributaryConfluenceX() + atlasTributaryHalfWidth(point.x);
    const tributary = point.x > -w * 0.03 && point.x < tributaryEnd && Math.abs(point.y - atlasTributaryY(point.x)) < atlasTributaryHalfWidth(point.x);
    const lake = atlasLakes().some((item) => pointInLake(point, item));
    return coast || mainRiver || tributary || lake;
  }

  function isNearRoadCrossing(x, y, conflicts, radius = 28) {
    return conflicts.railRoad.some((crossing) => Math.hypot(crossing.x - x, crossing.y - y) < radius);
  }

  function drawTracks(target) {
    const sorted = [...state.edges].sort((a, b) => stateRank(a.state) - stateRank(b.state));
    for (const edge of sorted) {
      drawTrackEdge(target, edge);
    }
  }

  function stateRank(stateName) {
    return { surveying: 0, dismantling: 1, building: 2, pending: 3, active: 4 }[stateName] || 0;
  }

  function drawTrackEdge(target, edge) {
    const fraction = edge.state === "active" ? 1 : smoothstep(edge.progress);
    const points = partialPoints(edge, fraction);
    if (points.length < 2) {
      return;
    }

    const g = gauge();
    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";

    if (edge.state === "surveying") {
      target.globalAlpha = 0.25 + 0.4 * Math.sin(state.time * 7 + edge.length) ** 2;
      target.strokeStyle = edge.hue ? "#9ff1ff" : "#fff4a8";
      target.lineWidth = 1.3;
      target.setLineDash([5, 8]);
      strokePath(target, points, false);
      target.setLineDash([]);
      target.restore();
      return;
    }

    const alpha = edge.state === "dismantling" ? clamp(edge.progress, 0, 1) : 1;
    target.globalAlpha = alpha;
    target.strokeStyle = settings.nightMode ? "#242629" : "#81786b";
    target.lineWidth = g * 1.95;
    strokePath(target, points, false);
    target.strokeStyle = settings.nightMode ? "#42403d" : "#b7aa8d";
    target.lineWidth = g * 1.38;
    strokePath(target, points, false);

    drawSleepers(target, edge, fraction, alpha);
    drawRailPair(target, points, g * 0.55, alpha);
    target.restore();
  }

  function partialPoints(edge, fraction) {
    if (fraction >= 0.999) {
      return edge.points;
    }
    const targetLength = edge.length * clamp(fraction, 0, 1);
    const result = [edge.points[0]];
    for (let i = 1; i < edge.points.length; i += 1) {
      if (edge.cumulative[i] < targetLength) {
        result.push(edge.points[i]);
        continue;
      }
      const prevLength = edge.cumulative[i - 1];
      const segmentLength = edge.cumulative[i] - prevLength;
      const t = segmentLength === 0 ? 0 : (targetLength - prevLength) / segmentLength;
      result.push({
        x: lerp(edge.points[i - 1].x, edge.points[i].x, t),
        y: lerp(edge.points[i - 1].y, edge.points[i].y, t)
      });
      break;
    }
    return result;
  }

  function drawSleepers(target, edge, fraction, alpha) {
    const spacing = 14 / clamp(settings.density, 0.6, 1.7);
    const end = edge.length * fraction;
    const g = gauge();
    const sleeperHalf = Math.max(0.7, 1.6 * worldScale());
    target.fillStyle = settings.nightMode ? "#4b2f21" : "#8e5f35";
    target.strokeStyle = settings.nightMode ? "#2a1c16" : "#5c3d25";
    target.lineWidth = Math.max(0.45, 0.75 * worldScale());
    target.globalAlpha = alpha;
    for (let distance = 0; distance < end; distance += spacing) {
      const pos = pointAt(edge, distance, 1);
      target.save();
      target.translate(pos.x, pos.y);
      target.rotate(pos.angle);
      target.fillRect(-sleeperHalf, -g * 1.08, sleeperHalf * 2, g * 2.16);
      target.restore();
    }
  }

  function drawRailPair(target, points, offset, alpha) {
    for (const side of [-offset, offset]) {
      target.globalAlpha = alpha;
      target.strokeStyle = settings.nightMode ? "#0e171a" : "#4d5354";
      target.lineWidth = Math.max(0.8, 2.0 * worldScale());
      strokeOffsetPath(target, points, side);
      target.strokeStyle = settings.nightMode ? "#9da8aa" : "#d7d8d1";
      target.lineWidth = Math.max(0.5, 0.95 * worldScale());
      strokeOffsetPath(target, points, side);
    }
  }

  function drawConstructionEffects(target) {
    const fx = clamp(settings.cinematicFx, 0, 1.5);
    if (fx <= 0.05) {
      return;
    }

    for (const edge of state.edges) {
      if (edge.state !== "building" && edge.state !== "surveying" && edge.state !== "dismantling") {
        continue;
      }
      const pos = pointAt(edge, edge.length * clamp(edge.progress, 0, 1), 1);
      target.save();
      target.translate(pos.x, pos.y);
      target.rotate(pos.angle);
      const s = worldScale();
      if (edge.state === "building") {
        target.fillStyle = "#d8a34a";
        target.fillRect(-7 * s, -4 * s, 12 * s, 8 * s);
        target.fillStyle = "#23323a";
        target.fillRect(-3 * s, -6 * s, 7 * s, 12 * s);
        target.fillStyle = "#ffd96d";
        target.shadowColor = "#ffd96d";
        target.shadowBlur = 10 * fx * s;
        for (let i = 0; i < 5; i += 1) {
          target.fillRect((6 + i * 2) * s, (-5 + Math.sin(state.time * 12 + i) * 5) * s, 2 * s, 2 * s);
        }
      } else if (edge.state === "dismantling") {
        target.fillStyle = "#20262a";
        target.fillRect(-8 * s, -3 * s, 12 * s, 6 * s);
        target.fillStyle = "#ff8866";
        target.fillRect(5 * s, -1 * s, 3 * s, 2 * s);
      } else {
        target.strokeStyle = edge.hue ? "#9ff1ff" : "#fff4a8";
        target.lineWidth = Math.max(0.7, 1.3 * s);
        target.beginPath();
        target.arc(0, 0, (9 + Math.sin(state.time * 8) * 2) * s, 0, TAU);
        target.stroke();
      }
      target.restore();
    }
  }

  function drawStations(target) {
    for (const station of state.stations) {
      const degree = activeDegree(station.id);
      const scale = station.temporary ? 0.85 : 1;
      const s = worldScale() * 0.86;
      const active = station.state === "active";
      target.save();
      target.translate(station.x, station.y);
      target.globalAlpha = station.state === "dismantling" ? 0.45 : 1;
      if (station.pulse > 0) {
        target.strokeStyle = settings.nightMode ? `rgba(255, 218, 125, ${station.pulse})` : `rgba(255, 255, 220, ${station.pulse})`;
        target.lineWidth = Math.max(0.85, 1.7 * s);
        target.beginPath();
        target.arc(0, 0, (18 + (1 - station.pulse) * 22) * s, 0, TAU);
        target.stroke();
      }

      if (settings.nightMode && active) {
        const glow = target.createRadialGradient(0, 0, 2, 0, 0, 28 * s);
        glow.addColorStop(0, "rgba(255, 211, 105, 0.28)");
        glow.addColorStop(1, "rgba(255, 211, 105, 0)");
        target.fillStyle = glow;
        target.fillRect(-32 * s, -32 * s, 64 * s, 64 * s);
      }

      target.fillStyle = station.temporary ? "#f0d465" : (settings.nightMode ? "#30383f" : "#e6dcc7");
      roundedRect(target, -16 * scale * s, -7 * scale * s, 32 * scale * s, 14 * scale * s, 3 * s);
      target.fill();
      target.strokeStyle = degree >= 2 ? "#2bd869" : "#d9483b";
      target.lineWidth = Math.max(0.75, 1.45 * s);
      target.stroke();
      target.fillStyle = settings.nightMode ? "#ffd86f" : "#55707b";
      for (let i = -2; i <= 2; i += 1) {
        target.fillRect(i * 5 * s - 0.8 * s, -1.9 * s, 1.6 * s, 3.8 * s);
      }
      target.restore();
    }
  }

  function activeDegree(stationId) {
    return state.edges.filter((edge) => edge.state === "active" && (edge.a === stationId || edge.b === stationId)).length;
  }

  function drawTrains(target) {
    for (const train of state.trains) {
      const step = train.path[train.pathIndex];
      if (!step) {
        drawWaitingTrain(target, train);
        continue;
      }
      const edge = edgeById(step.edgeId);
      if (!edge) {
        continue;
      }

      const dir = edge.a === step.from ? 1 : -1;
      drawTrainHeadlight(target, train, edge, step, dir);
      const s = trainScale();
      const carGap = 7 * s;
      const carLength = 18 * s;
      drawTrainRibbon(target, train, carLength, carGap);
      for (let i = train.cars; i >= 0; i -= 1) {
        const offset = i === 0 ? 0 : i * (carLength + carGap);
        const pos = trainPosition(train, offset);
        if (!pos) {
          continue;
        }
        drawMiniCar(target, pos.x, pos.y, pos.angle, i === 0 ? carLength * 1.16 : carLength, i === 0 ? train.color : carriageColor(train, i), i === 0, train.trim);
      }
    }
  }

  function drawTrainRibbon(target, train, carLength, carGap) {
    const points = [];
    for (let i = 0; i <= train.cars; i += 1) {
      const pos = trainPosition(train, i * (carLength + carGap));
      if (pos) {
        points.push(pos);
      }
    }
    if (points.length < 2) {
      return;
    }

    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";
    target.strokeStyle = "#080b0e";
    target.lineWidth = Math.max(1.05, 3.1 * trainScale());
    target.beginPath();
    target.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      target.lineTo(points[i].x, points[i].y);
    }
    target.stroke();
    target.strokeStyle = colorWithAlpha(train.color, 0.88);
    target.lineWidth = Math.max(0.65, 1.45 * trainScale());
    target.stroke();
    target.restore();
  }

  function drawWaitingTrain(target, train) {
    const station = stationById(train.stationId);
    if (!station) {
      return;
    }
    const angle = state.time + parseInt(train.id.replace("train-", ""), 10);
    drawMiniCar(
      target,
      station.x + Math.cos(angle) * 10 * trainScale(),
      station.y + Math.sin(angle) * 6 * trainScale(),
      angle,
      18 * trainScale(),
      train.color,
      true,
      train.trim
    );
  }

  function trainPosition(train, offset) {
    let edgeIndex = train.pathIndex;
    let d = train.distance - offset;
    while (d < 0 && edgeIndex > 0) {
      edgeIndex -= 1;
      const prev = edgeById(train.path[edgeIndex].edgeId);
      if (!prev) return null;
      d += prev.length;
    }
    const step = train.path[edgeIndex];
    const edge = step ? edgeById(step.edgeId) : null;
    if (!edge) {
      return null;
    }
    const dir = edge.a === step.from ? 1 : -1;
    return trainPointAt(edge, clamp(d, 0, edge.length), step, dir);
  }

  function trainPointAt(edge, distance, step, dir) {
    const pos = pointAt(edge, distance, dir);
    const physicalAngle = edge.a === step.from ? pos.angle : pos.angle - Math.PI;
    const side = laneForStep(edge, step) === 0 ? -1 : 1;
    const offset = side * gauge() * 0.78;
    return {
      x: pos.x + Math.cos(physicalAngle + Math.PI / 2) * offset,
      y: pos.y + Math.sin(physicalAngle + Math.PI / 2) * offset,
      angle: pos.angle
    };
  }

  function drawTrainHeadlight(target, train, edge, step, dir) {
    if (!settings.nightMode && settings.weather === "clear") {
      return;
    }
    const pos = trainPointAt(edge, train.distance, step, dir);
    const s = trainScale();
    target.save();
    target.translate(pos.x, pos.y);
    target.rotate(pos.angle);
    const cone = target.createLinearGradient(7 * s, 0, 70 * s, 0);
    cone.addColorStop(0, "rgba(255, 229, 145, 0.22)");
    cone.addColorStop(1, "rgba(255, 229, 145, 0)");
    target.fillStyle = cone;
    target.beginPath();
    target.moveTo(5 * s, -3 * s);
    target.lineTo(74 * s, -18 * s);
    target.lineTo(74 * s, 18 * s);
    target.lineTo(5 * s, 3 * s);
    target.closePath();
    target.fill();
    target.restore();
  }

  function drawMiniCar(target, x, y, angle, length, color, locomotive, trim) {
    const s = trainScale();
    const width = (locomotive ? 5.4 : 4.4) * s;
    target.save();
    target.translate(x, y);
    target.rotate(angle);
    target.shadowColor = colorWithAlpha("#000000", settings.nightMode ? 0.4 : 0.2);
    target.shadowBlur = (settings.nightMode ? 4 : 1.2) * s;
    target.shadowOffsetY = 0.9 * s;
    roundedRect(target, -length / 2, -width / 2, length, width, 1.3 * s);
    target.fillStyle = "#16191e";
    target.fill();
    roundedRect(target, -length / 2 + 0.65 * s, -width / 2 + 0.65 * s, length - 1.3 * s, width - 1.3 * s, 0.9 * s);
    target.fillStyle = color;
    target.fill();
    target.shadowBlur = 0;
    target.fillStyle = colorWithAlpha("#ffffff", settings.nightMode ? 0.14 : 0.20);
    target.fillRect(-length * 0.22, -width * 0.22, length * 0.44, Math.max(0.55, width * 0.12));
    if (locomotive) {
      target.fillStyle = trim;
      target.fillRect(length * 0.24, -width / 2 + 0.55 * s, 1.6 * s, width - 1.1 * s);
      target.fillStyle = settings.nightMode ? "#ffe18a" : "#dff3ff";
      target.fillRect(length * 0.37, -0.75 * s, 1.4 * s, 1.5 * s);
    }
    target.restore();
  }

  function carriageColor(train, index) {
    const colors = trainPalettes[settings.palette] || trainPalettes.classic;
    return index % 3 === 0 ? "#d8d6ca" : colors[(index + parseInt(train.id.replace("train-", ""), 10)) % colors.length];
  }

  function pointAt(edge, distance, dir) {
    return pointAtPath(edge.points, edge.cumulative, edge.length, distance, dir);
  }

  function pointAtPath(points, cumulative, length, distance, dir) {
    const targetLength = dir === 1 ? distance : length - distance;
    const d = clamp(targetLength, 0, length);
    for (let i = 1; i < points.length; i += 1) {
      if (cumulative[i] >= d) {
        const prevLength = cumulative[i - 1];
        const segmentLength = cumulative[i] - prevLength;
        const t = segmentLength === 0 ? 0 : (d - prevLength) / segmentLength;
        const a = points[i - 1];
        const b = points[i];
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (dir === -1) angle += Math.PI;
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle };
      }
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  function drawWaterAmbience(target) {
    return;
  }

  function drawBoats(target) {
    if (state.boats.length === 0) {
      return;
    }

    for (const boat of state.boats) {
      const route = state.boatRoutes[boat.routeIndex];
      const dir = Math.sign(boat.speed) || 1;
      const pos = pointAtPath(route.points, route.cumulative, route.length, Math.abs(boat.distance), dir);
      const s = worldScale();
      const length = boat.length * s;
      const width = boat.width * s;
      target.save();
      target.translate(pos.x, pos.y);
      target.rotate(pos.angle);
      target.globalAlpha = 0.9;
      target.fillStyle = colorWithAlpha("#000000", settings.nightMode ? 0.35 : 0.16);
      target.beginPath();
      target.ellipse(-length * 0.12, 4 * s, length * 0.55, width * 0.72, 0, 0, TAU);
      target.fill();
      target.fillStyle = "#23313a";
      target.beginPath();
      target.moveTo(length / 2, 0);
      target.lineTo(length * 0.16, -width / 2);
      target.lineTo(-length / 2, -width * 0.35);
      target.lineTo(-length / 2, width * 0.35);
      target.lineTo(length * 0.16, width / 2);
      target.closePath();
      target.fill();
      target.fillStyle = boat.color;
      target.fillRect(-length * 0.18, -width * 0.32, length * 0.34, width * 0.64);
      target.fillStyle = settings.nightMode ? "#ffd975" : "#fbf2d6";
      target.fillRect(length * 0.18, -1.2 * s, 2.6 * s, 2.4 * s);
      target.restore();
    }
  }

  function drawRoadTraffic(target, conflicts) {
    if (state.roadCars.length === 0) {
      return;
    }

    for (const car of state.roadCars) {
      const road = state.roads[car.roadIndex];
      const dir = Math.sign(car.speed) || 1;
      const pos = pointAtPath(road.points, road.cumulative, road.length, Math.abs(car.distance), dir);
      if (isNearRoadCrossing(pos.x, pos.y, conflicts, 18 * worldScale())) {
        continue;
      }
      const s = worldScale();
      const carLength = car.length * s;
      const carWidth = car.width * s;
      target.save();
      target.translate(pos.x, pos.y);
      target.rotate(pos.angle);
      target.shadowColor = colorWithAlpha("#000000", settings.nightMode ? 0.34 : 0.18);
      target.shadowBlur = (settings.nightMode ? 5 : 2) * s;
      target.shadowOffsetY = 1 * s;
      roundedRect(target, -carLength / 2, -carWidth / 2, carLength, carWidth, 1.8 * s);
      target.fillStyle = "#171b20";
      target.fill();
      roundedRect(target, -carLength / 2 + 0.7 * s, -carWidth / 2 + 0.7 * s, carLength - 1.4 * s, carWidth - 1.4 * s, 1.2 * s);
      target.fillStyle = car.color;
      target.fill();
      if (settings.nightMode) {
        target.fillStyle = "#ffe8a0";
        target.shadowColor = "#ffe8a0";
        target.shadowBlur = 6 * s;
        target.fillRect(carLength / 2 - 1.6 * s, -carWidth * 0.25, 1.6 * s, 1.2 * s);
        target.fillRect(carLength / 2 - 1.6 * s, carWidth * 0.08, 1.6 * s, 1.2 * s);
      }
      target.restore();
    }
  }

  function drawRoadUnderpasses(target, conflicts) {
    const outer = roadOuterWidth();
    const plateLength = outer * 1.95;
    const plateWidth = outer * 1.08;
    for (const crossing of conflicts.railRoad) {
      target.save();
      target.translate(crossing.x, crossing.y);
      target.rotate(crossing.roadAngle);
      target.fillStyle = settings.nightMode ? "#202a31" : "#aeb4b4";
      roundedRect(target, -plateLength / 2, -plateWidth / 2, plateLength, plateWidth, 4 * worldScale());
      target.fill();
      target.strokeStyle = settings.nightMode ? "#101518" : "#7a8284";
      target.lineWidth = Math.max(0.8, 1.6 * worldScale());
      target.stroke();
      target.strokeStyle = settings.nightMode ? "#899794" : "#d0c88a";
      target.lineWidth = Math.max(0.55, 1.1 * worldScale());
      target.setLineDash([5 * worldScale(), 7 * worldScale()]);
      target.beginPath();
      target.moveTo(-plateLength * 0.38, 0);
      target.lineTo(plateLength * 0.38, 0);
      target.stroke();
      target.setLineDash([]);
      target.restore();
    }
  }

  function drawWaterBridgeDecks(target, conflicts) {
    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";
    for (const span of conflicts.waterSpans) {
      target.strokeStyle = settings.nightMode ? "#1d2022" : "#766b5f";
      target.lineWidth = gauge() * 3.05;
      strokePath(target, span.points, false);
      target.strokeStyle = settings.nightMode ? "#383d3f" : "#c8b99b";
      target.lineWidth = gauge() * 2.18;
      strokePath(target, span.points, false);
    }
    target.restore();
  }

  function drawCrossingDetails(target, conflicts) {
    target.save();
    target.lineCap = "round";
    target.lineJoin = "round";

    for (const span of conflicts.waterSpans) {
      target.strokeStyle = settings.nightMode ? "#6e6256" : "#8f6e4d";
      target.lineWidth = Math.max(0.6, 1.15 * worldScale());
      target.setLineDash([3 * worldScale(), 8 * worldScale()]);
      strokeOffsetPath(target, span.points, gauge() * 1.38);
      strokeOffsetPath(target, span.points, -gauge() * 1.38);
      target.setLineDash([]);
    }

    for (const crossing of conflicts.railRoad) {
      target.save();
      target.translate(crossing.x, crossing.y);
      target.rotate(crossing.railAngle);
      target.fillStyle = colorWithAlpha("#000000", settings.nightMode ? 0.35 : 0.16);
      target.fillRect(-15 * worldScale(), -gauge() * 1.5, 30 * worldScale(), gauge() * 3.0);
      target.strokeStyle = settings.nightMode ? "#d9b968" : "#ffd15a";
      target.lineWidth = Math.max(0.6, 1.15 * worldScale());
      target.beginPath();
      target.moveTo(-13 * worldScale(), -gauge() * 1.18);
      target.lineTo(13 * worldScale(), -gauge() * 1.18);
      target.moveTo(-13 * worldScale(), gauge() * 1.18);
      target.lineTo(13 * worldScale(), gauge() * 1.18);
      target.stroke();
      target.fillStyle = settings.nightMode ? "#f0d36f" : "#2f3d42";
      target.fillRect(-2.5 * worldScale(), -gauge() * 2.0, 5 * worldScale(), 2.4 * worldScale());
      target.fillRect(-2.5 * worldScale(), gauge() * 1.78, 5 * worldScale(), 2.4 * worldScale());
      target.restore();
    }

    target.restore();
  }

  function drawMouseInfluence(target) {
    if (state.time > state.mouse.activeUntil || settings.mouseInfluence <= 0) {
      return;
    }
    const life = clamp((state.mouse.activeUntil - state.time) / 4, 0, 1);
    target.save();
    target.strokeStyle = `rgba(159, 241, 255, ${0.35 * life})`;
    target.lineWidth = 1.4;
    target.setLineDash([5, 8]);
    target.beginPath();
    target.arc(state.mouse.x, state.mouse.y, 45 + Math.sin(state.time * 5) * 8, 0, TAU);
    target.stroke();
    target.restore();
  }

  function drawCinematicOverlay(target) {
    const fx = clamp(settings.cinematicFx, 0, 1.5);
    if (fx <= 0.05) {
      return;
    }
    target.save();
    if (settings.nightMode) {
      const haze = target.createLinearGradient(0, 0, state.width, state.height);
      haze.addColorStop(0, `rgba(52, 111, 130, ${0.10 * fx})`);
      haze.addColorStop(0.45, "rgba(0, 0, 0, 0)");
      haze.addColorStop(1, `rgba(252, 183, 88, ${0.06 * fx})`);
      target.fillStyle = haze;
      target.fillRect(0, 0, state.width, state.height);
    } else {
      target.globalAlpha = 0.025 * fx;
      target.fillStyle = "#fff5cf";
      target.fillRect(0, 0, state.width, state.height);
    }
    target.restore();
  }

  function drawWeather(target) {
    if (settings.weather === "clear" || state.weatherParticles.length === 0) {
      return;
    }
    const intensity = clamp(settings.weatherIntensity, 0, 1.5);
    target.save();
    if (settings.weather === "rain") {
      target.fillStyle = settings.nightMode ? `rgba(4, 9, 13, ${0.16 * intensity})` : `rgba(42, 66, 73, ${0.08 * intensity})`;
      target.fillRect(0, 0, state.width, state.height);
      target.lineCap = "round";
      target.lineWidth = 1.3;
      for (const particle of state.weatherParticles) {
        const x = wrap(particle.x + state.time * particle.drift, state.width + 160) - 80;
        const y = wrap(particle.y + state.time * particle.speed, state.height + 120) - 60;
        target.strokeStyle = `rgba(198, 231, 242, ${particle.alpha * intensity})`;
        target.beginPath();
        target.moveTo(x, y);
        target.lineTo(x - 5, y + particle.size);
        target.stroke();
      }
    } else if (settings.weather === "snow") {
      target.fillStyle = settings.nightMode ? `rgba(10, 18, 24, ${0.08 * intensity})` : `rgba(226, 238, 237, ${0.05 * intensity})`;
      target.fillRect(0, 0, state.width, state.height);
      for (const particle of state.weatherParticles) {
        const x = wrap(particle.x + Math.sin(state.time * 0.9 + particle.phase) * 22 + state.time * particle.drift, state.width + 80) - 40;
        const y = wrap(particle.y + state.time * particle.speed, state.height + 80) - 40;
        target.fillStyle = `rgba(245, 250, 248, ${particle.alpha * intensity})`;
        target.beginPath();
        target.arc(x, y, particle.size, 0, TAU);
        target.fill();
      }
    }
    target.restore();
  }

  function drawVignette(target) {
    const gradient = target.createRadialGradient(state.width / 2, state.height / 2, Math.min(state.width, state.height) * 0.18, state.width / 2, state.height / 2, Math.max(state.width, state.height) * 0.72);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, settings.nightMode ? "rgba(0, 0, 0, 0.46)" : "rgba(0, 0, 0, 0.18)");
    target.fillStyle = gradient;
    target.fillRect(0, 0, state.width, state.height);
  }

  function strokePath(target, points, closed) {
    if (points.length < 2) return;
    target.beginPath();
    target.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      target.lineTo(points[i].x, points[i].y);
    }
    if (closed) target.closePath();
    target.stroke();
  }

  function strokeOffsetPath(target, points, offset) {
    if (points.length < 2) return;
    target.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const previous = points[Math.max(0, i - 1)];
      const current = points[i];
      const next = points[Math.min(points.length - 1, i + 1)];
      const angle = Math.atan2(next.y - previous.y, next.x - previous.x);
      const x = current.x + Math.cos(angle + Math.PI / 2) * offset;
      const y = current.y + Math.sin(angle + Math.PI / 2) * offset;
      if (i === 0) {
        target.moveTo(x, y);
      } else {
        target.lineTo(x, y);
      }
    }
    target.stroke();
  }

  function roundedRect(target, x, y, width, height, radius) {
    target.beginPath();
    target.moveTo(x + radius, y);
    target.lineTo(x + width - radius, y);
    target.quadraticCurveTo(x + width, y, x + width, y + radius);
    target.lineTo(x + width, y + height - radius);
    target.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    target.lineTo(x + radius, y + height);
    target.quadraticCurveTo(x, y + height, x, y + height - radius);
    target.lineTo(x, y + radius);
    target.quadraticCurveTo(x, y, x + radius, y);
    target.closePath();
  }

  function graphSafetyReport() {
    const active = state.edges.filter((edge) => edge.state === "active");
    const conflicts = collectTransportConflicts();
    const routed = state.trains.filter((train) => train.path.length > 0);
    const routeLengths = routed.map((train) => pathDistance(train.path));
    const routeEdges = routed.map((train) => train.path.length);
    const waits = state.trains.map((train) => train.wait);
    const trainDistances = routed.map((train) => train.distance);
    const railQuality = railQualityReport(active);
    const degrees = new Map();
    for (const edge of active) {
      degrees.set(edge.a, (degrees.get(edge.a) || 0) + 1);
      degrees.set(edge.b, (degrees.get(edge.b) || 0) + 1);
    }
    const unsafeStations = [...degrees.entries()].filter(([, degree]) => degree < 2);
    return {
      stations: degrees.size,
      simTime: Number(state.time.toFixed(2)),
      activeEdges: active.length,
      unsafeStations: unsafeStations.length,
      buildingEdges: state.edges.filter((edge) => edge.state === "building" || edge.state === "surveying" || edge.state === "pending").length,
      dismantlingEdges: state.edges.filter((edge) => edge.state === "dismantling").length,
      trains: state.trains.length,
      routedTrains: routed.length,
      movingTrains: state.trains.filter((train) => train.path.length > 0 && train.wait <= 0).length,
      travelingTrains: routed.filter((train) => train.distance > 0.1).length,
      signalHolds: state.trains.filter((train) => train.signalHold).length,
      slowedTrains: state.trains.filter((train) => train.speedFactor > 0 && train.speedFactor < 0.98).length,
      minTrainWait: Number(Math.min(...waits).toFixed(2)),
      averageTrainDistance: Number((trainDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, trainDistances.length)).toFixed(1)),
      averageRouteEdges: Number((routeEdges.reduce((sum, value) => sum + value, 0) / Math.max(1, routeEdges.length)).toFixed(2)),
      averageRouteLength: Number((routeLengths.reduce((sum, value) => sum + value, 0) / Math.max(1, routeLengths.length)).toFixed(1)),
      maxRouteEdges: Math.max(0, ...routeEdges),
      maxRouteLength: Number(Math.max(0, ...routeLengths).toFixed(1)),
      roadUnderpasses: conflicts.railRoad.length,
      railWaterBridges: conflicts.waterSpans.length,
      longWaterSpans: railQuality.longWaterSpans,
      sceneryOnWater: railQuality.sceneryOnWater,
      railsNearBuildings: railQuality.railsNearBuildings,
      railsNearYards: railQuality.railsNearYards,
      messyRailConflicts: railQuality.messyRailConflicts,
      boats: state.boats.length
    };
  }

  function railQualityReport(activeEdges) {
    let longWaterSpans = 0;
    let railsNearBuildings = 0;
    let railsNearYards = 0;
    let messyRailConflicts = 0;
    const maxBridge = Math.min(state.width, state.height) * 0.16;

    for (const edge of activeEdges) {
      if (longestWaterRun(edge.points) > maxBridge && edge.group !== "core-ring") {
        longWaterSpans += 1;
      }
      if (pathHitsBuilding(edge.points, stationById(edge.a) || edge.points[0], stationById(edge.b) || edge.points[edge.points.length - 1])) {
        railsNearBuildings += 1;
      }
      if (pathHitsYard(edge.points, stationById(edge.a) || edge.points[0], stationById(edge.b) || edge.points[edge.points.length - 1])) {
        railsNearYards += 1;
      }
    }

    for (let i = 0; i < activeEdges.length; i += 1) {
      for (let j = i + 1; j < activeEdges.length; j += 1) {
        if (edgesHaveMessyConflict(activeEdges[i], activeEdges[j])) {
          messyRailConflicts += 1;
        }
      }
    }

    return {
      longWaterSpans,
      railsNearBuildings,
      railsNearYards,
      messyRailConflicts,
      sceneryOnWater: state.scenery.filter((item) => isWaterPoint(item)).length
    };
  }

  function edgesHaveMessyConflict(aEdge, bEdge) {
    const sharedEndpoint = aEdge.a === bEdge.a || aEdge.a === bEdge.b || aEdge.b === bEdge.a || aEdge.b === bEdge.b;
    if (sharedEndpoint) {
      return false;
    }
    for (let i = 1; i < aEdge.points.length; i += 1) {
      for (let j = 1; j < bEdge.points.length; j += 1) {
        const hit = segmentIntersection(aEdge.points[i - 1], aEdge.points[i], bEdge.points[j - 1], bEdge.points[j]);
        if (hit && !nearAnyStation(hit, 30)) {
          return true;
        }
      }
    }
    return false;
  }

  function updateDebugReport() {
    if (state.time < state.nextDebugReport) {
      return;
    }
    state.nextDebugReport = state.time + 1;
    document.body.dataset.railReport = JSON.stringify(graphSafetyReport());
  }

  function applyProperties(properties) {
    let rebuild = false;
    let redraw = false;

    if (properties.speed) settings.speed = Number(properties.speed.value);
    if (properties.traincount) {
      settings.trainCount = Number(properties.traincount.value);
      buildTrains();
    }
    if (properties.stationcount) {
      settings.stationCount = Number(properties.stationcount.value);
      rebuild = true;
    }
    if (properties.trackdensity) {
      settings.density = Number(properties.trackdensity.value);
      redraw = true;
    }
    if (properties.networkactivity) settings.networkActivity = Number(properties.networkactivity.value);
    if (properties.mouseinfluence) settings.mouseInfluence = Number(properties.mouseinfluence.value);
    if (properties.decayspeed) settings.decaySpeed = Number(properties.decayspeed.value);
    if (properties.miniaturescale) {
      settings.miniatureScale = Number(properties.miniaturescale.value);
      redraw = true;
    }
    if (properties.weather) {
      settings.weather = properties.weather.value;
      buildWeather();
    }
    if (properties.weatherintensity) {
      settings.weatherIntensity = Number(properties.weatherintensity.value);
      buildWeather();
    }
    if (properties.cameradrift) settings.cameraDrift = Number(properties.cameradrift.value);
    if (properties.cinematicfx) {
      settings.cinematicFx = Number(properties.cinematicfx.value);
      buildBoats(seededRandom(state.seed + 9));
    }
    if (properties.nightmode) {
      settings.nightMode = Boolean(properties.nightmode.value);
      redraw = true;
    }
    if (properties.signalglow) settings.signalGlow = Boolean(properties.signalglow.value);
    if (properties.traintheme) {
      settings.palette = properties.traintheme.value;
      buildTrains();
    }
    if (properties.schemecolor) {
      const parsed = parseWallpaperColor(properties.schemecolor.value);
      if (parsed) {
        settings.accent = parsed;
        redraw = true;
      }
    }
    if (properties.trafficdensity) {
      settings.trafficDensity = Number(properties.trafficdensity.value);
      buildRoadCars(seededRandom(state.seed + 9));
    }

    if (rebuild) buildWorld();
    if (redraw) {
      buildTerrainDetails();
      buildWeather();
      state.backgroundDirty = true;
    }
  }

  function applyPreviewParameters() {
    const params = new URLSearchParams(window.location.search);
    const numeric = [
      ["speed", "speed"],
      ["traincount", "trainCount"],
      ["stationcount", "stationCount"],
      ["trackdensity", "density"],
      ["networkactivity", "networkActivity"],
      ["mouseinfluence", "mouseInfluence"],
      ["decayspeed", "decaySpeed"],
      ["miniaturescale", "miniatureScale"],
      ["weatherintensity", "weatherIntensity"],
      ["cameradrift", "cameraDrift"],
      ["cinematicfx", "cinematicFx"],
      ["trafficdensity", "trafficDensity"]
    ];
    for (const [param, key] of numeric) {
      if (params.has(param)) settings[key] = Number(params.get(param));
    }
    if (params.has("weather")) {
      const weather = params.get("weather");
      if (["clear", "rain", "snow"].includes(weather)) settings.weather = weather;
    }
    if (params.has("nightmode")) settings.nightMode = params.get("nightmode") === "true" || params.get("nightmode") === "1";
    if (params.has("signalglow")) settings.signalGlow = params.get("signalglow") !== "false" && params.get("signalglow") !== "0";
    if (params.has("traintheme")) {
      const theme = params.get("traintheme");
      if (trainPalettes[theme]) settings.palette = theme;
    }
  }

  function handlePointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = event.clientX - rect.left;
    state.mouse.y = event.clientY - rect.top;
  }

  function handlePointerDown(event) {
    handlePointerMove(event);
    state.mouse.activeUntil = state.time + 2.4;
    state.forceBuild = true;
  }

  window.wallpaperPropertyListener = { applyUserProperties: applyProperties };
  window.__railDrift = { state, settings, graphSafetyReport };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerdown", handlePointerDown);
  applyPreviewParameters();
  resize();
  renderBackground();
  updateDebugReport();
  drawFrame();
  requestAnimationFrame(update);
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastFrameAt > 120) {
      stepFrame(now);
    }
  }, 1000 / 30);
})();
