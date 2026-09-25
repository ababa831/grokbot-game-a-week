/**
 * 返せ — ALL tunable numbers live here.
 * No magic numbers in the game loop.
 */
window.SEND_BACK_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 720,
  arenaHeightPixels: 480,
  arenaPaddingFromWallPixels: 10,
  arenaGridSpacingPixels: 40,

  // —— Player ——
  playerXPixels: 360,
  playerYPixels: 400,
  playerRadiusPixels: 16,
  playerMaxHitPoints: 3,
  playerHurtFlashDurationSeconds: 0.18,
  playerReflectStretchScaleX: 1.45,
  playerReflectStretchScaleY: 0.55,
  playerHurtSquashScaleX: 1.35,
  playerHurtSquashScaleY: 0.6,
  playerPoseRecoverSeconds: 0.12,
  playerInvincibleAfterHitSeconds: 0.55,
  // Optional subtle nudge (secondary — primary is reflect)
  playerNudgeSpeedPixelsPerSecond: 140,
  playerNudgeMaxOffsetPixels: 72,
  playerSafePocketHalfWidthPixels: 90,

  // —— Parry gate: a thin bar. Its shape IS the timing window. ——
  // Yellow bar = normal return. White stripe in the vertical center = perfect.
  parryGateOffsetYPixels: 78,
  parryGateHalfWidthPixels: 156,
  parryGateHalfHeightPixels: 20,
  parryPerfectHalfHeightPixels: 6,
  parryWhiffCooldownSeconds: 0.28,
  parryWhiffMaxLockSeconds: 2.4,
  reflectInputBufferSeconds: 0.05,
  perfectSpeedMul: 1.75,
  perfectDamageBonus: 1,
  perfectReturnBonus: 1,
  normalReflectSpeedMul: 1.15,
  reflectShotRadiusPixels: 9,
  reflectShotDamage: 1,

  // —— Enemy (ONE type, extreme param swings) ——
  enemyBaseRadiusPixels: 18,
  enemyHitPoints: 1,
  enemyTelegraphFlashHz: 6,
  enemyHurtFlashSeconds: 0.12,
  enemyDeathBurstCount: 10,

  // —— Shots ——
  shotRadiusPixels: 8,
  shotCoreRadiusPixels: 5,
  shotDamage: 1,
  shotOutlinePixels: 2.5,

  // —— Waves (peaky — NOT a smooth ramp). 6 waves. ——
  // enemies: {x,y,sizeMul,hp}
  // schedule: list of shot events
  //   { atSeconds, enemyIndex, speedPixelsPerSecond, telegraphSeconds, aimJitterPixels, feint?:bool, feintHoldSeconds?:number }
  waves: Object.freeze([
    // 開幕 — slow single; teaches the yellow band
    Object.freeze({
      labelJa: '開幕',
      clearTargetReturns: 3,
      enemies: Object.freeze([
        Object.freeze({ x: 360, y: 72, sizeMul: 1.1, hp: 2 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({ atSeconds: 0.7, enemyIndex: 0, speedPixelsPerSecond: 120, telegraphSeconds: 0.65, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 2.6, enemyIndex: 0, speedPixelsPerSecond: 125, telegraphSeconds: 0.6, aimJitterPixels: 8 }),
        Object.freeze({ atSeconds: 4.6, enemyIndex: 0, speedPixelsPerSecond: 130, telegraphSeconds: 0.55, aimJitterPixels: 12 }),
        Object.freeze({ atSeconds: 6.6, enemyIndex: 0, speedPixelsPerSecond: 135, telegraphSeconds: 0.5, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 8.6, enemyIndex: 0, speedPixelsPerSecond: 140, telegraphSeconds: 0.48, aimJitterPixels: 10 }),
      ]),
    }),
    // 尖り① — faster approach, tighter feel
    Object.freeze({
      labelJa: '尖り①',
      clearTargetReturns: 4,
      enemies: Object.freeze([
        Object.freeze({ x: 220, y: 70, sizeMul: 0.95, hp: 2 }),
        Object.freeze({ x: 500, y: 70, sizeMul: 0.95, hp: 2 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({ atSeconds: 0.5, enemyIndex: 0, speedPixelsPerSecond: 210, telegraphSeconds: 0.4, aimJitterPixels: 6 }),
        Object.freeze({ atSeconds: 1.5, enemyIndex: 1, speedPixelsPerSecond: 215, telegraphSeconds: 0.38, aimJitterPixels: 6 }),
        Object.freeze({ atSeconds: 2.6, enemyIndex: 0, speedPixelsPerSecond: 220, telegraphSeconds: 0.36, aimJitterPixels: 10 }),
        Object.freeze({ atSeconds: 3.5, enemyIndex: 1, speedPixelsPerSecond: 225, telegraphSeconds: 0.34, aimJitterPixels: 8 }),
        Object.freeze({ atSeconds: 4.6, enemyIndex: 0, speedPixelsPerSecond: 230, telegraphSeconds: 0.32, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 5.4, enemyIndex: 1, speedPixelsPerSecond: 235, telegraphSeconds: 0.3, aimJitterPixels: 14 }),
      ]),
    }),
    // 息継ぎ — slower dual from one, room to breathe
    Object.freeze({
      labelJa: '息継ぎ',
      clearTargetReturns: 3,
      enemies: Object.freeze([
        Object.freeze({ x: 360, y: 64, sizeMul: 1.25, hp: 3 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({ atSeconds: 0.8, enemyIndex: 0, speedPixelsPerSecond: 130, telegraphSeconds: 0.6, aimJitterPixels: 20 }),
        Object.freeze({ atSeconds: 2.6, enemyIndex: 0, speedPixelsPerSecond: 135, telegraphSeconds: 0.55, aimJitterPixels: -20 }),
        Object.freeze({ atSeconds: 4.4, enemyIndex: 0, speedPixelsPerSecond: 140, telegraphSeconds: 0.5, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 6.4, enemyIndex: 0, speedPixelsPerSecond: 145, telegraphSeconds: 0.48, aimJitterPixels: 16 }),
      ]),
    }),
    // 尖り② — multi-shot + side spawn
    Object.freeze({
      labelJa: '尖り②',
      clearTargetReturns: 5,
      enemies: Object.freeze([
        Object.freeze({ x: 100, y: 120, sizeMul: 1, hp: 2 }),
        Object.freeze({ x: 360, y: 56, sizeMul: 1, hp: 2 }),
        Object.freeze({ x: 620, y: 120, sizeMul: 1, hp: 2 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({ atSeconds: 0.4, enemyIndex: 1, speedPixelsPerSecond: 200, telegraphSeconds: 0.38, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 1.1, enemyIndex: 0, speedPixelsPerSecond: 205, telegraphSeconds: 0.36, aimJitterPixels: 8 }),
        Object.freeze({ atSeconds: 1.15, enemyIndex: 2, speedPixelsPerSecond: 205, telegraphSeconds: 0.36, aimJitterPixels: -8 }),
        Object.freeze({ atSeconds: 2.4, enemyIndex: 1, speedPixelsPerSecond: 220, telegraphSeconds: 0.32, aimJitterPixels: 12 }),
        Object.freeze({ atSeconds: 3.2, enemyIndex: 0, speedPixelsPerSecond: 230, telegraphSeconds: 0.3, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 3.55, enemyIndex: 2, speedPixelsPerSecond: 230, telegraphSeconds: 0.3, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 4.6, enemyIndex: 1, speedPixelsPerSecond: 240, telegraphSeconds: 0.28, aimJitterPixels: -10 }),
        Object.freeze({ atSeconds: 5.3, enemyIndex: 0, speedPixelsPerSecond: 245, telegraphSeconds: 0.28, aimJitterPixels: 6 }),
        Object.freeze({ atSeconds: 5.35, enemyIndex: 2, speedPixelsPerSecond: 245, telegraphSeconds: 0.28, aimJitterPixels: -6 }),
      ]),
    }),
    // 厚み — feints (telegraph then delay fire)
    Object.freeze({
      labelJa: '厚み',
      clearTargetReturns: 5,
      enemies: Object.freeze([
        Object.freeze({ x: 200, y: 68, sizeMul: 1.05, hp: 3 }),
        Object.freeze({ x: 520, y: 68, sizeMul: 1.05, hp: 3 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({
          atSeconds: 0.5,
          enemyIndex: 0,
          speedPixelsPerSecond: 195,
          telegraphSeconds: 0.45,
          aimJitterPixels: 0,
          feint: true,
          feintHoldSeconds: 0.35,
        }),
        Object.freeze({ atSeconds: 1.6, enemyIndex: 1, speedPixelsPerSecond: 200, telegraphSeconds: 0.4, aimJitterPixels: 8 }),
        Object.freeze({
          atSeconds: 2.5,
          enemyIndex: 1,
          speedPixelsPerSecond: 210,
          telegraphSeconds: 0.4,
          aimJitterPixels: 0,
          feint: true,
          feintHoldSeconds: 0.4,
        }),
        Object.freeze({ atSeconds: 3.5, enemyIndex: 0, speedPixelsPerSecond: 215, telegraphSeconds: 0.34, aimJitterPixels: -12 }),
        Object.freeze({ atSeconds: 4.2, enemyIndex: 0, speedPixelsPerSecond: 220, telegraphSeconds: 0.3, aimJitterPixels: 10 }),
        Object.freeze({ atSeconds: 4.25, enemyIndex: 1, speedPixelsPerSecond: 220, telegraphSeconds: 0.3, aimJitterPixels: -10 }),
        Object.freeze({
          atSeconds: 5.4,
          enemyIndex: 0,
          speedPixelsPerSecond: 230,
          telegraphSeconds: 0.36,
          aimJitterPixels: 0,
          feint: true,
          feintHoldSeconds: 0.28,
        }),
        Object.freeze({ atSeconds: 6.3, enemyIndex: 1, speedPixelsPerSecond: 235, telegraphSeconds: 0.28, aimJitterPixels: 6 }),
      ]),
    }),
    // ピーク — denser, faster, mixed feints
    Object.freeze({
      labelJa: 'ピーク',
      clearTargetReturns: 6,
      enemies: Object.freeze([
        Object.freeze({ x: 90, y: 100, sizeMul: 0.9, hp: 2 }),
        Object.freeze({ x: 360, y: 52, sizeMul: 1.15, hp: 3 }),
        Object.freeze({ x: 630, y: 100, sizeMul: 0.9, hp: 2 }),
      ]),
      schedule: Object.freeze([
        Object.freeze({ atSeconds: 0.35, enemyIndex: 1, speedPixelsPerSecond: 240, telegraphSeconds: 0.32, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 0.9, enemyIndex: 0, speedPixelsPerSecond: 250, telegraphSeconds: 0.28, aimJitterPixels: 10 }),
        Object.freeze({ atSeconds: 0.95, enemyIndex: 2, speedPixelsPerSecond: 250, telegraphSeconds: 0.28, aimJitterPixels: -10 }),
        Object.freeze({
          atSeconds: 1.7,
          enemyIndex: 1,
          speedPixelsPerSecond: 255,
          telegraphSeconds: 0.34,
          aimJitterPixels: 0,
          feint: true,
          feintHoldSeconds: 0.3,
        }),
        Object.freeze({ atSeconds: 2.5, enemyIndex: 0, speedPixelsPerSecond: 260, telegraphSeconds: 0.26, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 2.7, enemyIndex: 2, speedPixelsPerSecond: 260, telegraphSeconds: 0.26, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 3.3, enemyIndex: 1, speedPixelsPerSecond: 265, telegraphSeconds: 0.24, aimJitterPixels: 14 }),
        Object.freeze({ atSeconds: 3.9, enemyIndex: 0, speedPixelsPerSecond: 270, telegraphSeconds: 0.24, aimJitterPixels: 8 }),
        Object.freeze({ atSeconds: 3.95, enemyIndex: 2, speedPixelsPerSecond: 270, telegraphSeconds: 0.24, aimJitterPixels: -8 }),
        Object.freeze({
          atSeconds: 4.7,
          enemyIndex: 1,
          speedPixelsPerSecond: 275,
          telegraphSeconds: 0.3,
          aimJitterPixels: 0,
          feint: true,
          feintHoldSeconds: 0.25,
        }),
        Object.freeze({ atSeconds: 5.4, enemyIndex: 0, speedPixelsPerSecond: 280, telegraphSeconds: 0.22, aimJitterPixels: 6 }),
        Object.freeze({ atSeconds: 5.45, enemyIndex: 1, speedPixelsPerSecond: 280, telegraphSeconds: 0.22, aimJitterPixels: 0 }),
        Object.freeze({ atSeconds: 5.5, enemyIndex: 2, speedPixelsPerSecond: 280, telegraphSeconds: 0.22, aimJitterPixels: -6 }),
      ]),
    }),
  ]),

  // —— Feel: hitstop ——
  hitstopOnReflectSeconds: 0.07,
  hitstopOnPerfectSeconds: 0.09,
  hitstopOnEnemyHitSeconds: 0.06,
  hitstopOnPlayerHitSeconds: 0.1,
  hitstopOnClearSeconds: 0.08,

  // —— Feel: screen shake ——
  shakeOnReflectPixels: 6,
  shakeOnPerfectPixels: 10,
  shakeOnEnemyHitPixels: 8,
  shakeOnPlayerHitPixels: 14,
  shakeOnClearPixels: 11,
  shakeDecayPerSecond: 18,
  shakeAmountCutoffPixels: 0.15,

  // —— Feel: VFX ——
  hitMarkLifetimeSeconds: 5 / 60,
  hitMarkSizePixels: 14,
  reflectBurstParticleCount: 9,
  reflectBurstSpeedMinPixelsPerSecond: 80,
  reflectBurstSpeedRangePixelsPerSecond: 140,
  reflectBurstLifetimeSeconds: 0.2,
  perfectFlashLifetimeSeconds: 0.15,
  calloutLifetimeSeconds: 0.55,

  // —— Audio ——
  ambientVolumeLinear: 0.045,
  reflectVolumeLinear: 0.7,
  perfectVolumeLinear: 0.8,
  hurtVolumeLinear: 0.55,
  enemyHitVolumeLinear: 0.6,
  clearVolumeLinear: 0.7,
  koVolumeLinear: 0.85,
  whiffVolumeLinear: 0.25,
  telegraphVolumeLinear: 0.22,
  pitchShiftRandomFraction: 0.1,
  attackPeakDecaySeconds: 0.08,
  attackReverbTailSeconds: 0.2,

  // —— UI / flow ——
  deathsOnSameWaveBeforeSkipButton: 2,
  overlayInputArmDelayMilliseconds: 200,
  howToInputArmDelayMilliseconds: 140,
  howToSlideCount: 3,
  clearPopupDurationSeconds: 0.85,
  waveBreathSeconds: 0.35,
  scheduleLoopPaddingSeconds: 1.4,

  // —— Colors ——
  colorArenaFloor: '#10141c',
  colorArenaFloorTop: '#161c28',
  colorGridLine: '#1c2432',
  colorSafePocket: '#182030',
  colorSafePocketEdge: '#2a3548',
  colorPlayerBody: '#0a0a0a',
  colorPlayerEdge: '#f0e6d2',
  colorPlayerAccent: '#ffcc33',
  colorParryZone: '#ffcc33',
  colorParryZoneActive: '#ffe066',
  colorParryZoneEdge: '#1a1200',
  colorEnemy: '#e84855',
  colorEnemyEdge: '#1a0508',
  colorEnemyTelegraph: '#ff8a70',
  colorShot: '#ff6b6b',
  colorShotEdge: '#1a0508',
  colorShotCore: '#fff0e8',
  colorReflectShot: '#66d9ef',
  colorReflectShotEdge: '#041018',
  colorReflectShotCore: '#fff8e7',
  colorHudText: '#f4f0e6',
  colorHpFilled: '#ff5c5c',
  colorHpEmpty: '#3a3f4b',
  colorScoreAccent: '#ffcc33',
  colorBestAccent: '#ff9f1c',
  colorWaveAccent: '#66d9ef',
  colorVfxCore: '#fff8e7',
  colorVfxEdge: '#0a0a0a',
  colorPerfect: '#ffe066',

  // —— Sim clamps ——
  maxFrameDeltaSeconds: 0.05,
  fixedTimestepSeconds: 1 / 60,
  playerInvulnBlinkHz: 18,

  // —— Debug ——
  debugHitboxStrokeColor: '#00ff88',
  debugHitboxLineWidthPixels: 1.5,
});
