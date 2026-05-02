const makePrompt = (label, name, iconPath = null) => Object.freeze({ label, name, iconPath });

export const controllerPromptLayouts = Object.freeze({
  xbox: Object.freeze({
    0: makePrompt("A", "A"),
    1: makePrompt("B", "B"),
    2: makePrompt("X", "X"),
    3: makePrompt("Y", "Y"),
    4: makePrompt("LB", "Left bumper"),
    5: makePrompt("RB", "Right bumper"),
    6: makePrompt("LT", "Left trigger"),
    7: makePrompt("RT", "Right trigger"),
    8: makePrompt("View", "View"),
    9: makePrompt("Menu", "Menu"),
    10: makePrompt("LS", "Left stick"),
    11: makePrompt("RS", "Right stick"),
    12: makePrompt("D-Up", "D-pad up"),
    13: makePrompt("D-Down", "D-pad down"),
    14: makePrompt("D-Left", "D-pad left"),
    15: makePrompt("D-Right", "D-pad right")
  }),
  ps: Object.freeze({
    0: makePrompt("✖", "Cross", "/assets/controller-icons/ps/cross.svg"),
    1: makePrompt("○", "Circle", "/assets/controller-icons/ps/circle.svg"),
    2: makePrompt("□", "Square", "/assets/controller-icons/ps/square.svg"),
    3: makePrompt("△", "Triangle", "/assets/controller-icons/ps/triangle.svg"),
    4: makePrompt("L1", "L1", "/assets/controller-icons/ps/l1.svg"),
    5: makePrompt("R1", "R1", "/assets/controller-icons/ps/r1.svg"),
    6: makePrompt("L2", "L2", "/assets/controller-icons/ps/l2.svg"),
    7: makePrompt("R2", "R2", "/assets/controller-icons/ps/r2.svg"),
    8: makePrompt("Touchpad", "Touchpad"),
    9: makePrompt("Options", "Options"),
    10: makePrompt("L3", "L3"),
    11: makePrompt("R3", "R3"),
    12: makePrompt("D-Up", "D-pad up"),
    13: makePrompt("D-Down", "D-pad down"),
    14: makePrompt("D-Left", "D-pad left"),
    15: makePrompt("D-Right", "D-pad right")
  })
});

export class PromptManager {
  constructor({ layouts = controllerPromptLayouts, defaultLayout = "ps", initialLayout = defaultLayout } = {}) {
    this.layouts = layouts;
    this.defaultLayout = this.layouts[defaultLayout] ? defaultLayout : "ps";
    this.layout = this.layouts[initialLayout] ? initialLayout : this.defaultLayout;
  }

  setLayout(layout) {
    this.layout = this.layouts[layout] ? layout : this.defaultLayout;
    return this.layout;
  }

  detectLayout(gamepadOrId) {
    const id = typeof gamepadOrId === "string" ? gamepadOrId : gamepadOrId?.id || "";
    const normalized = id.toLowerCase();
    if (normalized.includes("playstation") || normalized.includes("dualshock") || normalized.includes("dualsense")) {
      return "ps";
    }
    return this.defaultLayout;
  }

  setLayoutForGamepad(gamepadOrId) {
    return this.setLayout(this.detectLayout(gamepadOrId));
  }

  getPrompt(buttonIndex, layout = this.layout) {
    const index = Number(buttonIndex);
    const activeLayout = this.layouts[layout] ? layout : this.defaultLayout;
    const prompt = this.layouts[activeLayout]?.[index] || this.layouts[this.defaultLayout]?.[index];
    if (prompt) return { buttonIndex: index, layout: activeLayout, ...prompt };
    return {
      buttonIndex: index,
      layout: activeLayout,
      label: `B${index}`,
      name: `Button ${index}`,
      iconPath: null
    };
  }

  getPromptAsset(buttonIndex, layout = this.layout) {
    const { label, iconPath } = this.getPrompt(buttonIndex, layout);
    return { label, iconPath };
  }

  getAvailableLayouts() {
    return Object.keys(this.layouts);
  }
}

export class ControllerPromptManager extends PromptManager {}
