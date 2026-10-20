/**
 * かこい商店 — ALL tunable numbers live here.
 */
window.KAKOI_CONFIG = Object.freeze({
  // —— Arena ——
  arenaWidthPixels: 720,
  arenaHeightPixels: 520,
  hudBandHeightPixels: 56,
  cellSizePixels: 8,
  // playfield inside arena (below HUD band drawn in HTML; canvas is field only)
  fieldCols: 88,
  fieldRows: 58,
  borderThicknessCells: 2,

  // —— Player / line ——
  playerRadiusPixels: 9,
  lineWidthPixels: 3.5,
  drawSpeedPixelsPerSecond: 245,
  borderMoveSpeedPixelsPerSecond: 280,
  pointerFollowDeadzonePixels: 4,
  startDrawMinDistanceFromBorderPixels: 2,
  closeSnapDistancePixels: 36,
  closeReleaseAssistPixels: 56,
  selfTrailHitRadiusPixels: 5,
  fuseStartIdleSeconds: 0.4,
  fuseSpeedPixelsPerSecond: 240,
  fuseRadiusPixels: 5,
  hitInvincibleSeconds: 0.9,
  trailCancelFlashSeconds: 0.25,

  // —— Customers ——
  customerStartCount: 10,
  customerMaxCount: 30,
  customerRadiusPixels: 9,
  customerWanderSpeedPixelsPerSecond: 32,
  customerLureSpeedPixelsPerSecond: 100,
  customerLureRadiusPixels: 200,
  customerLureGlobalPullPixelsPerSecond: 22,
  customerBorderApproachBias: 0.9,
  customerSpawnPaddingCells: 4,
  customerValueYen: 30,
  customerComboBonusYen: 8,
  customerDriftChangeSecondsMin: 0.8,
  customerDriftChangeSecondsMax: 2.2,

  // —— Debt collectors ——
  collectorStartCount: 1,
  collectorMaxCount: 2,
  collectorSecondAppearsOnDay: 3,
  collectorRadiusPixels: 11,
  collectorSpeedPixelsPerSecond: 66,
  collectorChaseLineBonusPixelsPerSecond: 16,
  collectorWanderChangeSeconds: 1.4,
  collectorHitPlayerRadiusPixels: 11,
  collectorTelegraphDistancePixels: 52,
  collectorLineChaseDelaySeconds: 2.5,

  // —— Day / economy ——
  dayDurationSeconds: 45,
  baseRentYen: 80,
  rentGrowthPerDayYen: 48,
  rentGrowthExponent: 1.1,
  startingLives: 1,
  customersPerDaySpawnExtra: 3,

  // —— Upgrades ——
  upgradeOfferCount: 3,
  upgrades: Object.freeze([
    Object.freeze({
      id: 'line_speed',
      nameJa: '線がはやい',
      descJa: '描線の速さ +22%',
      stackMax: 4,
    }),
    Object.freeze({
      id: 'lure',
      nameJa: '客がより寄る',
      descJa: '枠待ちの誘引範囲 +40%',
      stackMax: 4,
    }),
    Object.freeze({
      id: 'life',
      nameJa: 'もういのち',
      descJa: '残機が 1 増える',
      stackMax: 5,
    }),
    Object.freeze({
      id: 'slow_debt',
      nameJa: '取立てがおそい',
      descJa: '取立ての速さ −18%',
      stackMax: 3,
    }),
  ]),
  upgradeLineSpeedMulPerStack: 1.22,
  upgradeLureRadiusMulPerStack: 1.4,
  upgradeCollectorSpeedMulPerStack: 0.82,

  // —— Feel ——
  hitstopOnCaptureSeconds: 0.08,
  hitstopOnHitSeconds: 0.1,
  hitstopOnDayClearSeconds: 0.06,
  shakeOnCapturePixels: 7,
  shakeOnBigCapturePixels: 12,
  shakeOnHitPixels: 14,
  shakeOnGameOverPixels: 18,
  shakeDecayPerSecond: 16,
  shakeAmountCutoffPixels: 0.12,
  captureParticleCountBase: 10,
  captureParticleCountPerCustomer: 4,
  captureParticleSpeedMin: 60,
  captureParticleSpeedRange: 160,
  captureParticleLifeSeconds: 0.45,
  yenPopupLifeSeconds: 0.7,
  fillFlashSeconds: 0.28,
  screenFlashSeconds: 0.12,

  // —— Audio ——
  ambientVolumeLinear: 0.03,
  drawHumVolumeLinear: 0.08,
  captureVolumeLinear: 0.72,
  hitVolumeLinear: 0.6,
  dayClearVolumeLinear: 0.65,
  gameOverVolumeLinear: 0.8,
  uiClickVolumeLinear: 0.35,
  pitchShiftRandomFraction: 0.08,

  // —— Colors (daytime shop — not purple / not cream-terracotta) ——
  colorFieldFloor: '#d9cbb0',
  colorFieldFloorAlt: '#d2c3a6',
  colorClaimed: '#8fbfa0',
  colorClaimedEdge: '#5a8f6c',
  colorBorderSafe: '#2f5d4e',
  colorTrail: '#1a8a9e',
  colorTrailCore: '#e8fbff',
  colorPlayer: '#1b3a34',
  colorPlayerEdge: '#f4fff8',
  colorCustomer: '#f0a04b',
  colorCustomerEdge: '#5a3208',
  colorCollector: '#c62828',
  colorCollectorEdge: '#2a0606',
  colorCollectorTelegraph: '#ff7043',
  colorFuse: '#ff3d00',
  colorHudText: '#1a2420',
  colorHudBand: '#efe6d4',
  colorRent: '#b33a2b',
  colorSales: '#1b6b4a',
  colorTimer: '#2a4a5e',
  colorDangerFlash: 'rgba(198,40,40,0.35)',
  colorTitleBg: '#1e3d36',

  // —— Sim ——
  maxFrameDeltaSeconds: 0.05,
  fixedTimestepSeconds: 1 / 60,
  overlayInputArmDelayMilliseconds: 160,

  // —— Debug ——
  debugHitboxStrokeColor: '#006644',
  debugHitboxLineWidthPixels: 1.2,
});
