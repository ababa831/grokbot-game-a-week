/**
 * 置いて逃げろ — ALL tunable numbers live here.
 * Names are verbose (spoken Japanese / English) so nothing is a magic number in the loop.
 */
window.PLACE_AND_RUN_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 720,
  arenaHeightPixels: 480,
  arenaPaddingFromWallPixels: 28,

  // —— Player ——
  playerRadiusPixels: 14,
  playerMoveSpeedPixelsPerSecond: 220,
  playerMaxHitPoints: 3,
  playerHurtFlashDurationSeconds: 0.18,
  playerPlantPoseDurationSeconds: 0.12,
  playerHurtSquashScaleX: 1.45,
  playerHurtSquashScaleY: 0.55,
  playerPlantStretchScaleX: 0.7,
  playerPlantStretchScaleY: 1.35,
  playerInvincibleAfterHitSeconds: 0.55,

  // —— Burst (the core verb) ——
  plantDelaySeconds: 0.45,
  plantCooldownSeconds: 0.35,
  burstRadiusPixels: 58,
  burstDamageToEnemyHitPoints: 1,
  burstDamageToPlayerHitPoints: 1,
  burstFlashDurationSeconds: 2 / 60,
  burstFireDurationSeconds: 10 / 60,
  burstSmokeDurationSeconds: 6 / 60,
  burstWarningPulseHz: 6,

  // —— Enemies (ONE body, parameter variety only) ——
  enemyBaseRadiusPixels: 16,
  enemyBaseSpeedPixelsPerSecond: 70,
  enemyBaseHitPoints: 1,
  enemySpawnMarginOutsideArenaPixels: 40,
  enemyKnockbackOnHitPixels: 18,
  enemyDeathShrinkDurationSeconds: 0.12,

  // —— Waves (peaky — NOT a smooth ramp) ——
  waveClearBreathSeconds: 1.1,
  waveEnemySpawnStaggerSeconds: 0.18,
  // Each wave: count, speedMul, sizeMul, hp, color hex, label
  waves: Object.freeze([
    // easy opener
    Object.freeze({ enemyCount: 3, speedMultiplier: 0.85, sizeMultiplier: 1.0, hitPoints: 1, colorHex: '#3ecf8e', labelJa: '開幕' }),
    // spike
    Object.freeze({ enemyCount: 8, speedMultiplier: 1.15, sizeMultiplier: 0.9, hitPoints: 1, colorHex: '#ff5c5c', labelJa: '尖り①' }),
    // breath
    Object.freeze({ enemyCount: 4, speedMultiplier: 0.75, sizeMultiplier: 1.25, hitPoints: 1, colorHex: '#6ec8ff', labelJa: '息継ぎ' }),
    // harder spike
    Object.freeze({ enemyCount: 12, speedMultiplier: 1.35, sizeMultiplier: 0.85, hitPoints: 1, colorHex: '#ff9f1c', labelJa: '尖り②' }),
    // breath
    Object.freeze({ enemyCount: 5, speedMultiplier: 0.9, sizeMultiplier: 1.1, hitPoints: 2, colorHex: '#b388ff', labelJa: '厚み' }),
    // peak
    Object.freeze({ enemyCount: 16, speedMultiplier: 1.5, sizeMultiplier: 0.8, hitPoints: 1, colorHex: '#ff2d95', labelJa: '包み時' }),
  ]),

  // —— Feel: hitstop ——
  hitstopOnSingleConnectSeconds: 0.06,
  hitstopOnMultiWrapSeconds: 0.1,
  hitstopMinimumWrapCountForExtra: 3,

  // —— Feel: screen shake ——
  shakeOnSingleWrapPixels: 5,
  shakeOnMultiWrapPixels: 14,
  shakeDecayPerSecond: 18,
  shakeRandomJitterStrength: 1.0,

  // —— Feel: hit marks ——
  hitMarkLifetimeSeconds: 5 / 60,
  hitMarkSizePixels: 10,
  hitMarkSpikeCount: 4,

  // —— Audio ——
  ambientVolumeLinear: 0.06,
  attackPeakVolumeLinear: 0.55,
  hitVolumeLinear: 0.7,
  koVolumeLinear: 0.85,
  plantClickVolumeLinear: 0.35,
  hurtVolumeLinear: 0.5,
  pitchShiftRandomFraction: 0.1,
  attackPeakDecaySeconds: 0.08,
  attackReverbTailSeconds: 0.22,
  hitClickDecaySeconds: 0.06,

  // —— UI / flow ——
  titleSkipAnyKey: true,
  deathsOnSameWaveBeforeSkipButton: 2,
  overlayInputArmDelayMilliseconds: 200,
  startOverlayGiantFontPixels: 96,
  wrapPopupDurationSeconds: 0.7,
  wrapPopupBigThreshold: 3,

  // —— Colors (readable, high contrast) ——
  colorArenaFloor: '#1a1d24',
  colorArenaBorder: '#2e3440',
  colorPlayerBody: '#f4f0e6',
  colorPlayerEdge: '#0a0a0a',
  colorPlayerPlantButtonHint: '#ffcc33',
  colorMoveHint: '#66d9ef',
  colorBurstWarning: '#ffcc33',
  colorBurstFlash: '#fff8e7',
  colorBurstFire: '#ff6a00',
  colorBurstFireEdge: '#1a0500',
  colorBurstSmoke: '#2a2a2e',
  colorHitMark: '#ffffff',
  colorHitMarkEdge: '#000000',
  colorHudText: '#f4f0e6',
  colorHpFilled: '#ff5c5c',
  colorHpEmpty: '#3a3f4b',
  colorWrapAccent: '#ffcc33',
  colorBestWrapAccent: '#ff9f1c',

  // —— Arena decoration / sim clamps ——
  arenaGridSpacingPixels: 40,
  maxFrameDeltaSeconds: 0.05,
  shakeAmountCutoffPixels: 0.15,
  playerInvulnBlinkHz: 20,
  enemyEyeRadiusFractionOfBody: 0.22,
  enemyEyeOffsetFractionOfBody: 0.35,
  burstWarningCrosshairArmPixels: 10,
  burstWarningOuterLineWidthPixels: 5,
  burstWarningBrightLineWidthPixels: 4,
  burstWarningFillAlphaExtra: 0.15,
  burstWarningDiskAlphaBase: 0.2,
  burstWarningDiskAlphaPulse: 0.15,
  burstWarningFillAlphaBase: 0.12,
  burstWarningFillAlphaPulse: 0.1,
  burstWarningStrokeAlphaBase: 0.35,
  burstWarningStrokeAlphaPulse: 0.5,
  burstSpikyPointCount: 10,
  hitMarkSpinRadiansOverLife: 0.4,

  // —— Debug (shipped) ——
  debugHitboxStrokeColor: '#00ff88',
  debugHitboxLineWidthPixels: 1.5,
});
