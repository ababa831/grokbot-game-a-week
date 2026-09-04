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
  groundedProbePixels: 2,
  fallOutMarginPixels: 40,
  hurtKnockbackPixelsPerSecond: 280,

  // —— Flip (core verb) ——
  flipCooldownSeconds: 0.12,
  flipVelocityBoostPixelsPerSecond: 80,
  flipVfxLifetimeSeconds: 0.22,
  flipInvincibleSeconds: 0.18,

  // —— Hazards (ONE body: spike wedge, varied by size/speed/placement) ——
  spikeBaseWidthPixels: 22,
  spikeBaseHeightPixels: 18,
  spikeHitboxInsetPixels: 4,
  moverBaseSpeedPixelsPerSecond: 90,
  moverHitboxInsetPixels: 4,

  // —— Rooms (peaky — NOT a smooth ramp). Easy opener, then spikes & breath. ——
  // Each room: platforms, spikes (surface + params), movers, goalX relative to room
  rooms: Object.freeze([
    // 開幕 — clean pit: flip to ceiling over the gap (no spikes on the path)
    Object.freeze({
      labelJa: '開幕',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 260, h: 36 }),
        Object.freeze({ x: 440, y: 444, w: 360, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([]),
      movers: Object.freeze([]),
      spawnX: 60,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 尖り① — floor spikes: flip to clear ceiling (ceiling mostly safe)
    Object.freeze({
      labelJa: '尖り①',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 180, h: 36 }),
        Object.freeze({ x: 180, y: 444, w: 380, h: 36 }),
        Object.freeze({ x: 640, y: 444, w: 160, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 200, surface: 'floor', count: 8, sizeMul: 1 }),
        // decoy ceiling spikes only above the SAFE floor start/end — not on travel path
        Object.freeze({ x: 40, surface: 'ceiling', count: 2, sizeMul: 0.85 }),
        Object.freeze({ x: 700, surface: 'ceiling', count: 2, sizeMul: 0.85 }),
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
        Object.freeze({ x: 380, surface: 'ceiling', count: 3, sizeMul: 0.9 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 260,
          y: 300,
          w: 26,
          h: 26,
          axis: 'x',
          range: 200,
          speedMul: 0.55,
          sizeMul: 1,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 尖り② — pit + choose: floor spikes on island OR ceiling path with sparse spikes
    Object.freeze({
      labelJa: '尖り②',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 200, h: 36 }),
        Object.freeze({ x: 340, y: 444, w: 160, h: 36 }),
        Object.freeze({ x: 620, y: 444, w: 180, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 360, surface: 'floor', count: 4, sizeMul: 1 }),
        // ceiling spikes only over the mid island — commit to sides of ceiling
        Object.freeze({ x: 360, surface: 'ceiling', count: 4, sizeMul: 1 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 420,
          y: 220,
          w: 24,
          h: 24,
          axis: 'y',
          range: 90,
          speedMul: 0.85,
          sizeMul: 0.95,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // 厚み — two slow movers + mixed spikes (breath before peak)
    Object.freeze({
      labelJa: '厚み',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 220, h: 36 }),
        Object.freeze({ x: 280, y: 444, w: 240, h: 36 }),
        Object.freeze({ x: 580, y: 444, w: 220, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 300, surface: 'floor', count: 4, sizeMul: 1 }),
        Object.freeze({ x: 100, surface: 'ceiling', count: 2, sizeMul: 0.9 }),
        Object.freeze({ x: 560, surface: 'ceiling', count: 3, sizeMul: 1 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 200,
          y: 320,
          w: 22,
          h: 22,
          axis: 'x',
          range: 120,
          speedMul: 0.7,
          sizeMul: 0.9,
        }),
        Object.freeze({
          x: 500,
          y: 180,
          w: 26,
          h: 26,
          axis: 'y',
          range: 80,
          speedMul: 0.75,
          sizeMul: 1,
        }),
      ]),
      spawnX: 50,
      spawnSurface: 'floor',
      goalX: 760,
    }),
    // ピーク — commit hard, but leave ceiling lanes between spike clusters
    Object.freeze({
      labelJa: 'ピーク',
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 444, w: 130, h: 36 }),
        Object.freeze({ x: 130, y: 444, w: 460, h: 36 }),
        Object.freeze({ x: 680, y: 444, w: 120, h: 36 }),
        Object.freeze({ x: 0, y: 0, w: 800, h: 36 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 160, surface: 'floor', count: 10, sizeMul: 1.05 }),
        Object.freeze({ x: 220, surface: 'ceiling', count: 3, sizeMul: 1 }),
        Object.freeze({ x: 420, surface: 'ceiling', count: 3, sizeMul: 1 }),
        Object.freeze({ x: 600, surface: 'ceiling', count: 2, sizeMul: 1 }),
      ]),
      movers: Object.freeze([
        Object.freeze({
          x: 280,
          y: 260,
          w: 26,
          h: 26,
          axis: 'x',
          range: 160,
          speedMul: 1.1,
          sizeMul: 1,
        }),
        Object.freeze({
          x: 540,
          y: 200,
          w: 28,
          h: 28,
          axis: 'y',
          range: 100,
          speedMul: 1.05,
          sizeMul: 1.1,
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
  landDustSpeedMinPixelsPerSecond: 40,
  landDustSpeedRangePixelsPerSecond: 80,
  landDustGravityPixelsPerSecondSquared: 400,
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
  howToInputArmDelayMilliseconds: 140,
  howToSlideCount: 3,
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
