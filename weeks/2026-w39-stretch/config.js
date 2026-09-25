/**
 * 伸ばせ — ALL tunable numbers live here.
 * No magic numbers in the game loop.
 */
window.STRETCH_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 720,
  arenaHeightPixels: 480,
  arenaPaddingFromWallPixels: 10,
  arenaGridSpacingPixels: 40,

  // —— Player core ——
  playerCoreRadiusPixels: 16,
  playerMaxHitPoints: 3,
  playerHurtFlashDurationSeconds: 0.18,
  playerInvincibleAfterHitSeconds: 0.85,
  playerSpawnInvincibleSeconds: 2.2,
  playerSpawnXRatio: 0.5,
  playerSpawnYRatio: 0.5,
  playerPoseRecoverSeconds: 0.16,
  playerIdleBobHz: 2.2,
  playerIdleBobPixels: 2,

  // —— Stretch (core verb) ——
  stretchGrowPixelsPerSecond: 300,
  stretchGrowWarningPixelsPerSecond: 150,
  stretchGrowDangerPixelsPerSecond: 120,
  stretchMinLengthPixels: 18,
  stretchMaxSafeLengthPixels: 240,
  stretchSnapLengthPixels: 320,
  stretchWarningRatio: 0.55,
  stretchTipRadiusPixels: 14,
  stretchBodyHalfWidthPixels: 10,
  stretchReleaseSnapForcePixelsPerSecond: 520,
  stretchSlingshotForcePixelsPerSecond: 680,
  stretchSlingshotDecayPerSecond: 4.2,
  stretchSnapbackDurationSeconds: 0.18,
  stretchOverstretchSelfDamage: 1,
  stretchGrabCooldownSeconds: 0.12,
  stretchHeldShakeMaxPixels: 3.5,
  stretchTensionPulseHz: 6,

  // —— Grab targets (stars / orbs) ——
  targetRadiusPixels: 14,
  targetSpawnIntervalSeconds: 2.0,
  targetMaxAlive: 4,
  targetLifetimeSeconds: 11,
  targetEdgePaddingPixels: 48,
  targetOpenerDistancePixels: 255,
  targetOpenerAngleRadians: -0.785,
  targetNearMinPixels: 200,
  targetNearMaxPixels: 300,
  targetFarChance: 0.22,
  targetFarMinPixels: 340,
  targetFarMaxPixels: 400,
  targetFarUnlockGrabs: 1,
  targetRingKeepRatio: 0.86,
  targetPulseHz: 2.4,
  targetGrabScore: 1,

  // —— Enemies (ONE archetype, size/speed params) ——
  enemyBaseRadiusPixels: 14,
  enemyBaseSpeedPixelsPerSecond: 52,
  enemyHitDamage: 1,
  enemyGrabScore: 1,
  enemyRespawnDelaySeconds: 2.4,
  enemySpawnEdgePaddingPixels: 36,
  enemyMinSpawnDistanceFromPlayerPixels: 200,
  enemyInitialSpawnHorizontal: true,
  enemyVariants: Object.freeze([
    Object.freeze({ sizeMul: 0.85, speedMul: 1.15 }),
    Object.freeze({ sizeMul: 1.0, speedMul: 0.9 }),
    Object.freeze({ sizeMul: 1.25, speedMul: 0.65 }),
    Object.freeze({ sizeMul: 0.95, speedMul: 1.0 }),
  ]),
  enemyMaxAlive: 3,
  enemyInitialCount: 1,
  enemyWaveEveryGrabs: 4,

  // —— Feel: hitstop ——
  hitstopOnGrabSeconds: 0.07,
  hitstopOnEnemySlapSeconds: 0.09,
  hitstopOnOverstretchSnapSeconds: 0.08,
  hitstopOnHurtSeconds: 0.06,

  // —— Feel: screen shake ——
  shakeOnGrabPixels: 6,
  shakeOnEnemySlapPixels: 10,
  shakeOnOverstretchSnapPixels: 14,
  shakeOnHurtPixels: 11,
  shakeDecayPerSecond: 18,
  shakeAmountCutoffPixels: 0.15,

  // —— Feel: VFX ——
  grabBurstParticleCount: 10,
  grabBurstSpeedMinPixelsPerSecond: 80,
  grabBurstSpeedRangePixelsPerSecond: 160,
  grabBurstLifetimeSeconds: 0.22,
  snapParticleCount: 8,
  snapBurstLifetimeSeconds: 0.18,
  floatTextLifetimeSeconds: 0.55,
  floatTextRisePixelsPerSecond: 48,

  // —— Audio ——
  ambientVolumeLinear: 0.04,
  stretchHumVolumeLinear: 0.12,
  grabVolumeLinear: 0.7,
  releaseVolumeLinear: 0.55,
  snapVolumeLinear: 0.8,
  hurtVolumeLinear: 0.55,
  koVolumeLinear: 0.85,
  pitchShiftRandomFraction: 0.1,
  attackPeakDecaySeconds: 0.08,
  attackReverbTailSeconds: 0.18,

  // —— UI / flow ——
  overlayInputArmDelayMilliseconds: 180,
  deathRetryDelaySeconds: 0.55,
  howToSlideCount: 2,

  // —— Colors ——
  colorArenaFloor: '#10141c',
  colorArenaFloorTop: '#182028',
  colorGridLine: '#1c2430',
  colorPlayerBody: '#7dffb3',
  colorPlayerEdge: '#0a0a0a',
  colorPlayerAccent: '#ffe566',
  colorStretchBody: '#5ee89a',
  colorStretchWarn: '#ffcc33',
  colorStretchDanger: '#ff5c5c',
  colorStretchTip: '#fff8e7',
  colorTarget: '#ffe566',
  colorTargetEdge: '#1a1200',
  colorEnemy: '#ff4d6d',
  colorEnemyEdge: '#1a0508',
  colorHudText: '#f4f0e6',
  colorHpFilled: '#ff5c5c',
  colorHpEmpty: '#3a3f4b',
  colorScoreAccent: '#ffe566',
  colorBestAccent: '#ff9f1c',
  colorVfxCore: '#fff8e7',
  colorVfxEdge: '#0a0a0a',
  colorAimLine: '#3ecf8e',

  // —— Sim clamps ——
  maxFrameDeltaSeconds: 0.05,
  fixedTimestepSeconds: 1 / 60,
  playerInvulnBlinkHz: 16,

  // —— Debug ——
  debugHitboxStrokeColor: '#00ff88',
  debugHitboxLineWidthPixels: 1.5,
});
