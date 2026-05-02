export const psButtonIndices = Object.freeze({
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  touchpad: 8,
  options: 9,
  l3: 10,
  r3: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15
});

export const psSemanticActions = Object.freeze({
  primary: psButtonIndices.cross,
  confirm: psButtonIndices.cross,
  jump: psButtonIndices.cross,

  secondary: psButtonIndices.circle,
  cancel: psButtonIndices.circle,
  crouch: psButtonIndices.circle,

  reload: psButtonIndices.square,
  interact: psButtonIndices.square,

  switchWeapon: psButtonIndices.triangle,
  special: psButtonIndices.triangle,

  tactical: psButtonIndices.l1,
  lethal: psButtonIndices.r1,
  ads: psButtonIndices.l2,
  aim: psButtonIndices.l2,
  fire: psButtonIndices.r2,
  attack: psButtonIndices.r2,

  tacticalMap: psButtonIndices.touchpad,
  pause: psButtonIndices.options,
  sprint: psButtonIndices.l3,
  melee: psButtonIndices.r3,

  ping: psButtonIndices.dpadUp,
  armor: psButtonIndices.dpadDown,
  nightVision: psButtonIndices.dpadDown,
  fireMode: psButtonIndices.dpadLeft,
  streak: psButtonIndices.dpadRight
});

export class ControllerManager {
  constructor({ getGamepads = () => globalThis.navigator?.getGamepads?.() || [], actionMap = psSemanticActions } = {}) {
    this.getGamepads = getGamepads;
    this.actionMap = actionMap;
  }

  readGamepads() {
    return Array.from(this.getGamepads())
      .filter((pad) => pad?.connected && pad.mapping === "standard")
      .sort((a, b) => a.index - b.index);
  }

  buttonIndexForAction(action) {
    if (typeof action === "number") return action;
    return this.actionMap[action];
  }

  buttonValue(action, pad) {
    const index = this.buttonIndexForAction(action);
    if (!Number.isInteger(index)) return 0;
    return pad?.buttons?.[index] || 0;
  }

  isPressed(action, pad, threshold = 0.2) {
    return this.buttonValue(action, pad) > threshold;
  }

  wasPressed(action, pad, threshold = 0.2) {
    const index = this.buttonIndexForAction(action);
    if (!Number.isInteger(index)) return false;
    return (pad?.buttons?.[index] || 0) > threshold && (pad?.prevButtons?.[index] || 0) <= threshold;
  }

  jump(pad) {
    return this.wasPressed("jump", pad);
  }

  attack(pad) {
    return this.isPressed("attack", pad, 0.12);
  }

  interact(pad) {
    return this.isPressed("interact", pad, 0.4);
  }

  promptButtonIndex(action) {
    return this.buttonIndexForAction(action);
  }
}
