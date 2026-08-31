/**
 * ひっくり返せ — ALL tunable numbers live here.
 * No magic numbers in the game loop.
 */
window.FLIP_GRAVITY_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 800,
  arenaHeightPixels: 480,
  roomWidthPixels: 800,
  groundThicknessPixels: 36,
  ceilingThicknessPixels: 36,

  // —— Player ——
  playerWidthPixels: 22,
  playerHeightPixels: 28,
  playerMoveSpeedPixelsPerSecond: 260,
  playerAirControlMultiplier: 0.85,
  playerMaxHitPoints: 3,
  playerHurtFlashDurationSeconds: 0.18,
  playerInvincibleAfterHitSeconds: 0.7,
  playerLandSquashScaleX: 1.4,
  playerLandSquashScaleY: 0.55,
  playerFlipStretchScaleX: 0.65,
  playerFlipStretchScaleY: 1.45,
  playerPoseRecoverSeconds: 0.14,
  gravityPixelsPerSecondSquared: 1600,
  maxFallSpeedPixelsPerSecond: 720,
  coyoteTimeSeconds: 0.08,

  // —— Flip (core verb) ——
  flipCooldownSeconds: 0.12,
  flipVelocityBoostPixelsPerSecond: 80,
  flipVfxLifetimeSeconds: 0.22,

  // —— Hazards (ONE body: spike wedge, varied by size/speed/placement) ——
  spikeBaseWidthPixels: 22,
  spikeBaseHeightPixels: 18,
  moverBaseSpeedPixelsPerSecond: 90,
  moverHitboxInsetPixels: 2,

  // —— Rooms (peaky — NOT a smooth ramp). Easy opener, then spikes & breath. ——
  // Each room: platforms, spikes (surface + params), movers, goalX relative to room
  rooms: Object.freeze([
    // 開幕 — gap + ceiling spikes: flip to walk ceiling over the pit
    Object.freeze({
      labelJa: '開幕',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 280, h: 36 }),
        Object.freeze({ x: 420, y: 444, w: 380, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 120, surface: 'ceiling', count: 4, sizeMul: 1 }),
        Object.freeze({ x: 500, surface: 'ceiling', count: 3, sizeMul: 1 }),
      ]),
      movers: Object.freeze([]),
      spawnX: 60,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 尖り① — spike floor stretch: must flip early
    Object.freeze({
      labelJa: '尖り①',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 160, h: 36 }),
        Object.freeze({ x: 160, y: 444, w: 400, h: 36 }),
        Object.freeze({ x: 640, y: 444, w: 160, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 180, surface: 'floor', count: 10, sizeMul: 1.05 }),
        Object.freeze({ x: 100, surface: 'ceiling', count: 2, sizeMul: 0.9 }),
        Object.freeze({ x: 620, surface: 'ceiling', count: 3, sizeMul: 1 }),
      ]),
      movers: Object.freeze([]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 息継ぎ — one slow saw, generous floor
    Object.freeze({
      labelJa: '息継ぎ',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 800, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 350, surface: 'ceiling', count: 4, sizeMul: 1 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 280,
          y: 280,
          w: 28,
          h: 28,
          axis: 'x',
          range: 180,
          speedMul: 0.7,
          sizeMul: 1.1,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 尖り② — pit + spike ceiling corridor + mover
    Object.freeze({
      labelJa: '尖り②',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 200, h: 36 }),
        Object.freeze({ x: 340, y: 444, w: 140, h: 36 }),
        Object.freeze({ x: 620, y: 444, w: 180, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 220, surface: 'ceiling', count: 8, sizeMul: 1.1 }),
        Object.freeze({ x: 360, surface: 'floor', count: 3, sizeMul: 1 }),
        Object.freeze({ x: 640, surface: 'floor', count: 2, sizeMul: 0.95 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 400,
          y: 200,
          w: 26,
          h: 26,
          axis: 'y',
          range: 120,
          speedMul: 1.15,
          sizeMul: 1,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 厚み — two movers + mixed spikes (breath after peak)
    Object.freeze({
      labelJa: '厚み',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 220, h: 36 }),
        Object.freeze({ x: 280, y: 444, w: 240, h: 36 }),
        Object.freeze({ x: 580, y: 444, w: 220, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 300, surface: 'floor', count: 5, sizeMul: 1 }),
        Object.freeze({ x: 80, surface: 'ceiling', count: 3, sizeMul: 1 }),
        Object.freeze({ x: 500, surface: 'ceiling', count: 4, sizeMul: 1.05 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 200,
          y: 300,
          w: 24,
          h: 24,
          axis: 'x',
          range: 140,
          speedMul: 0.9,
          sizeMul: 0.95,
        }),
        Object.freeze({
          x: 520,
          y: 160,
          w: 30,
          h: 30,
          axis: 'y',
          range: 100,
          speedMul: 1.0,
          sizeMul: 1.15,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // ピーク — commit hard: long spike floor, fast saws, tight ceiling
    Object.freeze({
      labelJa: 'ピーク',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 120, h: 36 }),
        Object.freeze({ x: 120, y: 444, w: 480, h: 36 }),
        Object.freeze({ x: 680, y: 444, w: 120, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 140, surface: 'floor', count: 14, sizeMul: 1.1 }),
        Object.freeze({ x: 200, surface: 'ceiling', count: 6, sizeMul: 1 }),
        Object.freeze({ x: 500, surface: 'ceiling', count: 5, sizeMul: 1.15 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 300,
          y: 240,
          w: 28,
          h: 28,
          axis: 'x',
          range: 200,
          speedMul: 1.4,
          sizeMul: 1.05,
        }),
        Object.freeze({
          x: 560,
          y: 180,
          w: 32,
          h: 32,
          axis: 'y',
          range: 140,
          speedMul: 1.35,
          sizeMul: 1.2,
        }),
      ]),
      spawnX: 40,
      spawnSurface: 'floor',
      goalX: 760,
    }),
  ]),

  // —— Feel: hitstop ——
  hitstopOnLandSeconds: 0.06,
  hitstopOnHazardHitSeconds: 0.1,
  hitstopOnFlipSeconds: 0.05,
  hitstopOnClearSeconds: 0.08,

  // —— Feel: screen shake ——
  shakeOnLandPixels: 4,
  shakeOnHazardHitPixels: 12,
  shakeOnFlipPixels: 7,
  shakeOnClearPixels: 10,
  shakeDecayPerSecond: 18,
  shakeAmountCutoffPixels: 0.15,

  // —— Feel: VFX ——
  landDustLifetimeSeconds: 0.18,
  landDustParticleCount: 6,
  flipRingLifetimeSeconds: 0.2,
  flipRingMaxRadiusPixels: 48,
  hitMarkLifetimeSeconds: 5 / 60,
  hitMarkSizePixels: 12,

  // —— Audio ——
  ambientVolumeLinear: 0.05,
  flipVolumeLinear: 0.6,
  landVolumeLinear: 0.45,
  hurtVolumeLinear: 0.55,
  clearVolumeLinear: 0.7,
  koVolumeLinear: 0.85,
  pitchShiftRandomFraction: 0.1,
  attackPeakDecaySeconds: 0.08,
  attackReverbTailSeconds: 0.2,
  hitClickDecaySeconds: 0.06,

  // —— UI / flow ——
  deathsOnSameRoomBeforeSkipButton: 2,
  overlayInputArmDelayMilliseconds: 200,
  clearPopupDurationSeconds: 0.85,
  roomBreathSeconds: 0.35,
  goalReachDistancePixels: 28,

  // —— Colors ——
  colorArenaSky: '#141820',
  colorArenaSkyTop: '#1a2230',
  colorPlatform: '#3a4455',
  colorPlatformEdge: '#0a0a0a',
  colorPlatformTop: '#5a6a7e',
  colorPlayerBody: '#f0e6d2',
  colorPlayerEdge: '#0a0a0a',
  colorPlayerAccent: '#ffcc33',
  colorSpike: '#e84855',
  colorSpikeEdge: '#1a0508',
  colorMover: '#ff9f1c',
  colorMoverEdge: '#1a0a00',
  colorGoal: '#3ecf8e',
  colorGoalEdge: '#0a1a10',
  colorHudText: '#f4f0e6',
  colorHpFilled: '#ff5c5c',
  colorHpEmpty: '#3a3f4b',
  colorScoreAccent: '#ffcc33',
  colorBestAccent: '#ff9f1c',
  colorFlipHint: '#66d9ef',
  colorVfxCore: '#fff8e7',
  colorVfxEdge: '#0a0a0a',
  colorVfxDust: '#8a94a8',

  // —— Sim clamps ——
  maxFrameDeltaSeconds: 0.05,
  playerInvulnBlinkHz: 18,
  parallaxStripeSpacingPixels: 64,

  // —— Debug ——
  debugHitboxStrokeColor: '#00ff88',
  debugHitboxLineWidthPixels: 1.5,
});
