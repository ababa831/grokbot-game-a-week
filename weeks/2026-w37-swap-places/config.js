/**
 * 置き換えろ — ALL tunable numbers live here.
 * No magic numbers in the game loop.
 */
window.SWAP_PLACES_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 720,
  arenaHeightPixels: 480,
  arenaPaddingFromWallPixels: 8,
  arenaGridSpacingPixels: 40,

  // —— Player ——
  playerRadiusPixels: 14,
  playerMoveSpeedPixelsPerSecond: 200,
  playerMaxHitPoints: 3,
  playerHurtFlashDurationSeconds: 0.18,
  playerSwapStretchScaleX: 0.55,
  playerSwapStretchScaleY: 1.45,
  playerHurtSquashScaleX: 1.4,
  playerHurtSquashScaleY: 0.55,
  playerPoseRecoverSeconds: 0.14,
  playerInvincibleAfterHitSeconds: 0.65,
  pointerMoveDeadzonePixels: 20,
  clickMoveArriveDistancePixels: 8,

  // —— Swap (core verb) ——
  swapStunSeconds: 0.28,
  swapCooldownSeconds: 0.08,
  swapClickPickRadiusPixels: 28,
  swapNearestMaxDistancePixels: 120,
  swapHighlightPulseHz: 3.5,
  swapInvincibleSeconds: 0.12,
  swapVfxLifetimeSeconds: 0.2,
  swapTrailLifetimeSeconds: 0.16,

  // —— Key / exit ——
  keyRadiusPixels: 11,
  keyPickupDistancePixels: 18,
  exitWidthPixels: 44,
  exitHeightPixels: 44,
  exitEnterPaddingPixels: 6,

  // —— Swap stone ——
  swapStoneRadiusPixels: 13,

  // —— Hazards (ONE enemy body, params only) ——
  enemyBaseRadiusPixels: 15,
  enemyBaseSpeedPixelsPerSecond: 78,
  enemyHitDamage: 1,
  spikeDamage: 1,
  spikeHurtCooldownSeconds: 0.35,
  holeLethal: true,

  // —— Rooms (peaky — NOT a smooth ramp). 6 rooms. ——
  // walls/spikes/holes: {x,y,w,h}
  // enemies: {x,y,speedMul,sizeMul}
  // keys: {x,y}
  // stones: {x,y}
  // exit: {x,y} center
  // keysRequired: number to open exit
  rooms: Object.freeze([
    // 開幕 — floor spikes tax the straight line; top walk or stone swap skips them
    Object.freeze({
      labelJa: '開幕',
      keysRequired: 1,
      spawnX: 80,
      spawnY: 240,
      exit: Object.freeze({ x: 650, y: 240 }),
      walls: Object.freeze([
        Object.freeze({ x: 300, y: 0, w: 28, h: 176 }),
        Object.freeze({ x: 300, y: 304, w: 28, h: 176 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 196, y: 196, w: 92, h: 88 }),
      ]),
      holes: Object.freeze([]),
      enemies: Object.freeze([
        Object.freeze({ x: 460, y: 360, speedMul: 0.5, sizeMul: 1 }),
      ]),
      keys: Object.freeze([Object.freeze({ x: 580, y: 120 })]),
      stones: Object.freeze([Object.freeze({ x: 520, y: 240 })]),
    }),
    // 尖り① — two walls; stone skips the first; spikes tax the middle climb
    Object.freeze({
      labelJa: '尖り①',
      keysRequired: 1,
      spawnX: 70,
      spawnY: 400,
      exit: Object.freeze({ x: 650, y: 70 }),
      walls: Object.freeze([
        Object.freeze({ x: 220, y: 88, w: 28, h: 392 }),
        Object.freeze({ x: 460, y: 0, w: 28, h: 392 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 288, y: 288, w: 124, h: 40 }),
      ]),
      holes: Object.freeze([]),
      enemies: Object.freeze([
        Object.freeze({ x: 360, y: 160, speedMul: 0.85, sizeMul: 0.95 }),
      ]),
      keys: Object.freeze([Object.freeze({ x: 600, y: 400 })]),
      stones: Object.freeze([Object.freeze({ x: 340, y: 400 })]),
    }),
    // 息継ぎ — pillar detour; spikes tax the short lane; stone skips both
    Object.freeze({
      labelJa: '息継ぎ',
      keysRequired: 1,
      spawnX: 80,
      spawnY: 240,
      exit: Object.freeze({ x: 640, y: 400 }),
      walls: Object.freeze([
        Object.freeze({ x: 330, y: 120, w: 36, h: 240 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 384, y: 200, w: 100, h: 40 }),
      ]),
      holes: Object.freeze([]),
      enemies: Object.freeze([
        Object.freeze({ x: 400, y: 360, speedMul: 0.45, sizeMul: 1.15 }),
      ]),
      keys: Object.freeze([Object.freeze({ x: 600, y: 140 })]),
      stones: Object.freeze([Object.freeze({ x: 500, y: 240 })]),
    }),
    // 尖り② — hole river; stone jumps it; right walk pays a spike tax
    Object.freeze({
      labelJa: '尖り②',
      keysRequired: 1,
      spawnX: 70,
      spawnY: 70,
      exit: Object.freeze({ x: 650, y: 420 }),
      walls: Object.freeze([]),
      spikes: Object.freeze([
        Object.freeze({ x: 576, y: 208, w: 88, h: 72 }),
      ]),
      holes: Object.freeze([
        Object.freeze({ x: 0, y: 200, w: 560, h: 88 }),
      ]),
      enemies: Object.freeze([
        Object.freeze({ x: 400, y: 380, speedMul: 0.95, sizeMul: 1 }),
      ]),
      keys: Object.freeze([Object.freeze({ x: 220, y: 400 })]),
      stones: Object.freeze([Object.freeze({ x: 80, y: 360 })]),
    }),
    // 厚み — floor spikes on the long walk and middle lane; stone skips wall A
    Object.freeze({
      labelJa: '厚み',
      keysRequired: 2,
      spawnX: 60,
      spawnY: 240,
      exit: Object.freeze({ x: 660, y: 240 }),
      walls: Object.freeze([
        Object.freeze({ x: 200, y: 0, w: 24, h: 360 }),
        Object.freeze({ x: 420, y: 120, w: 24, h: 360 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 160, y: 392, w: 120, h: 36 }),
        Object.freeze({ x: 248, y: 168, w: 140, h: 32 }),
      ]),
      holes: Object.freeze([
        Object.freeze({ x: 300, y: 400, w: 64, h: 48 }),
      ]),
      enemies: Object.freeze([
        Object.freeze({ x: 310, y: 300, speedMul: 0.85, sizeMul: 1 }),
        Object.freeze({ x: 520, y: 180, speedMul: 0.95, sizeMul: 0.95 }),
      ]),
      keys: Object.freeze([
        Object.freeze({ x: 310, y: 80 }),
        Object.freeze({ x: 520, y: 400 }),
      ]),
      stones: Object.freeze([Object.freeze({ x: 300, y: 240 })]),
    }),
    // ピーク — floor spikes tax the top detour and the right lane
    Object.freeze({
      labelJa: 'ピーク',
      keysRequired: 2,
      spawnX: 50,
      spawnY: 430,
      exit: Object.freeze({ x: 660, y: 50 }),
      walls: Object.freeze([
        Object.freeze({ x: 240, y: 80, w: 28, h: 400 }),
      ]),
      spikes: Object.freeze([
        Object.freeze({ x: 196, y: 20, w: 140, h: 32 }),
        Object.freeze({ x: 400, y: 300, w: 80, h: 36 }),
      ]),
      holes: Object.freeze([
        Object.freeze({ x: 80, y: 170, w: 140, h: 80 }),
        Object.freeze({ x: 500, y: 280, w: 80, h: 70 }),
      ]),
      enemies: Object.freeze([
        Object.freeze({ x: 400, y: 200, speedMul: 1.1, sizeMul: 0.9 }),
        Object.freeze({ x: 560, y: 160, speedMul: 1.05, sizeMul: 1 }),
      ]),
      keys: Object.freeze([
        Object.freeze({ x: 380, y: 70 }),
        Object.freeze({ x: 620, y: 400 }),
      ]),
      stones: Object.freeze([Object.freeze({ x: 360, y: 400 })]),
    }),
  ]),

  // —— Feel: hitstop ——
  hitstopOnSwapSeconds: 0.06,
  hitstopOnHazardHitSeconds: 0.1,
  hitstopOnKeyPickupSeconds: 0.05,
  hitstopOnClearSeconds: 0.08,

  // —— Feel: screen shake ——
  shakeOnSwapPixels: 7,
  shakeOnHazardHitPixels: 12,
  shakeOnKeyPickupPixels: 5,
  shakeOnClearPixels: 10,
  shakeDecayPerSecond: 18,
  shakeAmountCutoffPixels: 0.15,

  // —— Feel: VFX ——
  hitMarkLifetimeSeconds: 5 / 60,
  hitMarkSizePixels: 12,
  swapBurstParticleCount: 8,
  swapBurstSpeedMinPixelsPerSecond: 60,
  swapBurstSpeedRangePixelsPerSecond: 120,
  swapBurstLifetimeSeconds: 0.18,

  // —— Audio ——
  ambientVolumeLinear: 0.05,
  swapVolumeLinear: 0.65,
  keyVolumeLinear: 0.55,
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

  // —— Colors ——
  colorArenaFloor: '#12161e',
  colorArenaFloorTop: '#182030',
  colorGridLine: '#1e2633',
  colorWall: '#3a4455',
  colorWallEdge: '#0a0a0a',
  colorWallTop: '#5a6a7e',
  colorPlayerBody: '#f0e6d2',
  colorPlayerEdge: '#0a0a0a',
  colorPlayerAccent: '#ffcc33',
  colorEnemy: '#e84855',
  colorEnemyEdge: '#1a0508',
  colorSpike: '#c43c48',
  colorSpikeEdge: '#1a0508',
  colorHole: '#06080c',
  colorHoleEdge: '#2a3140',
  colorKey: '#ffcc33',
  colorKeyEdge: '#1a1200',
  colorStone: '#66d9ef',
  colorStoneEdge: '#041018',
  colorExitLocked: '#3a3f4b',
  colorExitOpen: '#3ecf8e',
  colorExitEdge: '#0a1a10',
  colorHudText: '#f4f0e6',
  colorHpFilled: '#ff5c5c',
  colorHpEmpty: '#3a3f4b',
  colorScoreAccent: '#ffcc33',
  colorBestAccent: '#ff9f1c',
  colorSwapHint: '#66d9ef',
  colorVfxCore: '#fff8e7',
  colorVfxEdge: '#0a0a0a',
  colorHighlight: '#66d9ef',
  colorMoveHint: '#3ecf8e',

  // —— Sim clamps ——
  maxFrameDeltaSeconds: 0.05,
  fixedTimestepSeconds: 1 / 60,
  playerInvulnBlinkHz: 18,

  // —— Debug ——
  debugHitboxStrokeColor: '#00ff88',
  debugHitboxLineWidthPixels: 1.5,
});
