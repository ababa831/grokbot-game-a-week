/* かこい商店 — 数値はすべてここ。曖昧な「適度」は置かない。 */
var KConfig = {
  FIELD_W: 480,
  FIELD_H: 360,
  CELL: 8,
  DAY_SEC: 45,
  MIN_LINE: 5,
  DRAW_SPEED: 200,
  SWIFT_ADD: 42,
  PLAYER_SPEED: 320,
  WANDER_SPEED: 16,
  LURE_RADIUS: 168,
  LURE_RADIUS_ADD: 34,
  LURE_SPEED: 108,
  VALUE: 26,
  PRICE_ADD: 8,
  BUNDLE_ADD: 12,
  STALL: 0.42,
  FUSE_ADD: 0.2,
  FUSE_WARN: 0.25,
  FUSE_SPEED: 170,
  COLLECTOR_SPEED: 54,
  COLLECTOR_SPEED_DAY: 9,
  COLLECTOR_SPEED_CAP: 120,
  CHASE_MULT: 1.5,
  TELEGRAPH: 0.3,
  HIT_STUN: 0.45,
  LINE_HALF: 4.5,
  CUST_R: 8,
  COL_R: 11,
  WARN_UNDER: 10,
  BLINK_FOR: 3,
  CROWD_ADD: 4,
  SECOND_COLLECTOR_DAY: 3,

  rent: function (day) {
    return 60 + 62 * day + 12 * day * day;
  },
  customerCount: function (day, extra) {
    return Math.min(30, 10 + (day - 1) * 3 + extra);
  },
  collectorCount: function (day) {
    return day >= 3 ? 2 : 1;
  },
};
