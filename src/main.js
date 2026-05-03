import * as THREE from "three";
import { ControllerManager } from "./controllerManager.js";
import { PromptManager } from "./controllerPromptManager.js";
import "./styles.css";

const app = document.querySelector("#app");
const playerRoles = ["p1", "p2", "p3"];
const playerSkins = [
  { id: "blue", label: "Juan", textureIndex: 0, tint: 0xffffff, color: "#89b7ff" },
  { id: "black", label: "Benito", textureIndex: 1, tint: 0xffffff, color: "#4e5356" },
  { id: "three", label: "Juliana", textureIndex: 2, tint: 0xffffff, color: "#8f9693" }
];
const legacySkinAliases = { gold: "three" };
const playerSpriteSources = [
  {
    src: "/assets/player-duo-sheet.png",
    fallback: "rgba(40, 67, 108, 0.75)",
    section: { x: 22, width: 642 }
  },
  {
    src: "/assets/player-duo-sheet.png",
    fallback: "rgba(42, 43, 42, 0.75)",
    section: { x: 708, width: 630 }
  },
  {
    src: "/assets/player-three-sheet.png",
    fallback: "rgba(72, 76, 75, 0.75)",
    section: { x: 708, width: 630 }
  }
];
const skinButtonMarkup = playerSkins.map((skin) => `
  <button class="skin-option" type="button" data-skin="${skin.id}">
    <span class="skin-swatch" style="--skin-color: ${skin.color}"></span>
    <span>${skin.label}</span>
  </button>
`).join("");
const onlineSessionKey = "jaydens-warzone-online-session-v1";
const controllerSlotKey = "jaydens-warzone-controller-slot-v1";
const instanceBootKey = "jaydens-warzone-instance-booted-v1";
const autoControllerSlot = "auto";
const controllerClaimDurationMs = 6500;
const onlineSessionMaxAgeMs = 1000 * 60 * 60 * 6;
const onlineRequestTimeoutMs = 6500;
const rewardSongVideoId = "a-fHLBXO8pY";
const rewardSongDuration = 35;
const introVideoSrc = "/assets/jaydens-warzone-intro.mp4";
const introMaxDuration = 150;
const dragonSpriteSheetSrc = "/assets/enemy-dragon-detail-sheet.png";
const fireballSpriteSheetSrc = "/assets/fireball-sheet.png";
const finalBossSpriteSheetSrc = "/assets/final-boss-sheet.png";
const finalBossCutsceneSrc = "/assets/final-boss-cutscene.png";
const fireballGravity = 3.8;
const fireballBaseSpeed = 21;
const fireballRadius = 0.55;
const fireballLifetime = 4.2;
const finalBossHeight = 11.65;
const finalBossWidth = 6.35;
const finalBossIntroDuration = 4.8;
const finalBossCrashDuration = 3.3;
const rewardBoxPositions = [
  [0, 1.0, 68],
  [-8, 1.0, 38],
  [10, 1.0, 32],
  [-18, 1.0, 18],
  [18, 1.0, 12],
  [34, 1.0, 30],
  [48, 1.0, 12],
  [52, 1.0, -6],
  [32, 1.0, -22],
  [10, 1.0, -50],
  [-8, 1.0, -38],
  [-24, 1.0, -10],
  [-40, 1.0, 10],
  [-56, 1.0, -8],
  [-64, 1.0, -34],
  [-46, 1.0, -62],
  [-16, 1.0, -62],
  [22, 1.0, -64],
  [62, 1.0, -58],
  [70, 1.0, -24]
];

function storageGet(key) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Storage can be blocked in private browser contexts.
  }
}

function storageRemove(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Storage can be blocked in private browser contexts.
  }
}

function sessionGet(key) {
  try {
    return window.sessionStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function sessionSet(key, value) {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch {
    // Session storage can be blocked in private browser contexts.
  }
}

function sessionRemove(key) {
  try {
    window.sessionStorage?.removeItem(key);
  } catch {
    // Session storage can be blocked in private browser contexts.
  }
}

function saveControllerSettings() {
  controllerSettings = sanitizeControllerSettings(controllerSettings);
  storageSet(controllerSettingsKey, JSON.stringify(controllerSettings));
}

function resetControllerSettings() {
  controllerSettings = { ...defaultControllerSettings };
  saveControllerSettings();
  addMessage(`Controller reset. ${controllerFlowSummary}`);
}

function loadOnlineSession() {
  const raw = sessionGet(onlineSessionKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session?.clientId || !session?.roomCode || !session?.role) return null;
    if (Date.now() - Number(session.updatedAt || 0) > onlineSessionMaxAgeMs) return null;
    return session;
  } catch {
    return null;
  }
}

function prepareInstanceSession() {
  const navigationType = performance.getEntriesByType?.("navigation")?.[0]?.type || "navigate";
  const copiedFromAnotherWindow = Boolean(sessionGet(instanceBootKey)) && navigationType === "navigate";
  if (copiedFromAnotherWindow) {
    sessionRemove(controllerSlotKey);
    sessionRemove(onlineSessionKey);
  }
  sessionSet(instanceBootKey, String(Date.now()));
}

function makeClientId() {
  return crypto.randomUUID?.() || `client-${Math.random().toString(36).slice(2)}`;
}

prepareInstanceSession();
const storedOnlineSession = loadOnlineSession();

app.innerHTML = `
  <div class="game-shell">
    <div class="hud">
      <div class="damage-vignette" data-ui="damage"></div>
      <div class="top-bar">
        <div class="objective-strip">
          <span class="eyebrow">Objective</span>
          <span class="objective-text" data-ui="objective">Stand by</span>
        </div>
        <div class="status-strip">
          <span class="eyebrow">Hostiles</span>
          <span data-ui="hostiles">100</span>
        </div>
      </div>
      <div class="compass">
        <div class="compass-labels">
          <span>W</span><span>NW</span><span>N</span><span>NE</span><span>E</span>
        </div>
      </div>
      <div class="message-feed" data-ui="feed"></div>
      <div class="music-unlock" data-ui="musicUnlock">
        <div class="music-unlock-header">
          <span class="eyebrow">Song Box</span>
          <strong data-ui="musicCountdown">35s</strong>
        </div>
        <div class="music-frame" data-ui="musicFrame"></div>
        <button class="music-close" type="button" data-ui="musicClose">Stop</button>
      </div>
      <div class="crosshair" data-ui="crosshair"></div>
      <div class="split-crosshair split-crosshair-p1"></div>
      <div class="split-crosshair split-crosshair-p2"></div>
      <div class="split-crosshair split-crosshair-p3"></div>
      <div class="split-divider"></div>
      <div class="split-info">
        <span class="eyebrow">3P Local Split</span>
        <strong>Same Device Squad</strong>
        <p>P1 uses the selected controller. P2 and P3 use the next connected controllers.</p>
      </div>
      <div class="hit-marker" data-ui="hit"></div>
      <div class="session-label session-label-player" data-ui="p1Controller">P1 PS5</div>
      <div class="session-label session-label-room" data-ui="p2Controller">P2 controller</div>
      <div class="session-label session-label-third" data-ui="p3Controller">P3 controller</div>
      <div class="bottom-left">
        <div class="panel">
          <div class="meters">
            <div class="meter-row">
              <span>Health</span>
              <div class="meter"><div class="meter-fill" data-ui="health"></div></div>
              <span data-ui="healthText">100</span>
            </div>
            <div class="meter-row">
              <span>Armor</span>
              <div class="meter"><div class="meter-fill armor" data-ui="armor"></div></div>
              <span data-ui="armorText">50</span>
            </div>
            <div class="meter-row">
              <span>Stamina</span>
              <div class="meter"><div class="meter-fill stamina" data-ui="stamina"></div></div>
              <span data-ui="staminaText">100</span>
            </div>
          </div>
          <div class="state-grid">
            <span class="chip" data-chip="ads">ADS</span>
            <span class="chip" data-chip="sprint">Sprint</span>
            <span class="chip" data-chip="slide">Slide</span>
            <span class="chip" data-chip="stance">Stand</span>
          </div>
        </div>
      </div>
      <div class="bottom-right">
        <div class="panel">
          <div class="ammo">
            <span class="ammo-current" data-ui="ammo">30</span>
            <span class="ammo-reserve">/ <span data-ui="reserve">180</span></span>
          </div>
          <div class="weapon-name">
            <span data-ui="weaponName">M4A1-style Rifle</span> - <span data-ui="fireMode">AUTO</span>
          </div>
        </div>
      </div>
      <div class="touch-controls" data-ui="touchControls" aria-label="On-screen controller">
        <div class="touch-stick touch-stick-move" data-touch-stick="move" aria-label="Move">
          <div class="touch-stick-knob" data-touch-knob="move"></div>
        </div>
        <div class="touch-stick touch-stick-look" data-touch-stick="look" aria-label="Look">
          <div class="touch-stick-knob" data-touch-knob="look"></div>
        </div>
        <div class="touch-triggers">
          <button class="touch-btn touch-btn-trigger" type="button" data-touch-button="ads" data-prompt-button="6" data-prompt-action="Aim down sights" aria-label="Aim down sights">LT</button>
          <button class="touch-btn touch-btn-trigger touch-btn-fire" type="button" data-touch-button="fire" data-prompt-button="7" data-prompt-action="Fire" aria-label="Fire">RT</button>
        </div>
        <div class="touch-actions">
          <button class="touch-btn touch-btn-stick" type="button" data-touch-button="sprint" data-prompt-button="10" data-prompt-action="Sprint" aria-label="Sprint">LS</button>
          <button class="touch-btn" type="button" data-touch-button="jump" data-prompt-button="0" data-prompt-action="Jump" aria-label="Jump">A</button>
          <button class="touch-btn" type="button" data-touch-button="crouch" data-prompt-button="1" data-prompt-action="Crouch or prone" aria-label="Crouch or prone">B</button>
          <button class="touch-btn" type="button" data-touch-button="reload" data-prompt-button="2" data-prompt-action="Reload or interact" aria-label="Reload or interact">X</button>
          <button class="touch-btn touch-btn-stick" type="button" data-touch-button="melee" data-prompt-button="11" data-prompt-action="Melee" aria-label="Melee">RS</button>
          <button class="touch-btn touch-btn-dpad" type="button" data-touch-button="armor" data-prompt-button="13" data-prompt-action="Use armor" aria-label="Use armor">D-Down</button>
        </div>
      </div>
      <div class="prompt" data-ui="prompt">
        <div class="prompt-header">
          <span class="eyebrow">Ready Room</span>
          <h1>Jayden's Warzone</h1>
          <p>Pick a mode, claim a controller, and deploy.</p>
        </div>
        <div class="prompt-actions prompt-actions-main">
          <button class="primary-btn" data-ui="start">Deploy Solo</button>
          <button class="secondary-btn" data-ui="startSplit" type="button">3P Split</button>
          <button class="secondary-btn" data-ui="calibrationOpen" type="button">Calibrate</button>
        </div>
        <div class="menu-grid">
          <div class="room-panel">
            <div>
              <span class="eyebrow">Online Co-op</span>
              <div class="room-status" data-ui="roomStatus">Create or join a room.</div>
            </div>
            <div class="room-actions">
              <button class="secondary-btn" data-ui="createRoom">Create Room</button>
              <div class="room-join">
                <input data-ui="roomCode" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" />
                <button class="secondary-btn" data-ui="joinRoom">Join</button>
              </div>
            </div>
            <div class="lobby-panel" data-ui="lobbyPanel">
              <div class="lobby-header">
                <span class="eyebrow">Room</span>
                <span class="lobby-code" data-ui="lobbyCode">-----</span>
              </div>
              <div class="lobby-slots">
                <div class="lobby-slot" data-ui="lobbyP1">
                  <span>P1</span>
                  <strong>Open</strong>
                </div>
                <div class="lobby-slot" data-ui="lobbyP2">
                  <span>P2</span>
                  <strong>Open</strong>
                </div>
                <div class="lobby-slot" data-ui="lobbyP3">
                  <span>P3</span>
                  <strong>Open</strong>
                </div>
              </div>
              <div class="skin-select" data-ui="skinSelect">
                <span class="eyebrow">Skin</span>
                <div class="skin-options">
                  ${skinButtonMarkup}
                </div>
              </div>
              <div class="lobby-actions">
                <button class="primary-btn" data-ui="readyUp" type="button">Ready Up</button>
                <button class="secondary-btn" data-ui="leaveRoom" type="button">Leave Room</button>
                <span class="lobby-hint" data-ui="lobbyHint">Create or join a room to ready up.</span>
              </div>
            </div>
          </div>
          <div class="controller-select" data-ui="controllerSelect">
            <div>
              <span class="eyebrow">Controller</span>
              <strong data-ui="controllerChoice">Auto Select</strong>
              <p data-ui="controllerHint">Choose a controller for this window.</p>
              <div class="prompt-preview" data-ui="promptPreview" aria-label="Controller prompt preview">
                <span data-prompt-button="0" data-prompt-action="Jump">A</span>
                <span data-prompt-button="1" data-prompt-action="Crouch">B</span>
                <span data-prompt-button="2" data-prompt-action="Reload">X</span>
                <span data-prompt-button="3" data-prompt-action="Switch weapon">Y</span>
                <span data-prompt-button="6" data-prompt-action="Aim down sights">LT</span>
                <span data-prompt-button="7" data-prompt-action="Fire">RT</span>
              </div>
            </div>
            <div class="controller-actions">
              <button class="secondary-btn micro-btn" data-ui="controllerPrev" type="button">Prev</button>
              <button class="secondary-btn micro-btn" data-ui="controllerDetect" type="button">Detect</button>
              <button class="secondary-btn micro-btn" data-ui="controllerNext" type="button">Next</button>
            </div>
          </div>
        </div>
        <div class="prompt-actions prompt-actions-utility">
          <button class="secondary-btn" data-ui="touchToggle" type="button">Touch Controls: Auto</button>
          <button class="secondary-btn" data-ui="reset">Reset Run</button>
        </div>
      </div>
      <div class="intro-cinematic" data-ui="introCinematic" hidden>
        <video
          class="intro-video"
          data-ui="introVideo"
          src="${introVideoSrc}"
          preload="metadata"
          playsinline
        ></video>
        <div class="intro-letterbox"></div>
        <div class="intro-title">
          <span>Jayden's Warzone</span>
        </div>
        <button class="intro-skip" data-ui="introSkip" type="button">Skip</button>
      </div>
      <div class="boss-cutscene" data-ui="bossCutscene" hidden>
        <img class="boss-cutscene-art" src="${finalBossCutsceneSrc}" alt="" />
        <div class="boss-cutscene-panel">
          <span class="eyebrow">Final Boss</span>
          <strong>Korsak Inbound</strong>
          <p>Commander-class contact. Plane impact imminent.</p>
        </div>
      </div>
      <div class="calibration-panel" data-ui="calibration">
        <div class="calibration-card">
          <div class="calibration-header">
            <div>
              <span class="eyebrow">Controller</span>
              <h2>Calibration</h2>
            </div>
            <button class="secondary-btn" data-ui="calibrationClose" type="button">Close</button>
          </div>
          <div class="calibration-device">
            <span data-ui="calibrationId">No controller detected</span>
            <strong data-ui="calibrationMapping">mapping: none</strong>
          </div>
          <div class="calibration-live">
            <div class="axis-readout"><span>LX</span><strong data-axis-readout="leftX">0.00</strong><i data-axis-bar="leftX"></i></div>
            <div class="axis-readout"><span>LY</span><strong data-axis-readout="leftY">0.00</strong><i data-axis-bar="leftY"></i></div>
            <div class="axis-readout"><span>RX</span><strong data-axis-readout="rightX">0.00</strong><i data-axis-bar="rightX"></i></div>
            <div class="axis-readout"><span>RY</span><strong data-axis-readout="rightY">0.00</strong><i data-axis-bar="rightY"></i></div>
          </div>
          <div class="button-readout" data-ui="calibrationButtons">Press controller buttons to verify mapping.</div>
          <div class="calibration-grid">
            <div class="calibration-row">
              <span>Deadzone</span>
              <button class="secondary-btn micro-btn" data-calibration-action="deadzoneDown" type="button">-</button>
              <strong data-ui="calibrationDeadzone">0.14</strong>
              <button class="secondary-btn micro-btn" data-calibration-action="deadzoneUp" type="button">+</button>
            </div>
            <div class="calibration-row">
              <span>Look Sens</span>
              <button class="secondary-btn micro-btn" data-calibration-action="sensDown" type="button">-</button>
              <strong data-ui="calibrationSens">1.0</strong>
              <button class="secondary-btn micro-btn" data-calibration-action="sensUp" type="button">+</button>
            </div>
            <button class="secondary-btn" data-calibration-action="invertLookY" type="button" data-ui="calibrationInvertLookY">Look Y Normal</button>
            <button class="secondary-btn" data-calibration-action="invertLookX" type="button" data-ui="calibrationInvertLookX">Look X Normal</button>
            <button class="secondary-btn" data-calibration-action="invertMoveY" type="button" data-ui="calibrationInvertMoveY">Move Y Normal</button>
            <button class="secondary-btn" data-calibration-action="invertMoveX" type="button" data-ui="calibrationInvertMoveX">Move X Normal</button>
            <button class="secondary-btn" data-calibration-action="shoulderLean" type="button" data-ui="calibrationShoulderLean">L1/R1 Tactical</button>
            <button class="primary-btn" data-calibration-action="reset" type="button">Reset COD Defaults</button>
          </div>
        </div>
      </div>
      <div class="end-screen" data-ui="end">
        <div class="end-card">
          <h2 data-ui="endTitle">Mission Complete</h2>
          <p data-ui="endBody">Run finished.</p>
          <button class="primary-btn" data-ui="restart">Deploy Again</button>
        </div>
      </div>
    </div>
  </div>
`;

const shell = document.querySelector(".game-shell");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
shell.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ea0a0);
scene.fog = new THREE.FogExp2(0xb7aa8c, 0.0085);

let camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.06, 420);
camera.rotation.order = "YXZ";
scene.add(camera);
const cameraOne = camera;
const cameraTwo = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.06, 420);
cameraTwo.rotation.order = "YXZ";
scene.add(cameraTwo);
const cameraThree = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.06, 420);
cameraThree.rotation.order = "YXZ";
scene.add(cameraThree);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 160;

const ui = {
  prompt: document.querySelector('[data-ui="prompt"]'),
  start: document.querySelector('[data-ui="start"]'),
  startSplit: document.querySelector('[data-ui="startSplit"]'),
  introCinematic: document.querySelector('[data-ui="introCinematic"]'),
  introVideo: document.querySelector('[data-ui="introVideo"]'),
  introSkip: document.querySelector('[data-ui="introSkip"]'),
  bossCutscene: document.querySelector('[data-ui="bossCutscene"]'),
  reset: document.querySelector('[data-ui="reset"]'),
  restart: document.querySelector('[data-ui="restart"]'),
  calibrationOpen: document.querySelector('[data-ui="calibrationOpen"]'),
  calibration: document.querySelector('[data-ui="calibration"]'),
  calibrationClose: document.querySelector('[data-ui="calibrationClose"]'),
  calibrationId: document.querySelector('[data-ui="calibrationId"]'),
  calibrationMapping: document.querySelector('[data-ui="calibrationMapping"]'),
  calibrationButtons: document.querySelector('[data-ui="calibrationButtons"]'),
  calibrationDeadzone: document.querySelector('[data-ui="calibrationDeadzone"]'),
  calibrationSens: document.querySelector('[data-ui="calibrationSens"]'),
  calibrationInvertLookY: document.querySelector('[data-ui="calibrationInvertLookY"]'),
  calibrationInvertLookX: document.querySelector('[data-ui="calibrationInvertLookX"]'),
  calibrationInvertMoveY: document.querySelector('[data-ui="calibrationInvertMoveY"]'),
  calibrationInvertMoveX: document.querySelector('[data-ui="calibrationInvertMoveX"]'),
  calibrationShoulderLean: document.querySelector('[data-ui="calibrationShoulderLean"]'),
  touchToggle: document.querySelector('[data-ui="touchToggle"]'),
  touchControls: document.querySelector('[data-ui="touchControls"]'),
  controllerSelect: document.querySelector('[data-ui="controllerSelect"]'),
  controllerChoice: document.querySelector('[data-ui="controllerChoice"]'),
  controllerHint: document.querySelector('[data-ui="controllerHint"]'),
  promptPreview: document.querySelector('[data-ui="promptPreview"]'),
  controllerPrev: document.querySelector('[data-ui="controllerPrev"]'),
  controllerDetect: document.querySelector('[data-ui="controllerDetect"]'),
  controllerNext: document.querySelector('[data-ui="controllerNext"]'),
  createRoom: document.querySelector('[data-ui="createRoom"]'),
  joinRoom: document.querySelector('[data-ui="joinRoom"]'),
  roomCode: document.querySelector('[data-ui="roomCode"]'),
  roomStatus: document.querySelector('[data-ui="roomStatus"]'),
  lobbyPanel: document.querySelector('[data-ui="lobbyPanel"]'),
  lobbyCode: document.querySelector('[data-ui="lobbyCode"]'),
  lobbyP1: document.querySelector('[data-ui="lobbyP1"]'),
  lobbyP2: document.querySelector('[data-ui="lobbyP2"]'),
  lobbyP3: document.querySelector('[data-ui="lobbyP3"]'),
  lobbyHint: document.querySelector('[data-ui="lobbyHint"]'),
  readyUp: document.querySelector('[data-ui="readyUp"]'),
  leaveRoom: document.querySelector('[data-ui="leaveRoom"]'),
  skinSelect: document.querySelector('[data-ui="skinSelect"]'),
  skinButtons: Array.from(document.querySelectorAll("[data-skin]")),
  end: document.querySelector('[data-ui="end"]'),
  endTitle: document.querySelector('[data-ui="endTitle"]'),
  endBody: document.querySelector('[data-ui="endBody"]'),
  objective: document.querySelector('[data-ui="objective"]'),
  hostiles: document.querySelector('[data-ui="hostiles"]'),
  feed: document.querySelector('[data-ui="feed"]'),
  musicUnlock: document.querySelector('[data-ui="musicUnlock"]'),
  musicFrame: document.querySelector('[data-ui="musicFrame"]'),
  musicCountdown: document.querySelector('[data-ui="musicCountdown"]'),
  musicClose: document.querySelector('[data-ui="musicClose"]'),
  crosshair: document.querySelector('[data-ui="crosshair"]'),
  hit: document.querySelector('[data-ui="hit"]'),
  damage: document.querySelector('[data-ui="damage"]'),
  health: document.querySelector('[data-ui="health"]'),
  armor: document.querySelector('[data-ui="armor"]'),
  stamina: document.querySelector('[data-ui="stamina"]'),
  healthText: document.querySelector('[data-ui="healthText"]'),
  armorText: document.querySelector('[data-ui="armorText"]'),
  staminaText: document.querySelector('[data-ui="staminaText"]'),
  ammo: document.querySelector('[data-ui="ammo"]'),
  reserve: document.querySelector('[data-ui="reserve"]'),
  weaponName: document.querySelector('[data-ui="weaponName"]'),
  fireMode: document.querySelector('[data-ui="fireMode"]'),
  p1Controller: document.querySelector('[data-ui="p1Controller"]'),
  p2Controller: document.querySelector('[data-ui="p2Controller"]'),
  p3Controller: document.querySelector('[data-ui="p3Controller"]'),
  chips: {
    ads: document.querySelector('[data-chip="ads"]'),
    sprint: document.querySelector('[data-chip="sprint"]'),
    slide: document.querySelector('[data-chip="slide"]'),
    stance: document.querySelector('[data-chip="stance"]')
  }
};

const shared = {};
const solidMeshes = [];
const enemyHitMeshes = [];
const colliders = [];
const coverPoints = [];
const enemies = [];
const spawnQueue = [];
const particles = [];
const tracers = [];
const fireballs = [];
const powerUps = [];
const rewardBoxes = [];

const keys = new Map();
const mouse = {
  fire: false,
  ads: false,
  lastMoveX: 0,
  lastMoveY: 0
};

function createGamepadState() {
  return {
    connected: false,
    index: -1,
    id: "",
    mapping: "",
    source: null,
    buttons: [],
    prevButtons: [],
    axes: [0, 0, 0, 0],
    lastSprintTap: -10,
    secondaryHoldAt: null,
    secondaryLongHandled: false
  };
}

const emptyGamepad = createGamepadState();
const gamepadOne = createGamepadState();
const gamepadTwo = createGamepadState();
const gamepadThree = createGamepadState();
const touchPad = createGamepadState();
const controlPadOne = createGamepadState();
const controlPadTwo = createGamepadState();
const controlPadThree = createGamepadState();
let activeGamepad = emptyGamepad;

const padAxis = Object.freeze({
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3
});

const controllerSettingsKey = "jaydens-warzone-controller-settings-v1";
const controllerManager = new ControllerManager();
const promptManager = new PromptManager({ defaultLayout: "ps", initialLayout: "ps" });
const controllerFlowSummary = "Gameplay uses PS5 semantics on standard Gamepad API indices; prompts always show PlayStation labels.";
const defaultControllerSettings = Object.freeze({
  deadzone: 0.14,
  lookSensitivity: 1,
  invertMoveX: false,
  invertMoveY: false,
  invertLookX: false,
  invertLookY: false,
  shoulderLean: false
});

const buttonActions = Object.freeze({
  0: "Jump",
  1: "Crouch",
  2: "Reload",
  3: "Switch weapon",
  4: "Tactical",
  5: "Lethal",
  6: "ADS",
  7: "Fire",
  8: "Tac Map",
  9: "Pause",
  10: "Sprint",
  11: "Melee",
  12: "Ping",
  13: "Night vision / armor",
  14: "Fire mode",
  15: "Streak"
});

function readControllerSettings() {
  try {
    return sanitizeControllerSettings(JSON.parse(storageGet(controllerSettingsKey) || "{}"));
  } catch {
    return { ...defaultControllerSettings };
  }
}

function sanitizeControllerSlot(value) {
  const normalized = String(value ?? autoControllerSlot).trim().toLowerCase();
  if (!normalized || normalized === autoControllerSlot) return autoControllerSlot;
  const index = Number(normalized);
  return Number.isInteger(index) && index >= 0 && index < 16 ? String(index) : autoControllerSlot;
}

function readControllerSlot() {
  return sanitizeControllerSlot(sessionGet(controllerSlotKey) || autoControllerSlot);
}

function saveControllerSlot() {
  sessionSet(controllerSlotKey, controllerSlot);
}

function sanitizeControllerSettings(settings = {}) {
  return {
    deadzone: clamp(Number(settings.deadzone ?? defaultControllerSettings.deadzone), 0.04, 0.34),
    lookSensitivity: clamp(Number(settings.lookSensitivity ?? defaultControllerSettings.lookSensitivity), 0.55, 1.9),
    invertMoveX: Boolean(settings.invertMoveX),
    invertMoveY: Boolean(settings.invertMoveY),
    invertLookX: Boolean(settings.invertLookX),
    invertLookY: Boolean(settings.invertLookY),
    shoulderLean: Boolean(settings.shoulderLean)
  };
}

let controllerSettings = readControllerSettings();
let controllerSlot = readControllerSlot();
let controllerClaimUntil = 0;
let controllerUiSignature = "";

const touchControls = {
  preferred: navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches,
  enabled: navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches,
  movePointer: null,
  lookPointer: null,
  moveCenter: { x: 0, y: 0 },
  lookLast: { x: 0, y: 0 },
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  buttons: new Map()
};

const audio = {
  context: null,
  unlocked: false
};

const tempVec3 = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();
const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
const worldUp = new THREE.Vector3(0, 1, 0);

function createPlayerState(feet, yaw = Math.PI) {
  return {
  feet,
  velocity: new THREE.Vector3(),
  yaw,
  pitch: 0,
  recoil: 0,
  recoilSide: 0,
  lean: 0,
  targetLean: 0,
  height: 1.82,
  targetHeight: 1.82,
  verticalVelocity: 0,
  grounded: true,
  stance: "stand",
  health: 100,
  armor: 50,
  stamina: 100,
  skinId: "blue",
  kills: 0,
  downed: false,
  infiniteAmmo: true,
  weaponSlot: "rifle",
  ammo: 30,
  reserve: 180,
  magSize: 30,
  fireMode: "AUTO",
  fireTimer: 0,
  reloadTimer: 0,
  reloading: false,
  meleeTimer: 0,
  meleeDuration: 0.42,
  meleeCooldown: 0,
  ads: false,
  sprinting: false,
  tacticalUntil: 0,
  slideTimer: 0,
  slideVelocity: new THREE.Vector3(),
  interactTimer: 0,
  reviveProgress: 0,
  reviveBeacon: null,
  activeObjective: null,
  flashlight: false,
  nightVision: false,
  tacticalCooldown: 0,
  lethalCooldown: 0,
  streakCooldown: 0,
  jammerUntil: 0,
  overdriveUntil: 0,
  lastDamageAt: -10,
  lastShotAt: -10,
  lastShiftTap: -10
  };
}

let player = createPlayerState(new THREE.Vector3(0, 0, 52), Math.PI);
const playerOne = player;
playerOne.label = "P1";
playerOne.role = "p1";
playerOne.skinId = "blue";
const playerTwo = createPlayerState(new THREE.Vector3(2.2, 0, 52), Math.PI);
playerTwo.label = "P2";
playerTwo.role = "p2";
playerTwo.skinId = "black";
const playerThree = createPlayerState(new THREE.Vector3(-2.2, 0, 52), Math.PI);
playerThree.label = "P3";
playerThree.role = "p3";
playerThree.skinId = "three";
const players = [playerOne, playerTwo, playerThree];
const playersByRole = { p1: playerOne, p2: playerTwo, p3: playerThree };
const camerasByRole = { p1: cameraOne, p2: cameraTwo, p3: cameraThree };
const victoryRedirectUrl = "https://www.youtube.com/watch?v=sytDM5A43AM&list=RDsytDM5A43AM&start_radio=1";

const game = {
  running: false,
  ended: false,
  time: 0,
  spawnSeed: 11,
  lastHud: 0,
  totalHostiles: 100,
  hostilesAlive: 100,
  rewardBoxesDestroyed: 0,
  rewardMusicUntil: 0,
  rewardMusicTimer: null,
  deployedHostiles: 0,
  lastWaveAt: -20,
  waveNumber: 0,
  calibrationOpen: false,
  objectiveMessage: "Disable systems, recover intel, extract, and hunt song boxes.",
  revivePrompt: "",
  victoryRedirectScheduled: false,
  bossPhase: "idle",
  bossIntroUntil: 0,
  bossCrashStartedAt: 0,
  bossSpawned: false,
  bossDefeated: false,
  bossPlane: null,
  messages: []
};
const introState = {
  consumed: false,
  playing: false,
  pendingOptions: null,
  timeout: null,
  abort: null
};

const online = {
  enabled: false,
  role: null,
  roomCode: "",
  skin: skinForId(storedOnlineSession?.skin || "blue").id,
  clientId: storedOnlineSession?.clientId || makeClientId(),
  pending: false,
  syncPending: false,
  lastSyncAt: 0,
  syncEvery: 0.38,
  hiddenSyncEvery: 1.45,
  remoteLastSeen: 0,
  remoteReady: false,
  localReady: false,
  announcedStart: false,
  requestFailures: 0,
  lastConnectedAt: 0,
  recovering: false,
  restoreAttempted: false,
  error: "",
  lastRoom: null
};

const localSplit = {
  enabled: false,
  players: 1
};

const objectives = [
  {
    id: "radio",
    label: "Disable radio tower",
    complete: false,
    progress: 0,
    holdTime: 2.4,
    radius: 7,
    position: new THREE.Vector3(48, 0, -54)
  },
  {
    id: "cache",
    label: "Destroy ammo cache",
    complete: false,
    progress: 0,
    holdTime: 2.8,
    radius: 7,
    position: new THREE.Vector3(-54, 0, -46)
  },
  {
    id: "intel",
    label: "Recover intel laptop",
    complete: false,
    progress: 0,
    holdTime: 2.1,
    radius: 5.5,
    position: new THREE.Vector3(36, 0, 42)
  },
  {
    id: "extract",
    label: "Reach extraction zone",
    complete: false,
    progress: 0,
    holdTime: 1.5,
    radius: 9,
    position: new THREE.Vector3(-8, 0, 76),
    extraction: true
  }
];

function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomRange(seed, min, max) {
  return min + seededRandom(seed) * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function skinForId(id) {
  const normalized = legacySkinAliases[String(id || "").toLowerCase()] || id;
  return playerSkins.find((skin) => skin.id === normalized) || playerSkins[0];
}

function defaultSkinForRole(role) {
  if (role === "p2") return "black";
  if (role === "p3") return "three";
  return "blue";
}

function actorForRole(role) {
  return playersByRole[role] || playerOne;
}

function cameraForRole(role) {
  return camerasByRole[role] || cameraOne;
}

function isActorActive(actor) {
  if (!online.enabled) {
    if (!localSplit.enabled) return actor === playerOne;
    return actor === playerOne || actor === playerTwo || actor === playerThree;
  }
  return actor.role === online.role || Boolean(online.lastRoom?.players?.[actor.role]);
}

function activePlayers() {
  return players.filter(isActorActive);
}

function setActorSkin(actor, skinId) {
  const skin = skinForId(skinId);
  actor.skinId = skin.id;
  const visual = actor.worldSprite;
  if (visual) {
    visual.currentPose = -1;
    visual.currentTextureIndex = -1;
    visual.material.color.set(skin.tint);
  }
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeNoiseTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const i = (y * 256 + x) * 4;
      const n = 135 + Math.floor(seededRandom(x * 91 + y * 177) * 54);
      image.data[i] = n + 15;
      image.data[i + 1] = n + 7;
      image.data[i + 2] = n - 24;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(42, 42);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const dragonSpriteCells = [
  { x: 0, y: 34, w: 242, h: 322 },
  { x: 246, y: 36, w: 232, h: 318 },
  { x: 468, y: 34, w: 248, h: 322 },
  { x: 1050, y: 398, w: 302, h: 294 },
  { x: 1048, y: 392, w: 304, h: 302 },
  { x: 724, y: 34, w: 244, h: 326 },
  { x: 952, y: 34, w: 246, h: 326 },
  { x: 1186, y: 34, w: 214, h: 322 }
];

const dragonAttackCell = { x: 354, y: 414, w: 344, h: 284 };
const fireballCells = {
  projectile: { x: 858, y: 158, w: 190, h: 128 },
  impact: { x: 28, y: 548, w: 210, h: 118 }
};

const bossSpriteCells = {
  idle: { x: 20, y: 32, w: 286, h: 552 },
  aim: { x: 350, y: 58, w: 300, h: 236 },
  fire: { x: 670, y: 58, w: 336, h: 220 },
  crouch: { x: 382, y: 342, w: 266, h: 292 },
  run: { x: 740, y: 324, w: 270, h: 396 },
  hit: { x: 48, y: 614, w: 286, h: 342 },
  taunt: { x: 392, y: 636, w: 214, h: 312 },
  down: { x: 616, y: 738, w: 404, h: 252 }
};

function drawContainedCell(ctx, image, cell, maxWidth = 468, maxHeight = 492, yBias = 0) {
  const scale = Math.min(maxWidth / cell.w, maxHeight / cell.h);
  const width = cell.w * scale;
  const height = cell.h * scale;
  const x = (512 - width) * 0.5;
  const y = (512 - height) * 0.5 + yBias;
  ctx.drawImage(image, cell.x, cell.y, cell.w, cell.h, x, y, width, height);
}

function createBossSpriteTexture(pose = "idle") {
  const cell = bossSpriteCells[pose] || bossSpriteCells.idle;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 60, 0, 452);
  gradient.addColorStop(0, "rgba(75, 110, 150, 0.85)");
  gradient.addColorStop(0.52, "rgba(24, 46, 78, 0.78)");
  gradient.addColorStop(1, "rgba(10, 14, 18, 0.9)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(256, 270, 96, 196, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawContainedCell(ctx, image, cell, pose === "down" ? 500 : 468, pose === "down" ? 330 : 492, pose === "down" ? 72 : 0);
    removeConnectedSheetBackground(ctx, canvas.width, canvas.height);
    removeConnectedGreyBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, pose === "down" ? 22 : 8);
    texture.needsUpdate = true;
  };
  image.src = finalBossSpriteSheetSrc;
  return texture;
}

function createDragonSpriteTexture(cellIndex) {
  const cell = dragonSpriteCells[cellIndex] || dragonSpriteCells[0];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(120, 74, 48, 0.75)";
  ctx.beginPath();
  ctx.ellipse(256, 256, 86, 160, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, cell.x, cell.y, cell.w, cell.h, 22, 10, 468, 492);
    removeConnectedSheetBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, 8);
    texture.needsUpdate = true;
  };
  image.src = dragonSpriteSheetSrc;
  return texture;
}

function createDragonAttackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(98, 124, 70, 0.72)";
  ctx.beginPath();
  ctx.ellipse(256, 260, 176, 112, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, dragonAttackCell.x, dragonAttackCell.y, dragonAttackCell.w, dragonAttackCell.h, 2, 58, 508, 386);
    removeConnectedSheetBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, 4);
    texture.needsUpdate = true;
  };
  image.src = dragonSpriteSheetSrc;
  return texture;
}

function createFireballSpriteTexture(kind = "projectile") {
  const cell = fireballCells[kind] || fireballCells.projectile;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createRadialGradient(256, 256, 12, 256, 256, 210);
  gradient.addColorStop(0, "rgba(255, 246, 168, 0.94)");
  gradient.addColorStop(0.42, "rgba(255, 118, 30, 0.72)");
  gradient.addColorStop(1, "rgba(120, 24, 8, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, cell.x, cell.y, cell.w, cell.h, 26, kind === "impact" ? 94 : 124, 460, kind === "impact" ? 270 : 232);
    removeConnectedGreyBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, 8);
    texture.needsUpdate = true;
  };
  image.src = fireballSpriteSheetSrc;
  return texture;
}

function createPlayerSpriteTexture(playerIndex, poseIndex) {
  const source = playerSpriteSources[playerIndex] || playerSpriteSources[0];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = source.fallback;
  ctx.beginPath();
  ctx.ellipse(256, 260, 74, 178, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    const col = poseIndex % 4;
    const row = Math.floor(poseIndex / 4);
    const section = source.section;
    const cellWidth = section.width / 4;
    const sourceX = section.x + col * cellWidth + 2;
    const sourceY = row === 0 ? 58 : 414;
    const sourceW = cellWidth - 4;
    const sourceH = row === 0 ? 302 : 314;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 54, 22, 404, 468);
    removeConnectedGreyBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, 18);
    texture.needsUpdate = true;
  };
  image.src = source.src;
  return texture;
}

function removeConnectedSheetBackground(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const shouldErase = (index) => {
    const p = index * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];
    return a < 18 || (r < 62 && g < 66 && b < 70 && Math.abs(r - g) < 18 && Math.abs(g - b) < 22);
  };

  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !shouldErase(index)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const index = queue.pop();
    const p = index * 4;
    data[p + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
}

function removeConnectedGreyBackground(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const shouldErase = (index) => {
    const p = index * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return a < 18 || (max - min < 24 && max > 115 && max < 248);
  };

  const enqueue = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !shouldErase(index)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const index = queue.pop();
    const p = index * 4;
    data[p + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
}

function trimAlphaToCenter(ctx, width, height, padding = 14) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX > maxX || minY > maxY) return;

  const sourceW = maxX - minX + 1;
  const sourceH = maxY - minY + 1;
  const targetH = height - padding * 2;
  const targetW = Math.min(width - padding * 2, sourceW * (targetH / sourceH));
  const targetX = (width - targetW) * 0.5;
  const targetY = (height - targetH) * 0.5;
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext("2d");
  scratchCtx.putImageData(imageData, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(scratch, minX, minY, sourceW, sourceH, targetX, targetY, targetW, targetH);
}

function createSharedAssets() {
  shared.materials = {
    ground: new THREE.MeshStandardMaterial({ map: makeNoiseTexture(), roughness: 0.95 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x30332d, roughness: 0.92 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xa99e83, roughness: 0.8 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x6f6d60, roughness: 0.88 }),
    metalGreen: new THREE.MeshStandardMaterial({ color: 0x364637, roughness: 0.68, metalness: 0.18 }),
    metalTan: new THREE.MeshStandardMaterial({ color: 0x8a7956, roughness: 0.72, metalness: 0.1 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.72, metalness: 0.25 }),
    warning: new THREE.MeshStandardMaterial({ color: 0xf2c46b, roughness: 0.42, emissive: 0x3a2608 }),
    playerBlue: new THREE.MeshStandardMaterial({ color: 0x89b7ff, roughness: 0.55 }),
    enemyRifle: new THREE.MeshStandardMaterial({ color: 0x5c614e, roughness: 0.74 }),
    enemyBreacher: new THREE.MeshStandardMaterial({ color: 0x6b4c3a, roughness: 0.74 }),
    enemyMarksman: new THREE.MeshStandardMaterial({ color: 0x3c4b53, roughness: 0.74 }),
    enemySupport: new THREE.MeshStandardMaterial({ color: 0x725f35, roughness: 0.74 }),
    enemyCommander: new THREE.MeshStandardMaterial({ color: 0x7b2f2f, roughness: 0.68 }),
    bossPlane: new THREE.MeshStandardMaterial({ color: 0x1c2b36, roughness: 0.58, metalness: 0.32 }),
    bossLaser: new THREE.MeshBasicMaterial({ color: 0x5ae7ff, transparent: true, opacity: 0.9 }),
    enemyHitbox: new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false
    }),
    skin: new THREE.MeshStandardMaterial({ color: 0x8f755c, roughness: 0.76 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.64, metalness: 0.18 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x47615c,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55
    }),
    powerHealth: new THREE.MeshStandardMaterial({ color: 0x86d680, roughness: 0.3, emissive: 0x173a18 }),
    powerArmor: new THREE.MeshStandardMaterial({ color: 0x89b7ff, roughness: 0.3, emissive: 0x132743 }),
    powerStamina: new THREE.MeshStandardMaterial({ color: 0xf2c46b, roughness: 0.28, emissive: 0x4a2f06 }),
    powerJammer: new THREE.MeshStandardMaterial({ color: 0x70e6d1, roughness: 0.22, emissive: 0x073b35 }),
    powerOverdrive: new THREE.MeshStandardMaterial({ color: 0xff8a5c, roughness: 0.25, emissive: 0x4a1205 }),
    rewardBox: new THREE.MeshStandardMaterial({ color: 0xd9f25c, roughness: 0.34, emissive: 0x4a5208 }),
    rewardBoxCore: new THREE.MeshBasicMaterial({ color: 0xf2c46b }),
    smoke: new THREE.MeshBasicMaterial({
      color: 0x7b776d,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  };

  shared.geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    soldierBody: new THREE.CapsuleGeometry(0.28, 0.92, 4, 8),
    soldierHead: new THREE.SphereGeometry(0.18, 10, 8),
    rifle: new THREE.BoxGeometry(0.08, 0.08, 0.62),
    barrel: new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8),
    wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12),
    pickupCore: new THREE.OctahedronGeometry(0.52, 0),
    pickupRing: new THREE.TorusGeometry(0.85, 0.045, 8, 36),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    cone: new THREE.ConeGeometry(1, 1, 16),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    plane: new THREE.PlaneGeometry(1, 1)
  };

  shared.enemySpriteTextures = Array.from({ length: 8 }, (_, index) => createDragonSpriteTexture(index));
  shared.enemyAttackTexture = createDragonAttackTexture();
  shared.bossSpriteTextures = Object.fromEntries(
    Object.keys(bossSpriteCells).map((pose) => [pose, createBossSpriteTexture(pose)])
  );
  shared.fireballTexture = createFireballSpriteTexture("projectile");
  shared.fireballImpactTexture = createFireballSpriteTexture("impact");
  shared.playerSpriteTextures = playerSpriteSources.map((_, playerIndex) => (
    Array.from({ length: 8 }, (_, index) => createPlayerSpriteTexture(playerIndex, index))
  ));
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xe7ebd8, 0x433b2f, 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe4ad, 3.2);
  sun.position.set(-32, 52, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  const amber = new THREE.PointLight(0xffb34f, 2.5, 34, 2);
  amber.position.set(-55, 5, -45);
  scene.add(amber);
}

function addSolidBox(position, scale, material, options = {}) {
  const mesh = new THREE.Mesh(shared.geometries.box, material);
  mesh.position.copy(position);
  mesh.scale.copy(scale);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.userData.solid = options.solid ?? true;
  mesh.userData.label = options.label ?? "solid";
  scene.add(mesh);

  if (mesh.userData.solid) {
    solidMeshes.push(mesh);
    const half = scale.clone().multiplyScalar(0.5);
    const min = position.clone().sub(half);
    const max = position.clone().add(half);
    colliders.push({ min, max, height: scale.y, mesh, type: options.type ?? "obstacle" });
    if (options.cover !== false && scale.y >= 0.8) {
      addCoverAroundBox(position, scale);
    }
  }
  return mesh;
}

function addCoverAroundBox(position, scale) {
  const pad = 1.05;
  const y = 0;
  coverPoints.push(new THREE.Vector3(position.x + scale.x * 0.5 + pad, y, position.z));
  coverPoints.push(new THREE.Vector3(position.x - scale.x * 0.5 - pad, y, position.z));
  coverPoints.push(new THREE.Vector3(position.x, y, position.z + scale.z * 0.5 + pad));
  coverPoints.push(new THREE.Vector3(position.x, y, position.z - scale.z * 0.5 - pad));
}

function addCylinder(position, radius, height, material, options = {}) {
  const mesh = new THREE.Mesh(shared.geometries.cylinder, material);
  mesh.position.copy(position);
  mesh.scale.set(radius, height, radius);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  scene.add(mesh);
  if (options.solid) {
    const min = new THREE.Vector3(position.x - radius, position.y - height * 0.5, position.z - radius);
    const max = new THREE.Vector3(position.x + radius, position.y + height * 0.5, position.z + radius);
    colliders.push({ min, max, height, mesh, type: options.type ?? "cylinder" });
    solidMeshes.push(mesh);
    addCoverAroundBox(position, new THREE.Vector3(radius * 2, height, radius * 2));
  }
  return mesh;
}

function addGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 48, 48), shared.materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const road = new THREE.Mesh(new THREE.BoxGeometry(22, 0.05, 170), shared.materials.asphalt);
  road.position.set(-18, 0.015, 0);
  road.rotation.y = 0.08;
  road.receiveShadow = true;
  scene.add(road);

  for (let i = -7; i <= 7; i += 1) {
    const stripe = new THREE.Mesh(shared.geometries.box, shared.materials.warning);
    stripe.position.set(-18 + Math.sin(i) * 0.8, 0.06, i * 10.5);
    stripe.scale.set(0.32, 0.02, 3.2);
    stripe.rotation.y = 0.08;
    scene.add(stripe);
  }
}

function addMapBoundary() {
  const halfSize = 112;
  const wallThickness = 4;
  const wallHeight = 4.2;
  const wallLength = halfSize * 2 + wallThickness;
  const wallY = wallHeight * 0.5;
  const boundaryOptions = {
    label: "map boundary wall",
    cover: false,
    type: "boundary"
  };

  addSolidBox(new THREE.Vector3(0, wallY, -halfSize), new THREE.Vector3(wallLength, wallHeight, wallThickness), shared.materials.concreteDark, boundaryOptions);
  addSolidBox(new THREE.Vector3(0, wallY, halfSize), new THREE.Vector3(wallLength, wallHeight, wallThickness), shared.materials.concreteDark, boundaryOptions);
  addSolidBox(new THREE.Vector3(-halfSize, wallY, 0), new THREE.Vector3(wallThickness, wallHeight, wallLength), shared.materials.concreteDark, boundaryOptions);
  addSolidBox(new THREE.Vector3(halfSize, wallY, 0), new THREE.Vector3(wallThickness, wallHeight, wallLength), shared.materials.concreteDark, boundaryOptions);

  for (let i = -5; i <= 5; i += 1) {
    const offset = i * 18;
    addSolidBox(new THREE.Vector3(offset, 1.15, -halfSize + 2.24), new THREE.Vector3(6.4, 0.42, 0.16), shared.materials.warning, {
      label: "boundary warning stripe",
      solid: false,
      castShadow: false,
      receiveShadow: false
    });
    addSolidBox(new THREE.Vector3(offset, 1.15, halfSize - 2.24), new THREE.Vector3(6.4, 0.42, 0.16), shared.materials.warning, {
      label: "boundary warning stripe",
      solid: false,
      castShadow: false,
      receiveShadow: false
    });
    addSolidBox(new THREE.Vector3(-halfSize + 2.24, 1.15, offset), new THREE.Vector3(0.16, 0.42, 6.4), shared.materials.warning, {
      label: "boundary warning stripe",
      solid: false,
      castShadow: false,
      receiveShadow: false
    });
    addSolidBox(new THREE.Vector3(halfSize - 2.24, 1.15, offset), new THREE.Vector3(0.16, 0.42, 6.4), shared.materials.warning, {
      label: "boundary warning stripe",
      solid: false,
      castShadow: false,
      receiveShadow: false
    });
  }
}

function addBarricade(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);
  for (let i = -1; i <= 1; i += 1) {
    const local = new THREE.Vector3(i * 1.8, 0.55, 0);
    local.applyAxisAngle(worldUp, rotation);
    addSolidBox(new THREE.Vector3(x + local.x, 0.55, z + local.z), new THREE.Vector3(1.55, 1.1, 0.48), shared.materials.concrete, {
      label: "concrete barrier"
    }).rotation.y = rotation;
  }
}

function addStartingCover() {
  addSolidBox(new THREE.Vector3(0, 0.55, 47.3), new THREE.Vector3(7.4, 1.1, 0.85), shared.materials.concrete, {
    label: "starting concrete cover"
  });
  addSolidBox(new THREE.Vector3(-4.6, 0.62, 51.3), new THREE.Vector3(0.85, 1.24, 5.8), shared.materials.concreteDark, {
    label: "left starting cover"
  });
  addSolidBox(new THREE.Vector3(4.6, 0.62, 51.3), new THREE.Vector3(0.85, 1.24, 5.8), shared.materials.concreteDark, {
    label: "right starting cover"
  });
  addSolidBox(new THREE.Vector3(-3.1, 0.38, 55.2), new THREE.Vector3(2.4, 0.76, 0.75), shared.materials.metalTan, {
    label: "rear sandbag cover"
  });
  addSolidBox(new THREE.Vector3(3.1, 0.38, 55.2), new THREE.Vector3(2.4, 0.76, 0.75), shared.materials.metalTan, {
    label: "rear sandbag cover"
  });
  addSolidBox(new THREE.Vector3(0, 0.03, 56.15), new THREE.Vector3(2.25, 0.06, 1.8), shared.materials.warning, {
    label: "exit lane marker",
    solid: false,
    castShadow: false,
    receiveShadow: false
  });
}

function addContainer(position, rotation, colorMaterial) {
  const container = addSolidBox(position, new THREE.Vector3(8.8, 2.9, 2.7), colorMaterial, {
    label: "shipping container"
  });
  container.rotation.y = rotation;

  for (let i = -3; i <= 3; i += 1) {
    const rib = new THREE.Mesh(shared.geometries.box, shared.materials.metalDark);
    rib.position.set(position.x + Math.cos(rotation) * i * 1.18, position.y + 0.02, position.z - Math.sin(rotation) * i * 1.18);
    rib.scale.set(0.08, 2.95, 2.78);
    rib.rotation.y = rotation;
    rib.castShadow = true;
    scene.add(rib);
  }
  return container;
}

function addTruck(position, rotation = 0, burned = false) {
  const bodyMat = burned ? shared.materials.metalDark : shared.materials.metalGreen;
  const body = addSolidBox(position.clone().add(new THREE.Vector3(0, 1.0, 0)), new THREE.Vector3(5.4, 1.7, 2.2), bodyMat, {
    label: burned ? "burned vehicle" : "military truck"
  });
  body.rotation.y = rotation;

  const cabOffset = new THREE.Vector3(2.0, 1.85, 0).applyAxisAngle(worldUp, rotation);
  const cab = addSolidBox(position.clone().add(cabOffset), new THREE.Vector3(1.9, 1.45, 2.1), bodyMat, {
    label: "truck cab",
    cover: false
  });
  cab.rotation.y = rotation;

  for (const sx of [-1.8, 1.8]) {
    for (const sz of [-1.18, 1.18]) {
      const p = new THREE.Vector3(sx, 0.45, sz).applyAxisAngle(worldUp, rotation).add(position);
      const wheel = new THREE.Mesh(shared.geometries.wheel, shared.materials.black);
      wheel.position.copy(p);
      wheel.rotation.z = Math.PI / 2;
      wheel.rotation.y = rotation;
      wheel.castShadow = true;
      scene.add(wheel);
    }
  }

  if (burned) {
    addSmokeColumn(position.clone().add(new THREE.Vector3(0, 2.3, 0)), 7);
  }
}

function addSmokeColumn(position, count = 8) {
  for (let i = 0; i < count; i += 1) {
    const smoke = new THREE.Mesh(shared.geometries.sphere, shared.materials.smoke.clone());
    smoke.position.set(
      position.x + randomRange(i * 19, -0.8, 0.8),
      position.y + i * 0.8,
      position.z + randomRange(i * 23, -0.8, 0.8)
    );
    const s = 1.2 + i * 0.22;
    smoke.scale.set(s, s * 0.55, s);
    scene.add(smoke);
    particles.push({
      mesh: smoke,
      type: "smoke",
      age: randomRange(i * 13, 0, 3),
      life: 999,
      baseY: smoke.position.y
    });
  }
}

function addWarehouse(position, scale, rotation = 0) {
  const base = addSolidBox(position.clone().add(new THREE.Vector3(0, scale.y * 0.5, 0)), scale, shared.materials.concreteDark, {
    label: "warehouse"
  });
  base.rotation.y = rotation;

  const roof = addSolidBox(position.clone().add(new THREE.Vector3(0, scale.y + 0.28, 0)), new THREE.Vector3(scale.x + 0.4, 0.52, scale.z + 0.4), shared.materials.metalDark, {
    label: "warehouse roof",
    cover: false
  });
  roof.rotation.y = rotation;

  const doorLocal = new THREE.Vector3(0, 1.6, -scale.z * 0.51).applyAxisAngle(worldUp, rotation);
  const door = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  door.position.copy(position).add(doorLocal);
  door.scale.set(3.4, 3.2, 0.12);
  door.rotation.y = rotation;
  door.castShadow = true;
  scene.add(door);
}

function addRadioTower() {
  const base = objectives[0].position.clone();
  addSolidBox(base.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(7, 1.6, 7), shared.materials.concrete, {
    label: "radio tower base"
  });

  for (let level = 0; level < 6; level += 1) {
    const y = 2.0 + level * 3.0;
    addCylinder(base.clone().add(new THREE.Vector3(-1.7, y, -1.7)), 0.08, 2.8, shared.materials.metalDark);
    addCylinder(base.clone().add(new THREE.Vector3(1.7, y, -1.7)), 0.08, 2.8, shared.materials.metalDark);
    addCylinder(base.clone().add(new THREE.Vector3(-1.7, y, 1.7)), 0.08, 2.8, shared.materials.metalDark);
    addCylinder(base.clone().add(new THREE.Vector3(1.7, y, 1.7)), 0.08, 2.8, shared.materials.metalDark);
    const platform = new THREE.Mesh(shared.geometries.box, shared.materials.metalDark);
    platform.position.copy(base).add(new THREE.Vector3(0, y + 1.35, 0));
    platform.scale.set(4.6, 0.08, 4.6);
    platform.castShadow = true;
    scene.add(platform);
  }

  const dish = new THREE.Mesh(shared.geometries.cylinder, shared.materials.glass);
  dish.position.copy(base).add(new THREE.Vector3(0, 20.5, -2.1));
  dish.scale.set(1.4, 0.18, 1.4);
  dish.rotation.x = Math.PI / 2.8;
  scene.add(dish);
}

function addObjectiveMarker(objective) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(objective.radius, 0.05, 8, 64),
    new THREE.MeshBasicMaterial({ color: objective.extraction ? 0x89b7ff : 0xf2c46b })
  );
  ring.position.copy(objective.position).add(new THREE.Vector3(0, 0.08, 0));
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  objective.ring = ring;

  const column = new THREE.Mesh(shared.geometries.cylinder, new THREE.MeshBasicMaterial({
    color: objective.extraction ? 0x89b7ff : 0xf2c46b,
    transparent: true,
    opacity: 0.11,
    depthWrite: false
  }));
  column.position.copy(objective.position).add(new THREE.Vector3(0, 2.5, 0));
  column.scale.set(objective.radius, 2.5, objective.radius);
  scene.add(column);
  objective.column = column;
}

function powerUpConfig(type) {
  return {
    health: {
      name: "Trauma Kit",
      message: "Trauma Kit: health boosted.",
      material: shared.materials.powerHealth,
      color: 0x86d680
    },
    armor: {
      name: "Plate Bundle",
      message: "Plate Bundle: armor reinforced.",
      material: shared.materials.powerArmor,
      color: 0x89b7ff
    },
    stamina: {
      name: "Adrenaline Shot",
      message: "Adrenaline Shot: stamina and sprint surge.",
      material: shared.materials.powerStamina,
      color: 0xf2c46b
    },
    jammer: {
      name: "Signal Jammer",
      message: "Signal Jammer: enemy accuracy disrupted.",
      material: shared.materials.powerJammer,
      color: 0x70e6d1
    },
    overdrive: {
      name: "Overdrive Cell",
      message: "Overdrive Cell: faster fire and reduced recoil.",
      material: shared.materials.powerOverdrive,
      color: 0xff8a5c
    }
  }[type];
}

function addPowerUp(type, position) {
  const config = powerUpConfig(type);
  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);

  const beam = new THREE.Mesh(
    shared.geometries.cylinder,
    new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.13,
      depthWrite: false
    })
  );
  beam.position.y = 1.45;
  beam.scale.set(0.62, 2.9, 0.62);
  group.add(beam);

  const core = new THREE.Mesh(shared.geometries.pickupCore, config.material);
  core.position.y = 1.25;
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(shared.geometries.pickupRing, config.material);
  ring.position.y = 1.25;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  powerUps.push({
    type,
    config,
    group,
    core,
    ring,
    beam,
    available: true,
    respawnAt: 0,
    baseY: position.y
  });
}

function createReviveBeacon(actor) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6a5c,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd08a,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  });

  const beam = new THREE.Mesh(shared.geometries.cylinder, beamMaterial);
  beam.position.y = 1.8;
  beam.scale.set(0.72, 3.6, 0.72);
  group.add(beam);

  const ring = new THREE.Mesh(shared.geometries.pickupRing, ringMaterial);
  ring.position.y = 0.12;
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(1.35);
  group.add(ring);

  const barA = new THREE.Mesh(shared.geometries.box, ringMaterial.clone());
  barA.position.y = 3.65;
  barA.scale.set(0.92, 0.13, 0.13);
  group.add(barA);

  const barB = new THREE.Mesh(shared.geometries.box, ringMaterial.clone());
  barB.position.y = 3.65;
  barB.scale.set(0.13, 0.92, 0.13);
  group.add(barB);

  actor.reviveBeacon = { group, beam, ring, barA, barB };
}

function createPlayerWorldSprite(actor, playerIndex) {
  const skin = skinForId(actor.skinId || defaultSkinForRole(actor.role));
  const material = new THREE.MeshBasicMaterial({
    map: shared.playerSpriteTextures[skin.textureIndex][0],
    color: skin.tint,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const sprite = new THREE.Mesh(shared.geometries.plane, material);
  sprite.position.copy(actor.feet).add(new THREE.Vector3(0, 1.52, 0));
  sprite.scale.set(1.78, 3.05, 1);
  sprite.castShadow = false;
  scene.add(sprite);

  const shadow = new THREE.Mesh(
    shared.geometries.cylinder,
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    })
  );
  shadow.position.copy(actor.feet).add(new THREE.Vector3(0, 0.035, 0));
  shadow.scale.set(0.62, 0.012, 0.42);
  scene.add(shadow);

  actor.worldSprite = {
    playerIndex,
    sprite,
    shadow,
    material,
    baseWidth: 1.78,
    baseHeight: 3.05,
    currentPose: 0,
    currentTextureIndex: skin.textureIndex,
    mirror: 1
  };
}

function addPowerUps() {
  addPowerUp("health", new THREE.Vector3(0, 0, 58.8));
  addPowerUp("armor", new THREE.Vector3(-8, 0, 42));
  addPowerUp("stamina", new THREE.Vector3(12, 0, 35));
  addPowerUp("jammer", new THREE.Vector3(28, 0, 18));
  addPowerUp("overdrive", new THREE.Vector3(-12, 0, 12));
  addPowerUp("health", new THREE.Vector3(-54, 0, -38));
  addPowerUp("armor", new THREE.Vector3(48, 0, -48));
  addPowerUp("stamina", new THREE.Vector3(-8, 0, 72));
}

function addRewardBoxes() {
  rewardBoxPositions.forEach(([x, y, z], index) => {
    const box = addSolidBox(new THREE.Vector3(x, y, z), new THREE.Vector3(1.15, 1.15, 1.15), shared.materials.rewardBox, {
      label: `song box ${index + 1}`,
      cover: false,
      type: "reward-box"
    });
    box.rotation.y = randomRange(index * 73 + 4, -0.45, 0.45);

    const core = new THREE.Mesh(shared.geometries.sphere, shared.materials.rewardBoxCore);
    core.position.set(0, 0.74, 0);
    core.scale.setScalar(0.18);
    box.add(core);

    const rewardBox = {
      index: index + 1,
      destroyed: false,
      mesh: box,
      core
    };
    box.userData.rewardBox = rewardBox;
    rewardBoxes.push(rewardBox);
  });
}

function buildBattlefield() {
  addGround();
  addMapBoundary();
  addStartingCover();

  addBarricade(2, 42, 0.15);
  addBarricade(-8, 34, 0.08);
  addBarricade(-29, 22, 0.06);
  addBarricade(-22, -6, 0.08);
  addBarricade(22, -18, -0.15);
  addBarricade(42, 18, Math.PI / 2);
  addBarricade(61, -37, Math.PI / 2);

  addContainer(new THREE.Vector3(22, 1.45, 18), 0.12, shared.materials.metalGreen);
  addContainer(new THREE.Vector3(32, 1.45, 23), -0.22, shared.materials.metalTan);
  addContainer(new THREE.Vector3(27, 4.35, 18), 0.12, shared.materials.metalDark);
  addContainer(new THREE.Vector3(-42, 1.45, -26), Math.PI / 2.1, shared.materials.metalTan);
  addContainer(new THREE.Vector3(-58, 1.45, 4), 0.05, shared.materials.metalGreen);
  addContainer(new THREE.Vector3(58, 1.45, -12), Math.PI / 2, shared.materials.metalTan);

  addWarehouse(new THREE.Vector3(40, 0, 43), new THREE.Vector3(18, 7, 16), -0.08);
  addWarehouse(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(18, 6, 14), 0.08);
  addWarehouse(new THREE.Vector3(62, 0, -46), new THREE.Vector3(14, 6, 12), 0.22);

  addTruck(new THREE.Vector3(-18, 0, 8), 0.2, true);
  addTruck(new THREE.Vector3(-25, 0, -24), -0.1, false);
  addTruck(new THREE.Vector3(10, 0, -34), 0.35, true);
  addTruck(new THREE.Vector3(5, 0, 62), -0.32, false);

  addRadioTower();

  addSolidBox(objectives[1].position.clone().add(new THREE.Vector3(0, 0.7, 0)), new THREE.Vector3(6, 1.4, 4.4), shared.materials.warning, {
    label: "ammo cache"
  });
  addSmokeColumn(objectives[1].position.clone().add(new THREE.Vector3(3, 2, -1)), 6);

  const laptop = new THREE.Mesh(shared.geometries.box, shared.materials.glass);
  laptop.position.copy(objectives[2].position).add(new THREE.Vector3(0, 1.1, 0));
  laptop.scale.set(0.9, 0.12, 0.65);
  laptop.castShadow = true;
  scene.add(laptop);

  const helipad = new THREE.Mesh(new THREE.RingGeometry(5.8, 7.0, 64), new THREE.MeshBasicMaterial({ color: 0x89b7ff }));
  helipad.position.copy(objectives[3].position).add(new THREE.Vector3(0, 0.09, 0));
  helipad.rotation.x = -Math.PI / 2;
  scene.add(helipad);

  for (let i = 0; i < 34; i += 1) {
    const x = randomRange(i * 33 + 5, -82, 82);
    const z = randomRange(i * 41 + 9, -76, 76);
    if (Math.abs(x) < 8 && Math.abs(z - 52) < 12) continue;
    const scale = new THREE.Vector3(randomRange(i, 1.2, 4.3), randomRange(i + 7, 0.8, 2.1), randomRange(i + 13, 1.1, 3.8));
    const mat = seededRandom(i * 18) > 0.5 ? shared.materials.concrete : shared.materials.metalTan;
    const prop = addSolidBox(new THREE.Vector3(x, scale.y * 0.5, z), scale, mat, {
      label: "field cover"
    });
    prop.rotation.y = randomRange(i * 29, -0.4, 0.4);
  }

  for (const objective of objectives) {
    addObjectiveMarker(objective);
  }

  addPowerUps();
  addRewardBoxes();
}

function createWeaponModel(actor = player, view = camera) {
  const group = new THREE.Group();
  group.position.set(0.38, -0.36, -0.68);
  group.rotation.set(-0.06, -0.04, 0);
  view.add(group);

  const receiver = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  receiver.scale.set(0.18, 0.16, 0.72);
  receiver.position.set(0, 0, -0.24);
  group.add(receiver);

  const handguard = new THREE.Mesh(shared.geometries.box, shared.materials.metalDark);
  handguard.scale.set(0.14, 0.13, 0.72);
  handguard.position.set(0, -0.01, -0.82);
  group.add(handguard);

  const barrel = new THREE.Mesh(shared.geometries.barrel, shared.materials.black);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -1.32);
  group.add(barrel);

  const stock = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  stock.scale.set(0.14, 0.16, 0.38);
  stock.position.set(0, 0.02, 0.24);
  group.add(stock);

  const grip = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  grip.scale.set(0.12, 0.28, 0.12);
  grip.position.set(0, -0.22, -0.18);
  grip.rotation.x = -0.32;
  group.add(grip);

  const mag = new THREE.Mesh(shared.geometries.box, shared.materials.metalDark);
  mag.scale.set(0.13, 0.34, 0.18);
  mag.position.set(0, -0.26, -0.35);
  mag.rotation.x = -0.12;
  group.add(mag);

  const opticBase = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  opticBase.scale.set(0.16, 0.08, 0.28);
  opticBase.position.set(0, 0.15, -0.42);
  group.add(opticBase);

  const opticGlass = new THREE.Mesh(shared.geometries.cylinder, shared.materials.glass);
  opticGlass.scale.set(0.09, 0.11, 0.09);
  opticGlass.rotation.x = Math.PI / 2;
  opticGlass.position.set(0, 0.2, -0.44);
  group.add(opticGlass);

  const foregrip = new THREE.Mesh(shared.geometries.box, shared.materials.black);
  foregrip.scale.set(0.1, 0.34, 0.1);
  foregrip.position.set(0, -0.24, -0.78);
  group.add(foregrip);

  const flash = new THREE.PointLight(0xffcd78, 0, 10, 2);
  flash.position.set(0, 0.03, -1.74);
  group.add(flash);

  const muzzle = new THREE.Mesh(shared.geometries.sphere, new THREE.MeshBasicMaterial({
    color: 0xffcd78,
    transparent: true,
    opacity: 0
  }));
  muzzle.scale.set(0.18, 0.18, 0.18);
  muzzle.position.copy(flash.position);
  group.add(muzzle);

  actor.weaponGroup = group;
  actor.muzzleLight = flash;
  actor.muzzleMesh = muzzle;
}

function createEnemy(type, position, seed) {
  const config = {
    rifleman: {
      health: 75,
      speed: 3.0,
      fireRate: 1.12,
      range: 54,
      accuracy: 0.18,
      damage: 6,
      fireballSpeed: 20,
      material: shared.materials.enemyRifle
    },
    breacher: {
      health: 95,
      speed: 4.0,
      fireRate: 0.9,
      range: 30,
      accuracy: 0.15,
      damage: 8,
      fireballSpeed: 18,
      material: shared.materials.enemyBreacher
    },
    marksman: {
      health: 65,
      speed: 2.4,
      fireRate: 1.95,
      range: 84,
      accuracy: 0.28,
      damage: 12,
      fireballSpeed: 24,
      material: shared.materials.enemyMarksman
    },
    support: {
      health: 110,
      speed: 2.6,
      fireRate: 0.75,
      range: 58,
      accuracy: 0.14,
      damage: 5,
      fireballSpeed: 19,
      material: shared.materials.enemySupport
    },
    commander: {
      health: 125,
      speed: 3.2,
      fireRate: 1.18,
      range: 62,
      accuracy: 0.22,
      damage: 8,
      fireballSpeed: 22,
      material: shared.materials.enemyCommander
    },
    finalBoss: {
      health: 1200,
      speed: 2.85,
      fireRate: 0.7,
      range: 86,
      accuracy: 0.36,
      damage: 16,
      material: shared.materials.enemyCommander,
      boss: true
    }
  }[type];

  const isBoss = Boolean(config.boss);
  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);

  const body = new THREE.Mesh(isBoss ? shared.geometries.box : shared.geometries.soldierBody, shared.materials.enemyHitbox);
  body.position.y = isBoss ? finalBossHeight * 0.5 : 1.0;
  if (isBoss) body.scale.set(finalBossWidth * 0.82, finalBossHeight * 0.9, 0.72);
  body.castShadow = false;
  group.add(body);

  const head = new THREE.Mesh(shared.geometries.soldierHead, shared.materials.enemyHitbox);
  head.position.y = isBoss ? finalBossHeight * 0.82 : 1.72;
  if (isBoss) head.scale.setScalar(4.2);
  head.castShadow = false;
  group.add(head);

  const helmet = new THREE.Mesh(shared.geometries.soldierHead, shared.materials.enemyHitbox);
  helmet.position.y = isBoss ? finalBossHeight * 0.88 : 1.83;
  helmet.scale.set(isBoss ? 4.55 : 1.08, isBoss ? 2.1 : 0.56, isBoss ? 4.55 : 1.08);
  helmet.castShadow = false;
  group.add(helmet);

  const leftWing = new THREE.Mesh(shared.geometries.box, shared.materials.enemyHitbox);
  leftWing.position.set(isBoss ? -finalBossWidth * 0.33 : -0.72, isBoss ? finalBossHeight * 0.5 : 1.55, 0);
  leftWing.scale.set(isBoss ? finalBossWidth * 0.38 : 0.86, isBoss ? finalBossHeight * 0.86 : 1.28, isBoss ? 0.62 : 0.22);
  group.add(leftWing);

  const rightWing = new THREE.Mesh(shared.geometries.box, shared.materials.enemyHitbox);
  rightWing.position.set(isBoss ? finalBossWidth * 0.33 : 0.72, isBoss ? finalBossHeight * 0.5 : 1.55, 0);
  rightWing.scale.set(isBoss ? finalBossWidth * 0.38 : 0.86, isBoss ? finalBossHeight * 0.86 : 1.28, isBoss ? 0.62 : 0.22);
  group.add(rightWing);

  const spriteMaterial = new THREE.MeshBasicMaterial({
    map: isBoss ? shared.bossSpriteTextures.idle : shared.enemySpriteTextures[0],
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const sprite = new THREE.Mesh(shared.geometries.plane, spriteMaterial);
  sprite.position.copy(position).add(new THREE.Vector3(0, isBoss ? finalBossHeight * 0.5 : 1.62, 0));
  sprite.scale.set(isBoss ? finalBossWidth : type === "commander" ? 4.15 : 3.72, isBoss ? finalBossHeight : type === "commander" ? 4.2 : 3.88, 1);
  sprite.castShadow = false;
  scene.add(sprite);

  body.userData.enemy = null;
  head.userData.enemy = null;
  helmet.userData.enemy = null;
  leftWing.userData.enemy = null;
  rightWing.userData.enemy = null;
  sprite.userData.enemy = null;
  enemyHitMeshes.push(body, head, helmet, leftWing, rightWing, sprite);

  const enemy = {
    type,
    config,
    group,
    body,
    head,
    leftWing,
    rightWing,
    sprite,
    spriteMaterial,
    currentSpriteIndex: 0,
    health: config.health,
    alive: true,
    boss: isBoss,
    eyeHeight: isBoss ? finalBossHeight * 0.72 : 1.55,
    targetHeight: isBoss ? finalBossHeight * 0.48 : 1.22,
    seed,
    state: "patrol",
    target: position.clone(),
    lastSeen: null,
    fireTimer: randomRange(seed, 0, config.fireRate),
    breathUntil: -10,
    decisionTimer: randomRange(seed + 4, 0.1, 0.8),
    updateSkip: isBoss ? 0 : Math.floor(randomRange(seed + 9, 0, 4)),
    stuckTimer: 0,
    aimYaw: randomRange(seed + 13, -Math.PI, Math.PI),
    cover: null,
    flankSide: seededRandom(seed + 22) > 0.5 ? 1 : -1
  };

  body.userData.enemy = enemy;
  head.userData.enemy = enemy;
  helmet.userData.enemy = enemy;
  leftWing.userData.enemy = enemy;
  rightWing.userData.enemy = enemy;
  sprite.userData.enemy = enemy;
  enemies.push(enemy);
  return enemy;
}

function spawnEnemies() {
  createEnemySpawnPlan();
  game.totalHostiles = spawnQueue.length;
  game.hostilesAlive = spawnQueue.length;
  deployEnemyWave(24, "Forward patrols deployed. More hostiles are staged deeper in the map.");
}

function createEnemySpawnPlan() {
  const sectors = [
    {
      name: "highway checkpoint",
      phase: 0,
      center: new THREE.Vector3(-18, 0, 18),
      radius: 22,
      types: ["rifleman", "breacher", "support"]
    },
    {
      name: "barracks compound",
      phase: 0,
      center: new THREE.Vector3(-48, 0, 16),
      radius: 24,
      types: ["rifleman", "breacher"]
    },
    {
      name: "radio tower ridge",
      phase: 1,
      center: new THREE.Vector3(48, 0, -54),
      radius: 22,
      types: ["rifleman", "marksman", "commander"]
    },
    {
      name: "eastern warehouse",
      phase: 1,
      center: new THREE.Vector3(42, 0, 36),
      radius: 24,
      types: ["rifleman", "breacher", "support"]
    },
    {
      name: "ammo depot",
      phase: 2,
      center: new THREE.Vector3(-54, 0, -46),
      radius: 24,
      types: ["rifleman", "support", "commander"]
    },
    {
      name: "container yard",
      phase: 2,
      center: new THREE.Vector3(62, 0, -14),
      radius: 26,
      types: ["rifleman", "breacher", "marksman"]
    },
    {
      name: "north roadblock",
      phase: 3,
      center: new THREE.Vector3(4, 0, -62),
      radius: 26,
      types: ["rifleman", "marksman", "support"]
    },
    {
      name: "extraction perimeter",
      phase: 3,
      center: new THREE.Vector3(-8, 0, 76),
      radius: 28,
      types: ["rifleman", "breacher", "commander"]
    }
  ];

  const quotas = [
    ["rifleman", 60],
    ["breacher", 15],
    ["marksman", 10],
    ["support", 10],
    ["commander", 5]
  ];

  let created = 0;
  for (const [type, count] of quotas) {
    const validSectors = sectors.filter((sector) => sector.types.includes(type));
    for (let i = 0; i < count; i += 1) {
      const sector = validSectors[(created + i) % validSectors.length];
      const seed = game.spawnSeed + created * 31;
      spawnQueue.push({
        type,
        seed,
        sector: sector.name,
        phase: sector.phase,
        position: makeSpawnPosition(sector, seed)
      });
      created += 1;
    }
  }

  spawnQueue.sort((a, b) => {
    const phaseDelta = a.phase - b.phase;
    if (phaseDelta !== 0) return phaseDelta;
    return seededRandom(a.seed + 101) - seededRandom(b.seed + 101);
  });
}

function makeSpawnPosition(sector, seed) {
  let fallback = sector.center.clone();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const angle = randomRange(seed + attempt * 17, 0, Math.PI * 2);
    const radius = randomRange(seed + attempt * 23, sector.radius * 0.28, sector.radius);
    const position = new THREE.Vector3(
      sector.center.x + Math.cos(angle) * radius,
      0,
      sector.center.z + Math.sin(angle) * radius
    );
    fallback = position;
    if (position.distanceToSquared(player.feet) > 360 && canOccupy(position, 0.42)) {
      return position;
    }
  }
  return fallback;
}

function deployEnemyWave(count, reason) {
  let deployed = 0;
  const sectors = new Set();
  const usedThisWave = new Set();
  while (deployed < count && spawnQueue.length > 0) {
    let nextIndex = spawnQueue.findIndex((spawn) => !usedThisWave.has(spawn.sector));
    if (nextIndex === -1) {
      usedThisWave.clear();
      nextIndex = 0;
    }
    const [next] = spawnQueue.splice(nextIndex, 1);
    createEnemy(next.type, next.position, next.seed);
    sectors.add(next.sector);
    usedThisWave.add(next.sector);
    deployed += 1;
  }
  if (deployed === 0) return;

  game.deployedHostiles += deployed;
  game.lastWaveAt = game.time;
  game.waveNumber += 1;
  if (reason) {
    const sectorText = Array.from(sectors).slice(0, 2).join(" / ");
    addMessage(`${reason} +${deployed} active near ${sectorText}.`);
  }
}

function activeEnemyCount() {
  let active = 0;
  for (const enemy of enemies) {
    if (enemy.alive) active += 1;
  }
  return active;
}

function setActivePlayer(actor, view, pad = emptyGamepad) {
  player = actor;
  camera = view;
  activeGamepad = pad;
}

function padForLocalActor(actor) {
  if (actor === playerThree) return controlPadThree;
  if (actor === playerTwo) return controlPadTwo;
  return controlPadOne;
}

function bundleForLocalActor(actor) {
  return {
    actor,
    view: cameraForRole(actor.role),
    pad: padForLocalActor(actor)
  };
}

function localSplitBundles() {
  return [playerOne, playerTwo, playerThree]
    .slice(0, localSplit.players)
    .map(bundleForLocalActor);
}

function bundleForRole(role) {
  return {
    actor: actorForRole(role),
    view: cameraForRole(role),
    pad: controlPadOne
  };
}

function localBundle() {
  return online.enabled ? bundleForRole(online.role) : { actor: playerOne, view: cameraOne, pad: controlPadOne };
}

function remoteBundle() {
  return online.enabled ? players.find((actor) => actor.role !== online.role) : null;
}

function nearestPlayerTarget(position) {
  let bestActor = playerOne;
  let bestCamera = cameraOne;
  let bestPad = controlPadOne;
  let bestDistance = Infinity;
  const candidates = activePlayers().map((actor) => ({
    actor,
    view: cameraForRole(actor.role),
    pad: !online.enabled && localSplit.enabled ? padForLocalActor(actor) : actor === playerTwo ? controlPadTwo : controlPadOne
  }));
  for (const candidate of candidates) {
    if (candidate.actor.downed) continue;
    const distance = candidate.actor.feet.distanceToSquared(position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestActor = candidate.actor;
      bestCamera = candidate.view;
      bestPad = candidate.pad;
    }
  }
  return { actor: bestActor, view: bestCamera, pad: bestPad };
}

function updateSpawnDirector() {
  if (!game.running || spawnQueue.length === 0) return;
  if (game.bossPhase !== "idle") return;

  const completedPrimary = objectives.filter((objective) => !objective.extraction && objective.complete).length;
  const active = activeEnemyCount();
  const targetActive = 24 + completedPrimary * 8;
  const lowWaterMark = 12 + completedPrimary * 3;

  if (active <= lowWaterMark) {
    deployEnemyWave(10 + completedPrimary * 2, "Contact thinning. Reserve squad moving up.");
    return;
  }

  if (active < targetActive && game.time - game.lastWaveAt > 28) {
    deployEnemyWave(8, "Patrol group entering the battlespace.");
  }
}

function canOccupy(position, radius = 0.42) {
  for (const c of colliders) {
    if (
      position.x > c.min.x - radius &&
      position.x < c.max.x + radius &&
      position.z > c.min.z - radius &&
      position.z < c.max.z + radius
    ) {
      return false;
    }
  }
  return true;
}

function moveWithCollisions(position, delta, radius = 0.42) {
  const nextX = position.clone();
  nextX.x += delta.x;
  if (canOccupy(nextX, radius)) {
    position.x = nextX.x;
  }

  const nextZ = position.clone();
  nextZ.z += delta.z;
  if (canOccupy(nextZ, radius)) {
    position.z = nextZ.z;
  }
}

function enemyMoveWithCollisions(enemy, velocity, dt) {
  const previous = enemy.group.position.clone();
  moveWithCollisions(enemy.group.position, velocity.clone().multiplyScalar(dt), enemy.boss ? 1.25 : 0.38);
  const moved = enemy.group.position.distanceToSquared(previous);
  if (moved < 0.0003) {
    enemy.stuckTimer += dt;
    enemy.aimYaw += enemy.flankSide * dt * 2.2;
  } else {
    enemy.stuckTimer = 0;
  }
}

function getForward() {
  return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}

function getRight() {
  return new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
}

function controllerFamily(id = "") {
  const lowerId = id.toLowerCase();
  if (lowerId.includes("xbox") || lowerId.includes("xinput") || lowerId.includes("microsoft")) return "xbox";
  if (lowerId.includes("playstation") || lowerId.includes("dualsense") || lowerId.includes("dualshock")) return "playstation";
  return "standard";
}

function controllerFlowHint(pad) {
  const faceButtons = ["jump", "crouch", "interact", "switchWeapon"]
    .map((action) => promptManager.getPrompt(controllerManager.promptButtonIndex(action)).label)
    .join(" / ");
  const aim = promptManager.getPrompt(controllerManager.promptButtonIndex("ads")).label;
  const fire = promptManager.getPrompt(controllerManager.promptButtonIndex("fire")).label;
  return `${controllerFlowSummary} Active prompts: ${faceButtons}, ${aim} aim, ${fire} fire.`;
}

function promptDisplayName(prompt) {
  return prompt.name && prompt.name !== prompt.label ? `${prompt.label} ${prompt.name}` : prompt.label;
}

function promptNameFor(buttonIndex) {
  return promptDisplayName(promptManager.getPrompt(buttonIndex));
}

function promptNameForAction(action) {
  return promptNameFor(controllerManager.promptButtonIndex(action));
}

function controllerButtonLabel(buttonIndex) {
  const prompt = promptManager.getPrompt(buttonIndex);
  const action = buttonActions[buttonIndex] || `Button ${buttonIndex}`;
  return `${promptDisplayName(prompt)} - ${action}`;
}

function updateControllerPromptLayout() {
  if (promptManager.layout !== "ps") {
    promptManager.setLayout("ps");
    controllerPromptUiSignature = "";
  }
}

// Gameplay reads only standard Gamepad API button indices. This visual layer
// changes labels/icons without changing any input bindings.
let controllerPromptUiSignature = "";
function updateControllerPromptUi(force = false) {
  const promptElements = Array.from(document.querySelectorAll("[data-prompt-button]"));
  const signature = `${promptManager.layout}:${promptElements.length}`;
  if (!force && signature === controllerPromptUiSignature) return;
  controllerPromptUiSignature = signature;
  shell.dataset.promptLayout = promptManager.layout;

  for (const element of promptElements) {
    const buttonIndex = Number(element.dataset.promptButton);
    const prompt = promptManager.getPrompt(buttonIndex);
    const action = element.dataset.promptAction || "";
    element.textContent = prompt.label;
    element.dataset.promptLayout = prompt.layout;
    element.dataset.promptName = prompt.name;
    element.dataset.promptIcon = prompt.iconPath || "";
    if (action) element.setAttribute("aria-label", `${prompt.name}: ${action}`);
    element.title = action ? `${promptDisplayName(prompt)} - ${action}` : promptDisplayName(prompt);
  }

  if (ui.promptPreview) {
    ui.promptPreview.dataset.promptLayout = promptManager.layout;
    ui.promptPreview.setAttribute("aria-label", `Controller prompt preview: ${promptManager.layout}`);
  }
}

function cleanGamepadAxis(axis) {
  const value = Number.isFinite(axis) ? axis : 0;
  return Math.abs(value) < controllerSettings.deadzone ? 0 : clamp(value, -1, 1);
}

function normalizeGamepadAxes(pad) {
  return Array.from({ length: Math.max(pad.axes.length, 4) }, (_, index) => cleanGamepadAxis(pad.axes[index]));
}

const weaponConfigs = Object.freeze({
  rifle: {
    label: "M4A1-style Rifle",
    magSize: 30,
    autoInterval: 0.082,
    semiInterval: 0.18,
    damageMin: 31,
    damageMax: 43,
    headshotDamage: 82,
    recoilAds: 0.07,
    recoilHip: 0.11,
    spreadAdsMultiplier: 0.35,
    tracer: 0xf2c46b
  },
  sidearm: {
    label: "9mm Sidearm",
    magSize: 15,
    autoInterval: 0.19,
    semiInterval: 0.19,
    damageMin: 24,
    damageMax: 34,
    headshotDamage: 68,
    recoilAds: 0.052,
    recoilHip: 0.086,
    spreadAdsMultiplier: 0.42,
    tracer: 0xd7e8ff
  }
});

function activeWeaponConfig(actor = player) {
  return weaponConfigs[actor.weaponSlot] || weaponConfigs.rifle;
}

const touchButtonMap = {
  jump: controllerManager.buttonIndexForAction("jump"),
  crouch: controllerManager.buttonIndexForAction("crouch"),
  reload: controllerManager.buttonIndexForAction("reload"),
  switchWeapon: controllerManager.buttonIndexForAction("switchWeapon"),
  tactical: controllerManager.buttonIndexForAction("tactical"),
  lethal: controllerManager.buttonIndexForAction("lethal"),
  ads: controllerManager.buttonIndexForAction("ads"),
  fire: controllerManager.buttonIndexForAction("fire"),
  sprint: controllerManager.buttonIndexForAction("sprint"),
  melee: controllerManager.buttonIndexForAction("melee"),
  ping: controllerManager.buttonIndexForAction("ping"),
  armor: controllerManager.buttonIndexForAction("armor"),
  fireMode: controllerManager.buttonIndexForAction("fireMode"),
  streak: controllerManager.buttonIndexForAction("streak")
};

function resetPadRuntime(target) {
  const lastSprintTap = target.lastSprintTap;
  const secondaryHoldAt = target.secondaryHoldAt;
  const secondaryLongHandled = target.secondaryLongHandled;
  Object.assign(target, createGamepadState(), { lastSprintTap, secondaryHoldAt, secondaryLongHandled });
}

function syncGamepadState(target, pad) {
  target.prevButtons = target.buttons.slice();
  if (!pad) {
    resetPadRuntime(target);
    return;
  }
  target.connected = true;
  target.index = pad.index;
  target.id = pad.id || "Controller";
  target.mapping = pad.mapping || "";
  target.source = pad;
  target.axes = normalizeGamepadAxes(pad);
  target.buttons = pad.buttons.map((button) => button.value);
}

function syncTouchPadState() {
  touchPad.prevButtons = touchPad.buttons.slice();
  touchPad.connected = touchControls.enabled;
  touchPad.index = 1000;
  touchPad.id = touchControls.enabled ? "On-screen controller" : "";
  touchPad.mapping = "standard";
  touchPad.source = null;
  touchPad.axes = [
    clamp(touchControls.moveX, -1, 1),
    clamp(-touchControls.moveY, -1, 1),
    clamp(touchControls.lookDeltaX * 0.042, -1, 1),
    clamp(touchControls.lookDeltaY * 0.042, -1, 1)
  ];
  touchPad.buttons = Array.from({ length: 16 }, (_, index) => {
    for (const [name, buttonIndex] of Object.entries(touchButtonMap)) {
      if (buttonIndex === index && touchControls.buttons.get(name)) return 1;
    }
    return 0;
  });
  touchControls.lookDeltaX = 0;
  touchControls.lookDeltaY = 0;
}

function mergeControlPads(target, hardware, virtual) {
  target.prevButtons = target.buttons.slice();
  target.connected = hardware.connected || virtual.connected;
  target.index = hardware.connected ? hardware.index : virtual.index;
  target.id = hardware.connected ? hardware.id : virtual.id;
  target.mapping = hardware.mapping || virtual.mapping || "standard";
  target.source = hardware.source || null;
  const maxAxes = Math.max(hardware.axes.length, virtual.axes.length, 6);
  target.axes = Array.from({ length: maxAxes }, (_, index) =>
    clamp((hardware.axes[index] || 0) + (virtual.axes[index] || 0), -1, 1)
  );
  const maxButtons = Math.max(hardware.buttons.length, virtual.buttons.length, 16);
  target.buttons = Array.from({ length: maxButtons }, (_, index) =>
    Math.max(hardware.buttons[index] || 0, virtual.buttons[index] || 0)
  );
}

function connectedGamepads() {
  return controllerManager.readGamepads();
}

function selectedHardwarePad(pads = connectedGamepads()) {
  if (controllerSlot === autoControllerSlot) return pads[0] || null;
  return pads.find((pad) => String(pad.index) === controllerSlot) || null;
}

function compactControllerId(id = "") {
  const cleaned = String(id || "Controller").replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? `${cleaned.slice(0, 39)}...` : cleaned;
}

function controllerPadLabel(pad) {
  if (!pad) return "No controller";
  const shortName = controllerShortName({
    connected: true,
    id: pad.id || "Controller",
    mapping: pad.mapping || ""
  });
  return `Controller ${pad.index + 1}: ${shortName}`;
}

function controllerSlotOptions(pads = connectedGamepads()) {
  const options = [autoControllerSlot];
  for (const pad of pads) options.push(String(pad.index));
  if (controllerSlot !== autoControllerSlot && !options.includes(controllerSlot)) {
    options.push(controllerSlot);
  }
  return options;
}

function setControllerSlot(value, announce = true) {
  controllerSlot = sanitizeControllerSlot(value);
  controllerClaimUntil = 0;
  saveControllerSlot();
  updateControllerSelectionUi(true);

  if (!announce) return;
  const pads = connectedGamepads();
  const selected = selectedHardwarePad(pads);
  if (controllerSlot === autoControllerSlot) {
    addMessage(selected
      ? `This window uses Auto controller: ${controllerPadLabel(selected)}. ${controllerFlowHint(selected)}`
      : "This window uses Auto controller. Connect or press a PS/Xbox pad.");
  } else if (selected) {
    addMessage(`This window assigned to ${controllerPadLabel(selected)}. ${controllerFlowHint(selected)}`);
  } else {
    addMessage(`This window assigned to Controller ${Number(controllerSlot) + 1}; waiting for reconnect.`);
  }
}

function cycleControllerSlot(direction = 1) {
  const pads = connectedGamepads();
  const options = controllerSlotOptions(pads);
  if (options.length <= 1) {
    setControllerSlot(autoControllerSlot);
    return;
  }
  const currentIndex = Math.max(0, options.indexOf(controllerSlot));
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  setControllerSlot(options[nextIndex]);
}

function gamepadHasClaimActivity(pad) {
  if (!pad) return false;
  const buttonPressed = Array.from(pad.buttons || []).some((button) => button.value > 0.45);
  const stickMoved = Array.from(pad.axes || []).some((axis) => Math.abs(axis || 0) > 0.55);
  return buttonPressed || stickMoved;
}

function armControllerClaim() {
  const pads = connectedGamepads();
  if (!pads.length) {
    addMessage("No gamepad detected. Connect a PS5/Xbox controller, click this window, then try Detect.");
    updateControllerSelectionUi(true);
    return;
  }
  controllerClaimUntil = performance.now() + controllerClaimDurationMs;
  addMessage("Controller detect armed. Press any button or move a stick on the pad for this window.");
  updateControllerSelectionUi(true);
}

function claimControllerFromInput(pads) {
  if (!controllerClaimUntil) return;
  if (performance.now() > controllerClaimUntil) {
    controllerClaimUntil = 0;
    updateControllerSelectionUi(true);
    return;
  }
  const claimed = pads.find(gamepadHasClaimActivity);
  if (claimed) setControllerSlot(String(claimed.index));
}

function updateControllerSelectionUi(force = false) {
  if (!ui.controllerChoice) return;

  const pads = connectedGamepads();
  const selected = selectedHardwarePad(pads);
  const armed = Boolean(controllerClaimUntil && performance.now() <= controllerClaimUntil);
  const signature = [
    controllerSlot,
    armed ? "armed" : "idle",
    selected?.index ?? "none",
    pads.map((pad) => `${pad.index}:${pad.id}:${pad.mapping}`).join("|")
  ].join("::");
  if (!force && signature === controllerUiSignature) return;
  controllerUiSignature = signature;

  if (controllerSlot === autoControllerSlot) {
    ui.controllerChoice.textContent = selected ? `Auto - ${controllerPadLabel(selected)}` : "Auto - waiting for controller";
  } else if (selected) {
    ui.controllerChoice.textContent = controllerPadLabel(selected);
  } else {
    ui.controllerChoice.textContent = `Controller ${Number(controllerSlot) + 1} - not connected`;
  }

  if (ui.controllerHint) {
    if (armed) {
      ui.controllerHint.textContent = "Listening now: press a button or move a stick on the controller for this window.";
    } else if (!pads.length) {
      ui.controllerHint.textContent = "Connect a PS5/Xbox pad, click this window, then choose Detect.";
    } else if (controllerSlot === autoControllerSlot) {
      const flow = selected ? ` ${controllerFlowHint(selected)}` : "";
      ui.controllerHint.textContent = `${pads.length} controller${pads.length === 1 ? "" : "s"} detected. Auto uses the first pad; fixed slots are better for three windows.${flow}`;
    } else if (selected) {
      ui.controllerHint.textContent = `${compactControllerId(selected.id)} is locked to this browser window. ${controllerFlowHint(selected)}`;
    } else {
      ui.controllerHint.textContent = "Waiting for that controller index. Reconnect it or choose another slot.";
    }
  }

  const options = controllerSlotOptions(pads);
  const canCycle = options.length > 1;
  if (ui.controllerPrev) ui.controllerPrev.disabled = !canCycle;
  if (ui.controllerNext) ui.controllerNext.disabled = !canCycle;
  if (ui.controllerDetect) {
    ui.controllerDetect.disabled = !pads.length;
    ui.controllerDetect.textContent = armed ? "Listening" : "Detect";
  }
}

function pollGamepad() {
  const connectedPads = connectedGamepads();
  claimControllerFromInput(connectedPads);
  const selectedPad = selectedHardwarePad(connectedPads);
  const remainingPads = connectedPads.filter((pad) => pad !== selectedPad);
  const secondaryPad = remainingPads[0] || null;
  const thirdPad = remainingPads[1] || null;
  syncGamepadState(gamepadOne, selectedPad);
  syncGamepadState(gamepadTwo, secondaryPad);
  syncGamepadState(gamepadThree, thirdPad);
  syncTouchPadState();
  mergeControlPads(controlPadOne, gamepadOne, touchPad);
  mergeControlPads(controlPadTwo, gamepadTwo, emptyGamepad);
  mergeControlPads(controlPadThree, gamepadThree, emptyGamepad);
  updateControllerPromptLayout(controlPadOne.connected ? controlPadOne : selectedPad);
  updateControllerPromptUi();
  updateControllerSelectionUi();
}

function controllerStartPressed(pad) {
  return controllerManager.wasPressed("pause", pad) || controllerManager.wasPressed("tacticalMap", pad);
}

function handleControllerMenuInput() {
  const menuPads = localSplit.enabled && !online.enabled
    ? [controlPadOne, controlPadTwo, controlPadThree]
    : [controlPadOne];
  const startPressed = menuPads.some((pad) => controllerManager.wasPressed("pause", pad));
  if (!startPressed) return;
  if (game.calibrationOpen) {
    setControllerCalibrationOpen(false);
  } else if (game.running && !game.ended) {
    setControllerCalibrationOpen(true);
  } else if (game.ended) {
    resetGame();
  } else if (!game.running && startPressed) {
    if (online.enabled) {
      void toggleReadyUp();
    } else {
      startGame();
    }
  }
}

function pulseGamepad(pad, weakMagnitude = 0.12, strongMagnitude = 0.2, duration = 55) {
  if (!pad?.connected || !pad.source) return;
  const actuator = pad.source.vibrationActuator;
  if (actuator?.playEffect) {
    actuator.playEffect("dual-rumble", { duration, weakMagnitude, strongMagnitude }).catch(() => {});
    return;
  }
  const haptic = pad.source.hapticActuators?.[0];
  if (haptic?.pulse) {
    haptic.pulse(Math.max(weakMagnitude, strongMagnitude), duration).catch(() => {});
  }
}

function normalizeRoomCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function setRoomStatus(text, tone = "normal") {
  ui.roomStatus.textContent = text;
  ui.roomStatus.dataset.tone = tone;
}

function setLobbySlot(element, role, playerState) {
  if (!element) return;
  const label = element.querySelector("span");
  const value = element.querySelector("strong");
  const isSelf = online.role === role;
  const ready = Boolean(playerState?.ready);
  const skin = skinForId(playerState?.skin || actorForRole(role).skinId || defaultSkinForRole(role));

  element.classList.toggle("is-self", isSelf);
  element.classList.toggle("is-ready", ready);
  label.textContent = `${role.toUpperCase()}${isSelf ? " YOU" : ""}`;
  if (!playerState) {
    value.textContent = "Open";
  } else {
    value.textContent = `${ready ? "Ready" : "Not ready"} - ${skin.label}`;
  }
}

function updateSkinUi() {
  for (const button of ui.skinButtons) {
    const selected = button.dataset.skin === online.skin;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = online.localReady || game.running;
  }
}

function updateLobbyUi(room = online.lastRoom) {
  const inLobby = online.enabled && !game.running && !game.ended;
  shell.classList.toggle("online-lobby", inLobby);

  if (ui.lobbyPanel) {
    ui.lobbyPanel.classList.toggle("visible", online.enabled);
  }
  if (ui.lobbyCode) {
    ui.lobbyCode.textContent = online.roomCode || "-----";
  }

  const p1 = room?.players?.p1 || null;
  const p2 = room?.players?.p2 || null;
  const p3 = room?.players?.p3 || null;
  const localSlot = online.role ? room?.players?.[online.role] : null;

  online.localReady = Boolean(localSlot?.ready);
  if (localSlot?.skin) online.skin = skinForId(localSlot.skin).id;
  setLobbySlot(ui.lobbyP1, "p1", p1);
  setLobbySlot(ui.lobbyP2, "p2", p2);
  setLobbySlot(ui.lobbyP3, "p3", p3);
  updateSkinUi();

  if (ui.readyUp) {
    ui.readyUp.disabled = !online.enabled || online.pending || game.running || Boolean(room?.started);
    ui.readyUp.textContent = online.localReady ? "Ready: Waiting" : "Ready Up";
  }
  if (ui.leaveRoom) {
    ui.leaveRoom.disabled = !online.enabled || online.pending;
    ui.leaveRoom.textContent = game.running ? "Leave Mission" : "Leave Room";
  }
  if (ui.start) {
    ui.start.disabled = online.enabled;
    ui.start.textContent = online.enabled ? "Squad Ready Starts" : "Deploy Solo";
  }
  if (ui.startSplit) {
    ui.startSplit.disabled = online.enabled;
    ui.startSplit.textContent = online.enabled ? "Online Only" : "3P Split";
  }
  if (ui.createRoom) ui.createRoom.disabled = online.enabled || online.pending;
  if (ui.joinRoom) ui.joinRoom.disabled = online.enabled || online.pending;
  if (ui.roomCode) ui.roomCode.disabled = online.enabled || online.pending;

  if (!online.enabled) {
    setRoomStatus("Create or join a room.");
    if (ui.lobbyHint) ui.lobbyHint.textContent = "Create or join a room to ready up.";
    return;
  }

  const connected = [p1, p2, p3].filter(Boolean);
  const readyCount = connected.filter((slot) => slot.ready).length;
  const playerTargetText = connected.length >= 3 ? "3-player squad" : "2-player squad";

  if (room?.started) {
    setRoomStatus(`Room ${online.roomCode}: squad ready. Launching mission.`);
    if (ui.lobbyHint) ui.lobbyHint.textContent = "Mission is starting.";
  } else if (connected.length < 2) {
    setRoomStatus(`Room ${online.roomCode}: share this code with Player 2 or 3.`);
    if (ui.lobbyHint) ui.lobbyHint.textContent = "Waiting for at least one teammate to join.";
  } else if (!online.localReady) {
    setRoomStatus(`Room ${online.roomCode}: ${readyCount}/${connected.length} ready.`);
    if (ui.lobbyHint) ui.lobbyHint.textContent = "Press Ready Up when your controller is set.";
  } else {
    setRoomStatus(`Room ${online.roomCode}: ${readyCount}/${connected.length} ready.`);
    if (ui.lobbyHint) ui.lobbyHint.textContent = `Waiting for ${playerTargetText} readiness.`;
  }
}

function handleRoomUpdate(room) {
  if (!room) return;
  online.lastRoom = room;
  online.requestFailures = 0;
  online.lastConnectedAt = Date.now();
  online.error = "";
  online.remoteReady = false;
  for (const role of playerRoles) {
    const slot = room.players?.[role];
    const actor = actorForRole(role);
    if (slot?.skin) setActorSkin(actor, slot.skin);
    if (role !== online.role && slot?.state) {
      online.remoteReady = true;
      applyRemotePlayerState(slot.state, role);
    }
  }
  updateLobbyUi(room);
  saveOnlineSession();

  if (room.started && !game.running && !game.ended) {
    online.announcedStart = true;
    addMessage(`Room ${online.roomCode} ready. Launching co-op mission.`);
    startGame();
  }
}

function serializePlayerState(actor) {
  return {
    skin: actor.skinId || defaultSkinForRole(actor.role),
    x: Number(actor.feet.x.toFixed(3)),
    y: Number(actor.feet.y.toFixed(3)),
    z: Number(actor.feet.z.toFixed(3)),
    yaw: Number(actor.yaw.toFixed(4)),
    pitch: Number(actor.pitch.toFixed(4)),
    height: Number(actor.height.toFixed(3)),
    health: Math.round(actor.health),
    armor: Math.round(actor.armor),
    stamina: Math.round(actor.stamina),
    kills: actor.kills,
    downed: actor.downed,
    weaponSlot: actor.weaponSlot,
    ads: actor.ads,
    sprinting: actor.sprinting,
    stance: actor.stance,
    nightVision: actor.nightVision,
    slideTimer: Number(actor.slideTimer.toFixed(3)),
    meleeTimer: Number(actor.meleeTimer.toFixed(3)),
    lastShotAt: Number(actor.lastShotAt.toFixed(3)),
    updatedAt: Date.now()
  };
}

function applyRemotePlayerState(state, role) {
  if (!online.enabled || !state) return;
  const actor = role ? actorForRole(role) : remoteBundle();
  if (!actor) return;

  const authoritativeSkin = role ? online.lastRoom?.players?.[role]?.skin : null;
  setActorSkin(actor, authoritativeSkin || state.skin || actor.skinId);
  const target = new THREE.Vector3(state.x || 0, state.y || 0, state.z || 0);
  actor.feet.lerp(target, 0.42);
  actor.yaw = state.yaw || actor.yaw;
  actor.pitch = state.pitch || 0;
  actor.height = state.height || actor.height;
  actor.targetHeight = actor.height;
  actor.health = state.health ?? actor.health;
  actor.armor = state.armor ?? actor.armor;
  actor.stamina = state.stamina ?? actor.stamina;
  actor.kills = state.kills ?? actor.kills;
  actor.downed = Boolean(state.downed);
  actor.weaponSlot = state.weaponSlot || actor.weaponSlot;
  actor.ads = Boolean(state.ads);
  actor.sprinting = Boolean(state.sprinting);
  actor.stance = state.stance || actor.stance;
  actor.nightVision = Boolean(state.nightVision);
  actor.slideTimer = state.slideTimer || 0;
  actor.meleeTimer = state.meleeTimer || 0;
  actor.lastShotAt = state.lastShotAt || actor.lastShotAt;
  online.remoteLastSeen = Date.now();
  online.remoteReady = true;
}

function saveOnlineSession() {
  if (!online.enabled || !online.role || !online.roomCode) return;
  sessionSet(onlineSessionKey, JSON.stringify({
    clientId: online.clientId,
    role: online.role,
    roomCode: online.roomCode,
    skin: online.skin,
    localReady: online.localReady,
    running: game.running,
    updatedAt: Date.now()
  }));
}

function clearOnlineSession() {
  sessionRemove(onlineSessionKey);
  storageRemove(onlineSessionKey);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function roomError(message, status = 0) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function roomRequest(action, payload = {}, options = {}) {
  const retries = options.retries ?? (action === "sync" ? 1 : 2);
  const timeoutMs = options.timeoutMs ?? onlineRequestTimeoutMs;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          action,
          clientId: online.clientId,
          ...payload
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw roomError(data.error || `Room request failed (${response.status}).`, response.status);
      }
      return data;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? roomError("Room request timed out.")
        : error;
      const retryable = !lastError.status || lastError.status >= 500;
      if (!retryable || attempt >= retries) break;
      await wait(220 + attempt * 360);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError || roomError("Room request failed.");
}

function configureOnlineMode(role, code, room) {
  localSplit.enabled = false;
  localSplit.players = 1;
  online.enabled = true;
  online.role = role;
  online.roomCode = code;
  online.skin = skinForId(room?.players?.[role]?.skin || online.skin || defaultSkinForRole(role)).id;
  online.lastRoom = room || null;
  online.localReady = Boolean(room?.players?.[role]?.ready);
  online.announcedStart = false;
  online.remoteReady = playerRoles.some((peerRole) => peerRole !== role && room?.players?.[peerRole]?.state);
  online.requestFailures = 0;
  online.lastConnectedAt = Date.now();
  online.error = "";
  shell.classList.add("online-mode");
  shell.classList.add("online-lobby");
  shell.classList.remove("split-mode");

  if (ui.roomCode) ui.roomCode.value = code;
  const local = bundleForRole(role);
  setActorSkin(local.actor, online.skin);
  updateCameraAspects();
  setActivePlayer(local.actor, local.view, controlPadOne);
  updateLobbyUi(room);
  saveOnlineSession();
  setRoomStatus(`Room ${code}: you are ${role.toUpperCase()}. Ready up when set.`);
  addMessage(`Online co-op room ${code}. You are ${role.toUpperCase()}.`);
  if (room?.started) handleRoomUpdate(room);
}

function resetOnlineMode(message = "Left room. Create or join another room.") {
  online.enabled = false;
  online.role = null;
  online.roomCode = "";
  online.pending = false;
  online.syncPending = false;
  online.localReady = false;
  online.remoteReady = false;
  online.requestFailures = 0;
  online.recovering = false;
  online.lastRoom = null;
  online.error = "";
  clearOnlineSession();

  shell.classList.remove("online-mode");
  shell.classList.remove("online-lobby");
  if (!game.running) {
    setActivePlayer(playerOne, cameraOne, controlPadOne);
  }
  if (ui.roomCode) ui.roomCode.value = "";
  updateLobbyUi(null);
  setRoomStatus(message);
  addMessage(message);
}

async function restoreOnlineSession() {
  if (online.restoreAttempted || online.enabled || !storedOnlineSession) return;
  online.restoreAttempted = true;
  const code = normalizeRoomCode(storedOnlineSession.roomCode);
  const role = playerRoles.includes(storedOnlineSession.role) ? storedOnlineSession.role : null;
  if (!code || !role) return;

  online.clientId = storedOnlineSession.clientId || online.clientId;
  online.skin = skinForId(storedOnlineSession.skin || defaultSkinForRole(role)).id;
  if (ui.roomCode) ui.roomCode.value = code;
  setRoomStatus(`Reconnecting room ${code}...`, "warn");

  try {
    const local = bundleForRole(role);
    setActorSkin(local.actor, online.skin);
    const result = await roomRequest("recover", {
      code,
      role,
      ready: Boolean(storedOnlineSession.localReady),
      started: Boolean(storedOnlineSession.running),
      skin: online.skin,
      state: serializePlayerState(local.actor)
    }, { retries: 2, timeoutMs: 8000 });
    configureOnlineMode(result.role || role, result.code || code, result.room);
    setRoomStatus(`Room ${result.code || code}: reconnected. Ready up when set.`);
  } catch (error) {
    setRoomStatus(`Last room ${code} unavailable. Create or join a room.`, "warn");
  }
}

async function createOnlineRoom() {
  if (online.pending) return;
  online.pending = true;
  setRoomStatus("Creating Vercel room...");
  try {
    setActorSkin(playerOne, online.skin);
    const state = serializePlayerState(playerOne);
    const result = await roomRequest("create", { state, skin: online.skin });
    configureOnlineMode(result.role, result.code, result.room);
  } catch (error) {
    setRoomStatus(`${error.message} Run on Vercel or vercel dev for online rooms.`, "error");
  } finally {
    online.pending = false;
  }
}

async function joinOnlineRoom() {
  if (online.pending) return;
  const code = normalizeRoomCode(ui.roomCode.value);
  if (!code || code.length < 5) {
    setRoomStatus("Enter the 5-character room code.", "error");
    return;
  }
  online.pending = true;
  setRoomStatus(`Joining room ${code}...`);
  try {
    setActorSkin(playerTwo, online.skin);
    const state = serializePlayerState(playerTwo);
    const result = await roomRequest("join", { code, state, skin: online.skin });
    configureOnlineMode(result.role, result.code, result.room);
  } catch (error) {
    setRoomStatus(error.message, "error");
  } finally {
    online.pending = false;
  }
}

async function toggleReadyUp() {
  if (!online.enabled || online.pending || !online.role || !online.roomCode) return;
  online.pending = true;
  const nextReady = !online.localReady;
  setRoomStatus(nextReady ? "Sending ready status..." : "Clearing ready status...");
  updateLobbyUi();
  try {
    const local = bundleForRole(online.role);
    const result = await roomRequest("ready", {
      code: online.roomCode,
      role: online.role,
      ready: nextReady,
      skin: online.skin,
      state: serializePlayerState(local.actor)
    });
    handleRoomUpdate(result.room);
  } catch (error) {
    online.error = error.message;
    setRoomStatus(error.message, "error");
  } finally {
    online.pending = false;
    updateLobbyUi();
  }
}

async function leaveOnlineRoom() {
  if (!online.enabled || online.pending) return;
  const code = online.roomCode;
  const role = online.role;
  online.pending = true;
  setRoomStatus(`Leaving room ${code}...`);
  updateLobbyUi();

  try {
    if (code && role) {
      await roomRequest("leave", { code, role }, { retries: 1, timeoutMs: 5000 });
    }
  } catch (error) {
    online.error = error.message;
  } finally {
    resetOnlineMode("Left room. Create or join another room.");
  }
}

async function selectSkin(skinId) {
  const skin = skinForId(skinId);
  if (online.localReady || game.running) {
    setRoomStatus("Unready before changing skin.", "error");
    return;
  }

  online.skin = skin.id;
  const local = online.enabled ? bundleForRole(online.role).actor : playerOne;
  setActorSkin(local, skin.id);
  updateSkinUi();

  if (!online.enabled || !online.role || !online.roomCode) {
    setRoomStatus(`Skin selected: ${skin.label}.`);
    return;
  }

  try {
    const result = await roomRequest("skin", {
      code: online.roomCode,
      role: online.role,
      skin: skin.id,
      state: serializePlayerState(local)
    });
    handleRoomUpdate(result.room);
    setRoomStatus(`Room ${online.roomCode}: skin selected - ${skin.label}.`);
  } catch (error) {
    online.error = error.message;
    setRoomStatus(`Skin update failed: ${error.message}`, "error");
  }
}

async function recoverOnlineRoom(reason = "reconnect") {
  if (!online.enabled || online.recovering || !online.role || !online.roomCode) return false;
  online.recovering = true;
  try {
    const local = bundleForRole(online.role);
    const result = await roomRequest("recover", {
      code: online.roomCode,
      role: online.role,
      ready: online.localReady,
      started: game.running,
      skin: local.actor.skinId || online.skin,
      state: serializePlayerState(local.actor)
    }, { retries: 2, timeoutMs: 8000 });
    online.enabled = true;
    online.role = result.role || online.role;
    online.roomCode = result.code || online.roomCode;
    handleRoomUpdate(result.room);
    setRoomStatus(`Room ${online.roomCode}: connection restored after ${reason}.`);
    addMessage(`Room ${online.roomCode} connection restored.`);
    return true;
  } catch (error) {
    online.error = error.message;
    return false;
  } finally {
    online.recovering = false;
  }
}

async function syncOnlineRoom() {
  if (!online.enabled || online.pending || online.syncPending || !online.role || !online.roomCode) return;
  online.syncPending = true;
  try {
    const local = bundleForRole(online.role);
    const result = await roomRequest("sync", {
      code: online.roomCode,
      role: online.role,
      skin: local.actor.skinId || online.skin,
      state: serializePlayerState(local.actor)
    });
    handleRoomUpdate(result.room);
    if (game.running) {
      const peerSynced = playerRoles.some((role) => role !== online.role && result.room?.players?.[role]?.state);
      const status = peerSynced
        ? `Room ${online.roomCode}: ${online.role.toUpperCase()} online, squad synced.`
        : `Room ${online.roomCode}: ${online.role.toUpperCase()} online, waiting for squad.`;
      setRoomStatus(status);
    }
  } catch (error) {
    online.requestFailures += 1;
    online.error = error.message;
    const shouldRecover = error.status === 404 || error.status === 403;
    const recovered = shouldRecover ? await recoverOnlineRoom(error.status === 404 ? "room recovery" : "role recovery") : false;
    if (!recovered) {
      const tone = online.requestFailures >= 3 ? "error" : "warn";
      const status = online.requestFailures >= 3
        ? `Room ${online.roomCode}: connection unstable, still retrying.`
        : `Room ${online.roomCode}: reconnecting...`;
      setRoomStatus(status, tone);
    }
  } finally {
    const backoff = online.requestFailures > 0 ? Math.min(online.requestFailures * 0.7, 4.2) : 0;
    online.lastSyncAt = game.time + backoff;
    online.syncPending = false;
  }
}

function updateOnlineRoom(dt) {
  if (!online.enabled || game.ended) return;
  const cadence = document.hidden ? online.hiddenSyncEvery : online.syncEvery;
  if (game.time - online.lastSyncAt >= cadence) {
    void syncOnlineRoom();
  }
}

function getInputState({ keyboardMouse = true, pad = emptyGamepad } = {}) {
  const keyboardMoveX = keyboardMouse ? (keys.get("KeyD") ? 1 : 0) - (keys.get("KeyA") ? 1 : 0) : 0;
  const keyboardMoveY = keyboardMouse ? (keys.get("KeyW") ? 1 : 0) - (keys.get("KeyS") ? 1 : 0) : 0;
  const usingTouchOnly = pad.id.toLowerCase().includes("touch") || pad.id.toLowerCase().includes("on-screen");
  const settings = usingTouchOnly ? defaultControllerSettings : controllerSettings;
  const leftStickX = (pad.axes[padAxis.leftX] || 0) * (settings.invertMoveX ? -1 : 1);
  const leftStickForward = -(pad.axes[padAxis.leftY] || 0) * (settings.invertMoveY ? -1 : 1);
  const rightStickX = (pad.axes[padAxis.rightX] || 0) * (settings.invertLookX ? -1 : 1);
  const rightStickUp = (pad.axes[padAxis.rightY] || 0) * (settings.invertLookY ? -1 : 1);
  const moveX = keyboardMoveX + leftStickX;
  const moveY = keyboardMoveY + leftStickForward;
  const lookX = rightStickX * 2.6 * settings.lookSensitivity;
  const lookY = rightStickUp * 2.15 * settings.lookSensitivity;

  return {
    keyboardMouse,
    gamepadConnected: pad.connected,
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    lookX,
    lookY,
    fire: (keyboardMouse && mouse.fire) || controllerManager.attack(pad),
    ads: (keyboardMouse && mouse.ads) || controllerManager.isPressed("ads", pad, 0.18),
    sprint: (keyboardMouse && (keys.get("ShiftLeft") || keys.get("ShiftRight"))) || controllerManager.isPressed("sprint", pad, 0.5),
    jump: (keyboardMouse && keys.get("Space")) || controllerManager.jump(pad),
    crouchPressed: (keyboardMouse && (keys.get("ControlLeft") || keys.get("ControlRight"))) || controllerManager.wasPressed("crouch", pad),
    reload: (keyboardMouse && keys.get("KeyR")) || controllerManager.wasPressed("reload", pad),
    interact: (keyboardMouse && keys.get("KeyE")) || controllerManager.interact(pad),
    switchWeapon: (keyboardMouse && keys.get("Digit2")) || controllerManager.wasPressed("switchWeapon", pad),
    tactical: (keyboardMouse && keys.get("KeyG")) || controllerManager.wasPressed("tactical", pad),
    lethal: (keyboardMouse && keys.get("KeyH")) || controllerManager.wasPressed("lethal", pad),
    leanLeft: (keyboardMouse && keys.get("KeyQ")) || (settings.shoulderLean && controllerManager.isPressed("tactical", pad, 0.4)),
    leanRight: (keyboardMouse && keys.get("KeyE")) || (settings.shoulderLean && controllerManager.isPressed("lethal", pad, 0.4)),
    toggleFireMode: (keyboardMouse && keys.get("KeyV")) || controllerManager.wasPressed("fireMode", pad),
    toggleFlashlight: keyboardMouse && keys.get("KeyF"),
    useArmor: (keyboardMouse && keys.get("Digit4")) || controllerManager.wasPressed("armor", pad),
    nightVision: (keyboardMouse && keys.get("KeyN")) || controllerManager.wasPressed("nightVision", pad),
    killstreak: (keyboardMouse && keys.get("Digit3")) || controllerManager.wasPressed("streak", pad),
    tacticalMap: controllerManager.wasPressed("tacticalMap", pad),
    ping: (keyboardMouse && keys.get("KeyX")) || controllerManager.wasPressed("ping", pad),
    proneToggle: keyboardMouse && keys.get("KeyZ"),
    melee: (keyboardMouse && keys.get("KeyB")) || controllerManager.wasPressed("melee", pad)
  };
}

function updateLook(input, dt) {
  if ((input.keyboardMouse && document.pointerLockElement === renderer.domElement) || input.gamepadConnected) {
    const adsMultiplier = player.ads ? 0.58 : 1;
    player.yaw -= input.lookX * dt * adsMultiplier;
    player.pitch += input.lookY * dt * adsMultiplier;
  }

  player.recoil = Math.max(0, player.recoil - dt * 2.8);
  player.recoilSide *= Math.pow(0.02, dt);
  player.pitch = clamp(player.pitch + player.recoil * dt * 1.8, -1.35, 1.25);

  const leanSpeed = 10;
  const leanInput = (input.leanRight ? -1 : 0) + (input.leanLeft ? 1 : 0);
  player.targetLean = leanInput * 0.26;
  player.lean += (player.targetLean - player.lean) * clamp(dt * leanSpeed, 0, 1);

  camera.rotation.y = player.yaw + player.recoilSide * 0.012;
  camera.rotation.x = player.pitch;
  camera.rotation.z = player.lean;
}

function setStance(stance) {
  if (player.slideTimer > 0) return;
  player.stance = stance;
  if (stance === "stand") player.targetHeight = 1.82;
  if (stance === "crouch") player.targetHeight = 1.18;
  if (stance === "prone") player.targetHeight = 0.54;
}

function handleStanceInput(input, dt) {
  if (controllerManager.wasPressed("crouch", activeGamepad)) {
    activeGamepad.secondaryHoldAt = game.time;
    activeGamepad.secondaryLongHandled = false;
  }
  if (controllerManager.isPressed("crouch", activeGamepad, 0.4) && activeGamepad.secondaryHoldAt !== null && !activeGamepad.secondaryLongHandled) {
    if (game.time - activeGamepad.secondaryHoldAt > 0.42) {
      setStance(player.stance === "prone" ? "stand" : "prone");
      activeGamepad.secondaryLongHandled = true;
    }
  }
  if (!controllerManager.isPressed("crouch", activeGamepad, 0.4) && activeGamepad.secondaryHoldAt !== null) {
    if (!activeGamepad.secondaryLongHandled && game.time - activeGamepad.secondaryHoldAt < 0.42) {
      if (player.sprinting && player.stamina > 16) startSlide();
      else setStance(player.stance === "crouch" ? "stand" : "crouch");
    }
    activeGamepad.secondaryHoldAt = null;
  }

  if (input.keyboardMouse && keys.get("KeyC")) {
    if (!player.keyCHandled) {
      if (player.sprinting && player.stamina > 16) startSlide();
      else setStance(player.stance === "crouch" ? "stand" : "crouch");
      player.keyCHandled = true;
    }
  } else {
    player.keyCHandled = false;
  }

  if (input.keyboardMouse && keys.get("KeyZ")) {
    if (!player.keyZHandled) {
      setStance(player.stance === "prone" ? "stand" : "prone");
      player.keyZHandled = true;
    }
  } else {
    player.keyZHandled = false;
  }

  if (input.keyboardMouse && (keys.get("ControlLeft") || keys.get("ControlRight")) && player.sprinting && player.stamina > 16) {
    startSlide();
  }

  player.height += (player.targetHeight - player.height) * clamp(dt * 12, 0, 1);
}

function startSlide() {
  if (player.slideTimer > 0 || !player.grounded) return;
  const forward = getForward();
  player.slideTimer = 0.72;
  player.slideVelocity.copy(forward).multiplyScalar(13.4);
  player.targetHeight = 0.82;
  player.stance = "slide";
  player.stamina = Math.max(0, player.stamina - 14);
  addMessage("Slide entry. Weapon stability reduced.");
}

function checkMantle() {
  const forward = getForward();
  const probe = player.feet.clone().addScaledVector(forward, 1.35);
  for (const collider of colliders) {
    if (
      probe.x > collider.min.x - 0.22 &&
      probe.x < collider.max.x + 0.22 &&
      probe.z > collider.min.z - 0.22 &&
      probe.z < collider.max.z + 0.22 &&
      collider.height <= 2.25
    ) {
      player.feet.addScaledVector(forward, 2.2);
      player.verticalVelocity = 2.2;
      player.stamina = Math.max(0, player.stamina - 8);
      addMessage(collider.height < 1.2 ? "Vaulted low cover." : "Mantled field obstacle.");
      return true;
    }
  }
  return false;
}

function updateMovement(input, dt) {
  const forward = getForward();
  const right = getRight();
  const move = new THREE.Vector3();
  move.addScaledVector(right, input.moveX);
  move.addScaledVector(forward, input.moveY);
  if (move.lengthSq() > 1) move.normalize();

  if (controllerManager.wasPressed("sprint", activeGamepad)) {
    if (game.time - activeGamepad.lastSprintTap < 0.38) {
      player.tacticalUntil = game.time + 1.35;
      addMessage("Tactical sprint engaged.");
    }
    activeGamepad.lastSprintTap = game.time;
  }

  const shiftPressed = input.keyboardMouse && (keys.get("ShiftLeft") || keys.get("ShiftRight"));
  if (shiftPressed && !player.shiftWasDown) {
    if (game.time - player.lastShiftTap < 0.38) {
      player.tacticalUntil = game.time + 1.35;
      addMessage("Tactical sprint engaged.");
    }
    player.lastShiftTap = game.time;
  }
  player.shiftWasDown = shiftPressed;

  player.ads = input.ads && player.slideTimer <= 0;
  const movingForward = input.moveY > 0.25;
  const tactical = game.time < player.tacticalUntil && player.stamina > 2 && movingForward && !player.ads && player.stance === "stand";
  player.sprinting = input.sprint && movingForward && player.stamina > 1 && !player.ads && player.stance === "stand";

  let speed = 5.9;
  if (player.ads) speed = 3.0;
  if (player.stance === "crouch") speed = 3.1;
  if (player.stance === "prone") speed = 1.35;
  if (player.sprinting) speed = 8.6;
  if (tactical) speed = 11.2;

  if (player.slideTimer > 0) {
    player.slideTimer -= dt;
    const slideDelta = player.slideVelocity.clone().multiplyScalar(dt);
    moveWithCollisions(player.feet, slideDelta, 0.42);
    player.slideVelocity.multiplyScalar(Math.pow(0.08, dt));
    if (player.slideTimer <= 0) {
      setStance("crouch");
    }
  } else {
    const delta = move.multiplyScalar(speed * dt);
    moveWithCollisions(player.feet, delta, 0.42);
  }

  if (input.jump && !player.jumpHeld) {
    if (player.grounded) {
      if (!checkMantle()) {
        player.verticalVelocity = player.stance === "prone" ? 3.2 : 5.6;
        player.grounded = false;
        player.stamina = Math.max(0, player.stamina - 5);
        if (player.stance === "prone") setStance("crouch");
      }
    }
  }
  player.jumpHeld = input.jump;

  player.verticalVelocity -= 16.5 * dt;
  player.feet.y += player.verticalVelocity * dt;
  if (player.feet.y <= 0) {
    player.feet.y = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
  }

  const staminaDrain = tactical ? 23 : player.sprinting ? 12 : 0;
  if (staminaDrain > 0 && move.lengthSq() > 0.01) {
    player.stamina = Math.max(0, player.stamina - staminaDrain * dt);
  } else if (player.slideTimer <= 0) {
    player.stamina = Math.min(100, player.stamina + (player.stance === "prone" ? 16 : 11) * dt);
  }

  camera.position.set(player.feet.x, player.feet.y + player.height, player.feet.z);

  const bobSpeed = player.sprinting || tactical ? 14 : player.ads ? 4.4 : 8.4;
  const bobAmount = player.ads ? 0.006 : player.sprinting ? 0.035 : 0.02;
  const moving = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.1 && player.grounded;
  const bob = moving ? Math.sin(game.time * bobSpeed) * bobAmount : 0;
  camera.position.y += bob;
}

function reloadWeapon() {
  if (player.infiniteAmmo) {
    player.ammo = activeWeaponConfig().magSize;
    addMessage("Infinite ammo feed ready.");
    playTone("reload");
    return;
  }
  if (player.reloading || player.ammo === player.magSize || player.reserve <= 0) return;
  player.reloading = true;
  player.reloadTimer = player.ammo === 0 ? 2.15 : 1.48;
  addMessage(player.ammo === 0 ? "Empty reload." : "Tactical reload.");
  playTone("reload");
}

function getAimWorldPoint(maxDistance = 22) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  raycaster.set(camera.position, direction);
  raycaster.far = maxDistance;
  const hits = raycaster.intersectObjects(solidMeshes, false);
  raycaster.far = 160;
  if (hits.length > 0) return hits[0].point.clone();

  if (direction.y < -0.08) {
    const groundT = clamp(camera.position.y / -direction.y, 4, maxDistance);
    return camera.position.clone().addScaledVector(direction, groundT).setY(0.08);
  }

  const point = camera.position.clone().addScaledVector(direction, maxDistance);
  point.y = Math.max(0.08, Math.min(point.y, 2.2));
  return point;
}

function addTemporarySmokeColumn(position, count = 9, life = 8.5) {
  for (let i = 0; i < count; i += 1) {
    const smoke = new THREE.Mesh(shared.geometries.sphere, shared.materials.smoke.clone());
    smoke.position.set(
      position.x + randomRange(i * 31 + game.time * 9, -1.6, 1.6),
      position.y + 0.5 + i * 0.46,
      position.z + randomRange(i * 43 + game.time * 11, -1.6, 1.6)
    );
    const s = 1.65 + i * 0.18;
    smoke.scale.set(s, s * 0.62, s);
    scene.add(smoke);
    particles.push({
      mesh: smoke,
      type: "smoke",
      age: 0,
      life,
      baseY: smoke.position.y
    });
  }
}

function throwTacticalSmoke() {
  if (player.tacticalCooldown > 0 || player.downed) {
    addMessage("Tactical smoke recharging.");
    return;
  }
  const impact = getAimWorldPoint(18);
  addTemporarySmokeColumn(impact, 12, 9.5);
  spawnImpact(impact);
  player.tacticalCooldown = 8.5;
  player.jammerUntil = Math.max(player.jammerUntil, game.time + 4.5);
  pulseGamepad(activeGamepad, 0.12, 0.22, 75);
  playTone("objective");
  addMessage(`${promptNameForAction("tactical")} tactical smoke deployed. Enemy aim disrupted.`);
}

function detonateFrag(position) {
  const radius = 7.2;
  const blast = new THREE.Mesh(
    shared.geometries.sphere,
    new THREE.MeshBasicMaterial({
      color: 0xff9d45,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  blast.position.copy(position).add(new THREE.Vector3(0, 0.65, 0));
  blast.scale.set(1.2, 1.2, 1.2);
  scene.add(blast);
  particles.push({ mesh: blast, type: "impact", age: 0, life: 0.42 });

  addTemporarySmokeColumn(position, 6, 5.2);
  spawnImpact(position);
  let hits = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const distance = enemy.group.position.distanceTo(position);
    if (distance > radius) continue;
    const damage = 120 * (1 - distance / radius) + 34;
    damageEnemy(enemy, damage, false, "frag");
    hits += 1;
  }
  pulseGamepad(activeGamepad, 0.22, 0.5, 130);
  playTone("objective");
  addMessage(hits ? `${promptNameForAction("lethal")} frag blast hit ${hits} hostile${hits === 1 ? "" : "s"}.` : `${promptNameForAction("lethal")} frag detonated.`);
}

function throwLethalFrag() {
  if (player.lethalCooldown > 0 || player.downed) {
    addMessage("Lethal frag recharging.");
    return;
  }
  const impact = getAimWorldPoint(22);
  player.lethalCooldown = 10.5;
  window.setTimeout(() => {
    if (!game.ended) detonateFrag(impact);
  }, 520);
  pulseGamepad(activeGamepad, 0.08, 0.18, 55);
  addMessage(`${promptNameForAction("lethal")} frag thrown.`);
}

function switchWeaponSlot() {
  const nextSlot = player.weaponSlot === "rifle" ? "sidearm" : "rifle";
  const config = weaponConfigs[nextSlot];
  player.weaponSlot = nextSlot;
  player.magSize = config.magSize;
  player.ammo = config.magSize;
  player.fireMode = nextSlot === "sidearm" ? "SEMI" : player.fireMode;
  player.reloading = false;
  player.fireTimer = Math.max(player.fireTimer, 0.12);
  addMessage(`${promptNameForAction("switchWeapon")} switched to ${config.label}.`);
}

function activateKillstreak() {
  if (player.streakCooldown > 0) {
    addMessage("D-pad right streak recharging.");
    return;
  }
  player.streakCooldown = 18;
  player.jammerUntil = Math.max(player.jammerUntil, game.time + 8.5);
  const nearest = enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => ({ enemy, distance: enemy.group.position.distanceToSquared(player.feet) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
  for (const item of nearest) {
    item.enemy.state = "search";
    item.enemy.lastSeen = player.feet.clone();
  }
  pulseGamepad(activeGamepad, 0.16, 0.28, 95);
  playTone("objective");
  addMessage(`D-pad right recon streak disrupted ${nearest.length} nearest hostile${nearest.length === 1 ? "" : "s"}.`);
}

function toggleNightVision() {
  player.nightVision = !player.nightVision;
  renderer.toneMappingExposure = player.nightVision ? 1.55 : 1.05;
  addMessage(`D-pad down night vision ${player.nightVision ? "on" : "off"}.`);
}

function openTacticalMap() {
  const completedPrimary = objectives.filter((objective) => !objective.extraction && objective.complete).length;
  const next = objectives.find((objective) => !objective.extraction && !objective.complete) || objectives[3];
  const range = next ? Math.round(next.position.distanceTo(player.feet)) : 0;
  addMessage(`View/Touchpad tac map: ${completedPrimary}/3 complete, next ${next?.label || "extract"} ${range}m.`);
}

function findGunMeleeTarget(range = 3.85) {
  const origin = camera.position.clone();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y *= 0.55;
  forward.normalize();

  let best = null;
  let bestScore = -Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const point = enemy.group.position.clone().add(new THREE.Vector3(0, enemy.targetHeight || 1.22, 0));
    const toEnemy = point.clone().sub(origin);
    const distance = toEnemy.length();
    const effectiveRange = enemy.boss ? range + 2.4 : range;
    if (distance > effectiveRange) continue;

    const direction = toEnemy.clone().normalize();
    const aimDot = direction.dot(forward);
    if (aimDot < 0.58) continue;

    raycaster.set(origin, direction);
    raycaster.far = distance;
    const blockers = raycaster.intersectObjects(solidMeshes, false);
    raycaster.far = 160;
    if (blockers.length > 0) continue;

    const score = aimDot * 2 - distance * 0.22;
    if (score > bestScore) {
      bestScore = score;
      best = { enemy, point, direction, distance };
    }
  }
  return best;
}

function startGunMelee() {
  if (!game.running || player.downed || player.meleeCooldown > 0 || player.slideTimer > 0) return;

  player.ads = false;
  player.reloading = false;
  player.meleeTimer = player.meleeDuration;
  player.meleeCooldown = 0.78;
  player.stamina = Math.max(0, player.stamina - 8);
  player.recoil += 0.08;
  player.recoilSide += randomRange(Math.floor(game.time * 9011), -0.32, 0.32);
  pulseGamepad(activeGamepad, 0.18, 0.42, 90);

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const start = camera.position.clone().addScaledVector(direction, 0.35);
  const target = findGunMeleeTarget();

  if (target) {
    const criticalDamage = 180;
    target.enemy.group.position.addScaledVector(target.direction, 0.85);
    target.enemy.state = "retreat";
    target.enemy.stuckTimer = 0;
    spawnImpact(target.point);
    spawnTracer(start, target.point, 0xffd08a);
    damageEnemy(target.enemy, criticalDamage, true, "melee");
    showHitMarker();
    if (target.enemy.alive) addMessage("Critical gun bash landed.");
    return;
  }

  raycaster.set(start, direction);
  raycaster.far = 2.35;
  const hits = raycaster.intersectObjects(solidMeshes, false);
  raycaster.far = 160;
  if (hits.length > 0) {
    spawnImpact(hits[0].point);
    spawnTracer(start, hits[0].point, 0xffd08a);
    addMessage("Gun bash struck cover.");
  } else {
    spawnTracer(start, start.clone().addScaledVector(direction, 2.1), 0xffd08a);
    addMessage("Gun bash missed.");
  }
  playTone("empty");
}

function updateWeapon(input, dt) {
  player.meleeTimer = Math.max(0, player.meleeTimer - dt);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  player.tacticalCooldown = Math.max(0, player.tacticalCooldown - dt);
  player.lethalCooldown = Math.max(0, player.lethalCooldown - dt);
  player.streakCooldown = Math.max(0, player.streakCooldown - dt);

  if (input.switchWeapon && !player.switchHeld) switchWeaponSlot();
  player.switchHeld = input.switchWeapon;

  if (input.tactical && !player.tacticalHeld) throwTacticalSmoke();
  player.tacticalHeld = input.tactical;

  if (input.lethal && !player.lethalHeld) throwLethalFrag();
  player.lethalHeld = input.lethal;

  if (input.killstreak && !player.streakHeld) activateKillstreak();
  player.streakHeld = input.killstreak;

  if (input.tacticalMap && !player.mapHeld) openTacticalMap();
  player.mapHeld = input.tacticalMap;

  const armorQuickSlot = input.useArmor && player.armor < 50;
  if (input.nightVision && !player.nightVisionHeld && !armorQuickSlot) toggleNightVision();
  player.nightVisionHeld = input.nightVision;

  if (input.melee && !player.meleeHeld) {
    startGunMelee();
  }
  player.meleeHeld = input.melee;

  if (input.reload && !player.reloadHeld) reloadWeapon();
  player.reloadHeld = input.reload;

  if (input.toggleFireMode && !player.fireModeHeld) {
    if (player.weaponSlot === "sidearm") {
      player.fireMode = "SEMI";
      addMessage("Sidearm stays semi-auto.");
    } else {
      player.fireMode = player.fireMode === "AUTO" ? "SEMI" : "AUTO";
      addMessage(`D-pad left fire mode: ${player.fireMode}.`);
    }
  }
  player.fireModeHeld = input.toggleFireMode;

  if (input.toggleFlashlight && !player.flashHeld) {
    player.flashlight = !player.flashlight;
    addMessage(`Weapon light ${player.flashlight ? "on" : "off"}.`);
  }
  player.flashHeld = input.toggleFlashlight;

  if (input.useArmor && !player.armorHeld) {
    if (player.armor < 50) {
      player.armor = Math.min(50, player.armor + 25);
      addMessage("Armor plate inserted.");
    } else if (!input.nightVision) {
      addMessage("Armor already full.");
    }
  }
  player.armorHeld = input.useArmor;

  if (input.ping && !player.pingHeld) {
    addMessage("Ping placed on nearest objective.");
  }
  player.pingHeld = input.ping;

  if (player.reloading) {
    player.reloadTimer -= dt;
    const reloadLift = Math.sin((1 - player.reloadTimer / 1.5) * Math.PI);
    player.weaponGroup.position.y = -0.36 - reloadLift * 0.08;
    player.weaponGroup.rotation.x = -0.06 + reloadLift * 0.28;
    if (player.reloadTimer <= 0) {
      const needed = player.magSize - player.ammo;
      const loaded = Math.min(needed, player.reserve);
      player.ammo += loaded;
      player.reserve -= loaded;
      player.reloading = false;
      addMessage("Weapon ready.");
    }
    return;
  }

  player.weaponGroup.position.x = THREE.MathUtils.lerp(player.weaponGroup.position.x, player.ads ? 0.02 : 0.38, dt * 11);
  player.weaponGroup.position.y = THREE.MathUtils.lerp(player.weaponGroup.position.y, player.ads ? -0.22 : -0.36, dt * 11);
  player.weaponGroup.position.z = THREE.MathUtils.lerp(player.weaponGroup.position.z, player.ads ? -0.52 : -0.68, dt * 11);
  player.weaponGroup.rotation.x = THREE.MathUtils.lerp(player.weaponGroup.rotation.x, player.ads ? -0.02 : -0.06, dt * 11);
  player.weaponGroup.rotation.y = THREE.MathUtils.lerp(player.weaponGroup.rotation.y, player.ads ? 0 : -0.04, dt * 11);
  player.weaponGroup.rotation.z = THREE.MathUtils.lerp(player.weaponGroup.rotation.z, 0, dt * 11);

  player.muzzleLight.intensity = Math.max(0, player.muzzleLight.intensity - dt * 80);
  player.muzzleMesh.material.opacity = Math.max(0, player.muzzleMesh.material.opacity - dt * 20);

  if (player.meleeTimer > 0) {
    const progress = 1 - player.meleeTimer / player.meleeDuration;
    const windup = smoothstep(0, 0.36, progress);
    const strike = Math.sin(Math.PI * clamp((progress - 0.14) / 0.72, 0, 1));
    const recover = smoothstep(0.62, 1, progress);
    player.weaponGroup.position.x = 0.2 + strike * 0.18 - recover * 0.08;
    player.weaponGroup.position.y = -0.31 + windup * 0.12 - strike * 0.2;
    player.weaponGroup.position.z = -0.58 - strike * 0.42;
    player.weaponGroup.rotation.x = -0.12 - strike * 0.86 + recover * 0.16;
    player.weaponGroup.rotation.y = -0.18 + strike * 0.42;
    player.weaponGroup.rotation.z = strike * 0.3;
    player.fireHeld = input.fire;
    return;
  }

  player.fireTimer -= dt;
  const config = activeWeaponConfig();
  let fireInterval = player.fireMode === "AUTO" && player.weaponSlot === "rifle"
    ? config.autoInterval
    : config.semiInterval;
  if (game.time < player.overdriveUntil) fireInterval *= 0.55;
  const wantsShot = input.fire && (player.fireMode === "AUTO" && player.weaponSlot === "rifle" || !player.fireHeld);
  if (wantsShot && player.fireTimer <= 0) {
    fireRifle();
    player.fireTimer = fireInterval;
  }
  player.fireHeld = input.fire;
}

function removeFromArray(array, item) {
  const index = array.indexOf(item);
  if (index >= 0) array.splice(index, 1);
}

function destroyRewardBox(rewardBox, hitPoint, hitNormal = new THREE.Vector3(0, 1, 0)) {
  if (!rewardBox || rewardBox.destroyed) return;
  rewardBox.destroyed = true;
  game.rewardBoxesDestroyed += 1;

  spawnImpact(hitPoint, hitNormal);
  showHitMarker();
  playTone("hit");
  pulseGamepad(activeGamepad, 0.12, 0.24, 75);

  scene.remove(rewardBox.mesh);
  removeFromArray(solidMeshes, rewardBox.mesh);
  for (let i = colliders.length - 1; i >= 0; i -= 1) {
    if (colliders[i].mesh === rewardBox.mesh) colliders.splice(i, 1);
  }

  playRewardSong(rewardBox.index);
  if (game.rewardBoxesDestroyed >= rewardBoxes.length) {
    addMessage("All 20 song boxes destroyed.");
  }
}

function fireRifle() {
  if (!game.running || player.downed || player.reloading) return;
  const config = activeWeaponConfig();
  if (!player.infiniteAmmo && player.ammo <= 0) {
    playTone("empty");
    player.fireTimer = 0.24;
    return;
  }

  if (player.infiniteAmmo) {
    player.ammo = config.magSize;
  } else {
    player.ammo -= 1;
  }
  player.lastShotAt = game.time;
  const overdriveRecoil = game.time < player.overdriveUntil ? 0.55 : 1;
  player.recoil += (player.ads ? config.recoilAds : config.recoilHip) * overdriveRecoil;
  player.recoilSide += randomRange(Math.floor(game.time * 10000), -0.5, 0.5) * overdriveRecoil;
  player.muzzleLight.intensity = 18;
  player.muzzleMesh.material.opacity = 1;
  playTone("shot");
  pulseGamepad(activeGamepad, 0.08, 0.18, 45);

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const movingSpread = player.sprinting || player.slideTimer > 0 ? 0.045 : player.stance === "prone" ? 0.008 : 0.02;
  const spread = player.ads ? movingSpread * config.spreadAdsMultiplier : movingSpread;
  direction
    .addScaledVector(right, randomRange(Math.floor(game.time * 2123), -spread, spread))
    .addScaledVector(up, randomRange(Math.floor(game.time * 3899), -spread, spread))
    .normalize();

  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects([...enemyHitMeshes, ...solidMeshes], false);
  let endpoint = camera.position.clone().addScaledVector(direction, 110);
  for (const hit of hits) {
    endpoint = hit.point.clone();
    if (hit.object.userData.rewardBox) {
      destroyRewardBox(hit.object.userData.rewardBox, hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
    } else if (hit.object.userData.enemy && hit.object.userData.enemy.alive) {
      const enemy = hit.object.userData.enemy;
      const spriteHeadshot = hit.object === enemy.sprite && hit.uv && hit.uv.y > 0.68;
      const headshot = hit.object === enemy.head || spriteHeadshot;
      damageEnemy(
        enemy,
        headshot ? config.headshotDamage : randomRange(Math.floor(game.time * 503), config.damageMin, config.damageMax),
        headshot,
        player.weaponSlot
      );
      showHitMarker();
    } else {
      spawnImpact(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0));
    }
    break;
  }
  spawnTracer(camera.position.clone(), endpoint, config.tracer);
}

function damageEnemy(enemy, damage, headshot = false, source = "rifle") {
  enemy.health -= damage;
  enemy.state = "alert";
  enemy.lastSeen = player.feet.clone();
  if (enemy.health <= 0 && enemy.alive) {
    enemy.alive = false;
    game.hostilesAlive -= 1;
    player.kills += 1;
    collapseEnemy(enemy);
    playTone("kill");
    if (enemy.boss) {
      game.bossPhase = "defeated";
      game.bossDefeated = true;
      game.objectiveMessage = "Korsak defeated. Opening victory video.";
      addMessage("Korsak down. Victory video opening.");
      scheduleVictoryRedirect();
      return;
    }
    const label = source === "melee"
      ? "Critical melee takedown"
      : source === "frag"
        ? "Frag neutralized hostile"
        : headshot
          ? "Precision hit"
          : "Hostile neutralized";
    addMessage(`${label} - ${game.hostilesAlive} remaining.`);
    if (game.hostilesAlive === 0) {
      startFinalBossSequence();
    }
  } else {
    playTone("hit");
  }
}

function setBossCutsceneVisible(visible) {
  if (!ui.bossCutscene) return;
  if (visible) {
    ui.bossCutscene.hidden = false;
    ui.bossCutscene.classList.add("visible");
    return;
  }
  ui.bossCutscene.classList.remove("visible");
  window.setTimeout(() => {
    if (!ui.bossCutscene.classList.contains("visible")) ui.bossCutscene.hidden = true;
  }, 420);
}

function startFinalBossSequence() {
  if (game.bossPhase !== "idle" || game.bossSpawned || game.bossDefeated) return;
  game.bossPhase = "cutscene";
  game.bossIntroUntil = game.time + finalBossIntroDuration;
  game.objectiveMessage = "Korsak inbound. Commander-class final boss detected.";
  setBossCutsceneVisible(true);
  addMessage("All 100 hostiles down. Korsak is entering the battlespace.");
  playTone("objective");
}

function createBossPlane() {
  const group = new THREE.Group();

  const fuselage = new THREE.Mesh(shared.geometries.box, shared.materials.bossPlane);
  fuselage.scale.set(5.8, 1.05, 1.22);
  group.add(fuselage);

  const nose = new THREE.Mesh(shared.geometries.cone, shared.materials.metalDark);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 3.4;
  nose.scale.set(0.86, 1.45, 0.86);
  group.add(nose);

  const wing = new THREE.Mesh(shared.geometries.box, shared.materials.metalGreen);
  wing.scale.set(2.1, 0.14, 8.5);
  wing.position.x = -0.35;
  group.add(wing);

  const tail = new THREE.Mesh(shared.geometries.box, shared.materials.metalDark);
  tail.scale.set(1.0, 1.6, 0.18);
  tail.position.set(-3.1, 0.98, 0);
  group.add(tail);

  const engineA = new THREE.Mesh(shared.geometries.cylinder, shared.materials.black);
  engineA.rotation.z = Math.PI / 2;
  engineA.position.set(0.55, -0.42, -2.9);
  engineA.scale.set(0.34, 0.9, 0.34);
  group.add(engineA);

  const engineB = engineA.clone();
  engineB.position.z = 2.9;
  group.add(engineB);

  const glow = new THREE.PointLight(0xff8a28, 2.4, 18, 2);
  glow.position.set(-3.4, 0, 0);
  group.add(glow);

  group.userData.from = new THREE.Vector3(-86, 23, -78);
  group.userData.to = new THREE.Vector3(-12, 0.78, -30);
  group.userData.nextSmokeAt = 0;
  group.position.copy(group.userData.from);
  group.rotation.set(-0.1, -0.76, 0.18);
  scene.add(group);
  return group;
}

function beginBossCrash() {
  if (game.bossPhase !== "cutscene") return;
  setBossCutsceneVisible(false);
  game.bossPhase = "crash";
  game.bossCrashStartedAt = game.time;
  game.bossPlane = createBossPlane();
  game.objectiveMessage = "Korsak crash landing. Keep distance from impact.";
  addMessage("Incoming aircraft. Korsak is crash landing near the depot.");
  playTone("objective");
}

function spawnFinalBoss() {
  if (game.bossSpawned) return;
  game.bossSpawned = true;
  game.bossPhase = "fight";
  game.hostilesAlive = 1;
  game.totalHostiles += 1;
  const boss = createEnemy("finalBoss", new THREE.Vector3(-12, 0, -30), game.spawnSeed + 9001);
  boss.state = "advance";
  boss.lastSeen = nearestPlayerTarget(boss.group.position).actor.feet.clone();
  boss.fireTimer = 1.05;
  boss.aimYaw = Math.PI;
  game.objectiveMessage = "Final boss: Korsak. Break line of sight and shoot the full sprite.";
  addMessage("Korsak has exited the wreck. Final boss active.");
  playTone("objective");
}

function updateFinalBossSequence(dt) {
  if (game.bossPhase === "cutscene" && game.time >= game.bossIntroUntil) {
    beginBossCrash();
  }

  if (game.bossPhase !== "crash" || !game.bossPlane) return;

  const elapsed = game.time - game.bossCrashStartedAt;
  const progress = clamp(elapsed / finalBossCrashDuration, 0, 1);
  const eased = 1 - (1 - progress) ** 2.2;
  const from = game.bossPlane.userData.from;
  const to = game.bossPlane.userData.to;
  game.bossPlane.position.lerpVectors(from, to, eased);
  game.bossPlane.position.y += Math.sin(progress * Math.PI) * 2.8;
  game.bossPlane.rotation.y = -0.76 + progress * 0.72;
  game.bossPlane.rotation.z = 0.18 - progress * 0.64;
  game.bossPlane.rotation.x = -0.1 - progress * 0.48;

  if (game.time >= game.bossPlane.userData.nextSmokeAt) {
    game.bossPlane.userData.nextSmokeAt = game.time + 0.18;
    const smoke = new THREE.Mesh(shared.geometries.sphere, shared.materials.smoke.clone());
    smoke.position.copy(game.bossPlane.position).add(new THREE.Vector3(randomRange(elapsed * 31, -1.8, 1.8), -0.2, randomRange(elapsed * 47, -1.8, 1.8)));
    smoke.scale.set(1.4, 0.72, 1.4);
    scene.add(smoke);
    particles.push({ mesh: smoke, type: "smoke", age: 0, life: 2.2, baseY: smoke.position.y });
  }

  if (progress >= 1) {
    const impact = game.bossPlane.userData.to.clone();
    scene.remove(game.bossPlane);
    game.bossPlane = null;
    spawnImpact(impact.clone().add(new THREE.Vector3(0, 0.45, 0)));
    addTemporarySmokeColumn(impact, 18, 10.5);
    spawnFinalBoss();
  }
}

function scheduleVictoryRedirect() {
  if (game.victoryRedirectScheduled) return;
  game.victoryRedirectScheduled = true;
  game.running = false;
  game.ended = true;
  updateTouchControlVisibility();
  window.setTimeout(() => {
    window.location.href = victoryRedirectUrl;
  }, 1800);
}

function collapseEnemy(enemy) {
  const yaw = enemy.group.rotation.y;
  if (enemy.boss) {
    enemy.group.position.y = 0.18;
    enemy.group.rotation.set(Math.PI / 2, yaw, randomRange(enemy.seed, -0.3, 0.3));
    enemy.group.scale.set(1.04, 0.92, 1.04);
    enemy.spriteMaterial.map = shared.bossSpriteTextures.down;
    enemy.spriteMaterial.color.set(0x7286a0);
    enemy.spriteMaterial.opacity = 0.88;
    enemy.spriteMaterial.needsUpdate = true;
    enemy.sprite.position.copy(enemy.group.position).add(new THREE.Vector3(0, -0.12, 0));
    enemy.sprite.rotation.set(-Math.PI / 2, 0, yaw + randomRange(enemy.seed + 3, -0.35, 0.35));
    enemy.sprite.scale.set(finalBossWidth * 1.55, finalBossHeight * 0.42, 1);
    return;
  }
  enemy.group.position.y = 0.22;
  enemy.group.rotation.set(Math.PI / 2, yaw, randomRange(enemy.seed, -0.45, 0.45));
  enemy.group.scale.set(1.05, 0.92, 1.05);
  enemy.spriteMaterial.map = shared.enemySpriteTextures[0];
  enemy.spriteMaterial.color.set(0x6f6a62);
  enemy.spriteMaterial.opacity = 0.78;
  enemy.spriteMaterial.needsUpdate = true;
  enemy.sprite.position.copy(enemy.group.position).add(new THREE.Vector3(0, -0.17, 0));
  enemy.sprite.rotation.set(-Math.PI / 2, 0, yaw + randomRange(enemy.seed + 3, -0.6, 0.6));
  enemy.sprite.scale.set(3.9, 2.78, 1);
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function enemySpriteIndex(enemy, view = camera) {
  const toCameraYaw = Math.atan2(
    view.position.x - enemy.group.position.x,
    view.position.z - enemy.group.position.z
  );
  const relativeYaw = normalizeAngle(toCameraYaw - enemy.aimYaw);
  const sector = Math.round(relativeYaw / (Math.PI / 4));
  return (sector + 8) % 8;
}

function updateEnemyVisual(enemy, view = camera) {
  if (!enemy.alive) return;

  if (enemy.boss) {
    const attacking = game.time < enemy.breathUntil;
    const moving = enemy.state === "advance" || enemy.state === "flank" || enemy.state === "retreat";
    const nextPose = attacking ? "fire" : moving ? "run" : enemy.health < enemy.config.health * 0.38 ? "hit" : "idle";
    const nextMap = shared.bossSpriteTextures[nextPose] || shared.bossSpriteTextures.idle;
    if (enemy.currentSpriteIndex !== nextPose || enemy.spriteMaterial.map !== nextMap) {
      enemy.currentSpriteIndex = nextPose;
      enemy.spriteMaterial.map = nextMap;
      enemy.spriteMaterial.needsUpdate = true;
    }
    const scalePulse = attacking ? 1 + Math.sin(game.time * 28) * 0.025 : 1;
    enemy.sprite.position.copy(enemy.group.position).add(new THREE.Vector3(0, finalBossHeight * 0.5 + (attacking ? 0.16 : 0), 0));
    enemy.sprite.lookAt(view.position.x, enemy.sprite.position.y, view.position.z);
    enemy.sprite.scale.set(finalBossWidth * scalePulse, finalBossHeight * scalePulse, 1);
    return;
  }

  const index = enemySpriteIndex(enemy, view);
  const attacking = game.time < enemy.breathUntil;
  const nextMap = attacking ? shared.enemyAttackTexture : shared.enemySpriteTextures[index];
  if (index !== enemy.currentSpriteIndex || enemy.spriteMaterial.map !== nextMap) {
    enemy.currentSpriteIndex = index;
    enemy.spriteMaterial.map = nextMap;
    enemy.spriteMaterial.needsUpdate = true;
  }

  const lift = attacking ? 1.72 : 1.62;
  enemy.sprite.position.copy(enemy.group.position).add(new THREE.Vector3(0, lift, 0));
  enemy.sprite.lookAt(view.position.x, enemy.sprite.position.y, view.position.z);
  const scalePulse = attacking ? 1 + Math.sin(game.time * 32) * 0.035 : 1;
  const width = enemy.type === "commander" ? 4.15 : 3.72;
  const height = enemy.type === "commander" ? 4.2 : 3.88;
  enemy.sprite.scale.set(width * scalePulse, height * scalePulse, 1);
}

function playerSpritePose(actor, view) {
  const toViewer = view.position.clone().sub(actor.feet);
  toViewer.y = 0;
  if (toViewer.lengthSq() < 0.001) {
    return { pose: 3, mirror: 1 };
  }
  toViewer.normalize();

  const forward = new THREE.Vector3(-Math.sin(actor.yaw), 0, -Math.cos(actor.yaw)).normalize();
  const dot = clamp(forward.dot(toViewer), -1, 1);
  const cross = forward.x * toViewer.z - forward.z * toViewer.x;
  const moving = actor.sprinting || actor.slideTimer > 0 || actor.stance === "crouch";
  const rowOffset = moving ? 4 : 0;
  let pose = 1;

  if (dot > 0.62) {
    pose = 0;
  } else if (dot > 0.16) {
    pose = 2;
  } else if (dot < -0.55) {
    pose = 3;
  }

  return {
    pose: rowOffset + pose,
    mirror: cross < 0 ? -1 : 1
  };
}

function updatePlayerWorldSpritesForView(view, hiddenActor) {
  for (const actor of players) {
    const visual = actor.worldSprite;
    if (!visual) continue;

    const visible = actor !== hiddenActor && isActorActive(actor);
    visual.sprite.visible = visible;
    visual.shadow.visible = visible && !actor.downed;
    if (!visible) continue;

    if (actor.downed) {
      const skin = skinForId(actor.skinId);
      visual.material.map = shared.playerSpriteTextures[skin.textureIndex][3];
      visual.material.opacity = 0.72;
      visual.material.color.set(0x8b8580);
      visual.material.needsUpdate = true;
      visual.sprite.position.copy(actor.feet).add(new THREE.Vector3(0, 0.23, 0));
      visual.sprite.rotation.set(-Math.PI / 2, 0, actor.yaw);
      visual.sprite.scale.set(1.78, 2.15, 1);
      continue;
    }

    const { pose, mirror } = playerSpritePose(actor, view);
    const skin = skinForId(actor.skinId);
    if (pose !== visual.currentPose || skin.textureIndex !== visual.currentTextureIndex) {
      visual.currentPose = pose;
      visual.currentTextureIndex = skin.textureIndex;
      visual.material.map = shared.playerSpriteTextures[skin.textureIndex][pose];
      visual.material.needsUpdate = true;
    }
    visual.material.opacity = 1;
    visual.material.color.set(skin.tint);
    visual.sprite.position.copy(actor.feet).add(new THREE.Vector3(0, actor.height * 0.54 + 0.58, 0));
    visual.sprite.lookAt(view.position.x, visual.sprite.position.y, view.position.z);
    visual.sprite.scale.set(visual.baseWidth * mirror, visual.baseHeight, 1);
    visual.shadow.position.copy(actor.feet).add(new THREE.Vector3(0, 0.035, 0));
  }
}

function distancePointToSegmentSquared(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.0001) return point.distanceToSquared(start);
  const t = clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  const closest = start.clone().addScaledVector(segment, t);
  return point.distanceToSquared(closest);
}

function ballisticVelocity(start, target, speed, gravity) {
  const delta = target.clone().sub(start);
  const flat = new THREE.Vector3(delta.x, 0, delta.z);
  const distance = flat.length();
  if (distance < 0.1) return delta.normalize().multiplyScalar(speed);

  const speedSq = speed * speed;
  const dropTerm = gravity * (gravity * distance * distance + 2 * delta.y * speedSq);
  const discriminant = speedSq * speedSq - dropTerm;
  if (discriminant > 0) {
    const tanTheta = (speedSq - Math.sqrt(discriminant)) / (gravity * distance);
    const horizontalSpeed = speed / Math.sqrt(1 + tanTheta * tanTheta);
    return flat.normalize().multiplyScalar(horizontalSpeed).setY(horizontalSpeed * tanTheta);
  }

  return delta.add(new THREE.Vector3(0, distance * 0.06, 0)).normalize().multiplyScalar(speed);
}

function spawnFireballImpact(point) {
  const material = new THREE.MeshBasicMaterial({
    map: shared.fireballImpactTexture,
    transparent: true,
    alphaTest: 0.04,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(shared.geometries.plane, material);
  mesh.position.copy(point).add(new THREE.Vector3(0, 0.18, 0));
  mesh.scale.set(1.35, 0.82, 1);
  mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
  scene.add(mesh);
  particles.push({ mesh, type: "fireImpact", age: 0, life: 0.34 });
}

function removeFireball(fireball) {
  scene.remove(fireball.group);
  fireball.material.dispose();
}

function spawnEnemyFireball(enemy, target, distance) {
  const forward = new THREE.Vector3(Math.sin(enemy.aimYaw), 0, Math.cos(enemy.aimYaw));
  const start = enemy.group.position.clone()
    .addScaledVector(forward, 0.92)
    .add(new THREE.Vector3(0, 1.46, 0));
  const aimPoint = target.actor.feet.clone().add(new THREE.Vector3(0, target.actor.height * 0.74, 0));
  const jammerPenalty = game.time < target.actor.jammerUntil ? 1.7 : 1;
  const missRadius = clamp((1 - enemy.config.accuracy) * distance * 0.035 * jammerPenalty, 0.18, 2.6);
  const seed = enemy.seed + Math.floor(game.time * 997);
  aimPoint.x += randomRange(seed + 1, -missRadius, missRadius);
  aimPoint.y += randomRange(seed + 2, -missRadius * 0.32, missRadius * 0.48);
  aimPoint.z += randomRange(seed + 3, -missRadius, missRadius);

  const speed = enemy.config.fireballSpeed || fireballBaseSpeed;
  const velocity = ballisticVelocity(start, aimPoint, speed, fireballGravity);
  const material = new THREE.MeshBasicMaterial({
    map: shared.fireballTexture,
    transparent: true,
    alphaTest: 0.04,
    opacity: 0.96,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(shared.geometries.plane, material);
  mesh.scale.set(1.15, 0.72, 1);
  group.add(mesh);
  const light = new THREE.PointLight(0xff8a28, 2.8, 14, 2);
  group.add(light);
  group.position.copy(start);
  scene.add(group);
  fireballs.push({
    group,
    mesh,
    light,
    material,
    position: start.clone(),
    previous: start.clone(),
    velocity,
    damage: enemy.config.damage * 1.35,
    age: 0,
    seed,
    source: enemy
  });
}

function spawnLaserImpact(point) {
  const material = shared.materials.bossLaser.clone();
  material.opacity = 0.86;
  material.depthWrite = false;
  const mesh = new THREE.Mesh(shared.geometries.sphere, material);
  mesh.position.copy(point);
  mesh.scale.setScalar(0.16);
  scene.add(mesh);
  particles.push({ mesh, type: "impact", age: 0, life: 0.24 });
}

function spawnBossLaser(enemy, target, distance) {
  const forward = new THREE.Vector3(Math.sin(enemy.aimYaw), 0, Math.cos(enemy.aimYaw));
  const start = enemy.group.position.clone()
    .addScaledVector(forward, 1.28)
    .add(new THREE.Vector3(0, finalBossHeight * 0.56, 0));
  const aimPoint = target.actor.feet.clone().add(new THREE.Vector3(0, target.actor.height * 0.68, 0));
  const jammerPenalty = game.time < target.actor.jammerUntil ? 1.8 : 1;
  const missRadius = clamp((1 - enemy.config.accuracy) * distance * 0.018 * jammerPenalty, 0.08, 1.5);
  const seed = enemy.seed + Math.floor(game.time * 1361);
  aimPoint.x += randomRange(seed + 1, -missRadius, missRadius);
  aimPoint.y += randomRange(seed + 2, -missRadius * 0.24, missRadius * 0.4);
  aimPoint.z += randomRange(seed + 3, -missRadius, missRadius);

  const direction = aimPoint.clone().sub(start).normalize();
  raycaster.set(start, direction);
  raycaster.far = enemy.config.range;
  const solidHit = raycaster.intersectObjects(solidMeshes, false)[0];
  raycaster.far = 160;
  const endpoint = solidHit ? solidHit.point.clone() : start.clone().addScaledVector(direction, enemy.config.range);
  spawnTracer(start, endpoint, 0x5ae7ff);
  spawnLaserImpact(endpoint);

  const hitActor = activePlayers().find((actor) => {
    if (actor.downed) return false;
    const center = actor.feet.clone().add(new THREE.Vector3(0, actor.height * 0.58, 0));
    return distancePointToSegmentSquared(center, start, endpoint) < 0.58 ** 2;
  });
  if (!hitActor) return;

  setActivePlayer(hitActor, cameraForRole(hitActor.role), padForLocalActor(hitActor));
  damagePlayer(enemy.config.damage);
  if (game.time - (enemy.lastLaserMessageAt || -10) > 1.8) {
    enemy.lastLaserMessageAt = game.time;
    addMessage("Korsak laser hit. Use cover to break the beam.");
  }
}

function updateFireballs(dt) {
  const local = localBundle();
  for (let i = fireballs.length - 1; i >= 0; i -= 1) {
    const fireball = fireballs[i];
    fireball.age += dt;
    fireball.previous.copy(fireball.position);
    fireball.velocity.y -= fireballGravity * dt;
    fireball.velocity.multiplyScalar(Math.pow(0.996, dt * 60));
    fireball.position.addScaledVector(fireball.velocity, dt);
    fireball.group.position.copy(fireball.position);
    fireball.group.lookAt(local.view.position.x, fireball.position.y, local.view.position.z);
    fireball.mesh.rotation.z += dt * 7.5;
    fireball.light.intensity = 2.2 + Math.sin(game.time * 24 + fireball.seed) * 0.55;

    const segment = fireball.position.clone().sub(fireball.previous);
    const length = segment.length();
    if (length > 0.001) {
      raycaster.set(fireball.previous, segment.normalize());
      raycaster.far = length + fireballRadius;
      const solidHit = raycaster.intersectObjects(solidMeshes, false)[0];
      raycaster.far = 160;
      if (solidHit) {
        spawnFireballImpact(solidHit.point);
        removeFireball(fireball);
        fireballs.splice(i, 1);
        continue;
      }
    }

    const hitActor = activePlayers().find((actor) => {
      if (actor.downed) return false;
      const center = actor.feet.clone().add(new THREE.Vector3(0, actor.height * 0.58, 0));
      return distancePointToSegmentSquared(center, fireball.previous, fireball.position) < (fireballRadius + 0.42) ** 2;
    });
    if (hitActor) {
      setActivePlayer(hitActor, cameraForRole(hitActor.role), controlPadOne);
      damagePlayer(fireball.damage);
      spawnFireballImpact(hitActor.feet.clone().add(new THREE.Vector3(0, hitActor.height * 0.55, 0)));
      addMessage("Dragon fireball impact. Keep moving to dodge the arc.");
      removeFireball(fireball);
      fireballs.splice(i, 1);
      continue;
    }

    if (fireball.age > fireballLifetime || fireball.position.y < -1.2) {
      removeFireball(fireball);
      fireballs.splice(i, 1);
    }
  }
}

function spawnTracer(start, end, color) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  tracers.push({ line, age: 0, life: 0.075 });
}

function spawnImpact(point) {
  const mesh = new THREE.Mesh(shared.geometries.sphere, new THREE.MeshBasicMaterial({ color: 0xf2c46b }));
  mesh.position.copy(point);
  mesh.scale.setScalar(0.07);
  scene.add(mesh);
  particles.push({ mesh, type: "impact", age: 0, life: 0.18 });
}

function showHitMarker() {
  ui.hit.classList.add("visible");
  window.clearTimeout(showHitMarker.timeout);
  showHitMarker.timeout = window.setTimeout(() => ui.hit.classList.remove("visible"), 90);
}

function chooseNearestCover(origin, avoidPlayer = true) {
  let best = null;
  let bestScore = Infinity;
  for (const point of coverPoints) {
    const d = point.distanceToSquared(origin);
    const playerD = point.distanceToSquared(player.feet);
    if (avoidPlayer && playerD < 60) continue;
    const score = d - playerD * 0.08;
    if (score < bestScore) {
      bestScore = score;
      best = point;
    }
  }
  return best ? best.clone() : null;
}

function enemyCanSeePlayer(enemy, distance) {
  if (distance > enemy.config.range * 1.25 && game.time - player.lastShotAt > 1.4) return false;

  const enemyEye = enemy.group.position.clone().add(new THREE.Vector3(0, enemy.eyeHeight || 1.55, 0));
  const playerEye = camera.position.clone();
  const dir = playerEye.clone().sub(enemyEye);
  const length = dir.length();
  dir.normalize();
  raycaster.set(enemyEye, dir);
  raycaster.far = length;
  const hits = raycaster.intersectObjects(solidMeshes, false);
  raycaster.far = 160;
  return hits.length === 0;
}

function updateEnemy(enemy, dt, index) {
  if (!enemy.alive) return;
  const target = nearestPlayerTarget(enemy.group.position);
  setActivePlayer(target.actor, target.view, target.pad);
  if (player.downed) return;
  if ((index + Math.floor(game.time * 10)) % (enemy.updateSkip + 1) !== 0 && enemy.group.position.distanceToSquared(player.feet) > 2500) {
    return;
  }

  const toPlayer = player.feet.clone().sub(enemy.group.position);
  const distance = toPlayer.length();
  const seesPlayer = enemyCanSeePlayer(enemy, distance);

  if (seesPlayer || game.time - player.lastShotAt < 1.2) {
    enemy.lastSeen = player.feet.clone();
  }

  enemy.decisionTimer -= dt;
  if (enemy.decisionTimer <= 0) {
    decideEnemyState(enemy, distance, seesPlayer);
    enemy.decisionTimer = randomRange(enemy.seed + Math.floor(game.time * 17), 0.35, 0.95);
  }

  let desired = null;
  if (enemy.state === "patrol") {
    if (enemy.group.position.distanceToSquared(enemy.target) < 2) {
      const angle = randomRange(enemy.seed + Math.floor(game.time * 5), 0, Math.PI * 2);
      enemy.target = enemy.group.position.clone().add(new THREE.Vector3(Math.cos(angle) * 12, 0, Math.sin(angle) * 12));
    }
    desired = enemy.target;
  } else if (enemy.state === "take_cover" && enemy.cover) {
    desired = enemy.cover;
  } else if (enemy.state === "flank" && enemy.lastSeen) {
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(enemy.flankSide * 15);
    desired = enemy.lastSeen.clone().add(side);
  } else if (enemy.state === "retreat") {
    desired = enemy.group.position.clone().sub(toPlayer.normalize().multiplyScalar(16));
  } else if (enemy.state === "advance" && enemy.lastSeen) {
    desired = enemy.lastSeen;
  } else if (enemy.state === "search" && enemy.lastSeen) {
    desired = enemy.lastSeen;
  }

  if (desired) {
    const path = desired.clone().sub(enemy.group.position);
    path.y = 0;
    const dist = path.length();
    if (dist > 0.35) {
      path.normalize();
      const speedMod = enemy.state === "advance" ? 1.1 : enemy.state === "retreat" ? 0.88 : 1;
      enemyMoveWithCollisions(enemy, path.multiplyScalar(enemy.config.speed * speedMod), dt);
    }
  }

  if (distance > 0.1) {
    const yaw = Math.atan2(toPlayer.x, toPlayer.z);
    enemy.aimYaw = THREE.MathUtils.lerp(enemy.aimYaw, yaw, dt * 4);
    enemy.group.rotation.y = enemy.aimYaw + Math.PI;
  }

  enemy.fireTimer -= dt;
  if (seesPlayer && distance < enemy.config.range && enemy.fireTimer <= 0) {
    enemyFire(enemy, distance);
    enemy.fireTimer = enemy.config.fireRate * randomRange(enemy.seed + Math.floor(game.time * 13), 0.75, 1.35);
  }
}

function decideEnemyState(enemy, distance, seesPlayer) {
  if (!enemy.lastSeen && !seesPlayer) {
    enemy.state = "patrol";
    return;
  }

  if (enemy.health < enemy.config.health * 0.32) {
    enemy.state = "retreat";
    enemy.cover = chooseNearestCover(enemy.group.position, true);
    return;
  }

  if (!seesPlayer) {
    enemy.state = "search";
    return;
  }

  if (enemy.boss) {
    if (distance > 46) {
      enemy.state = "advance";
    } else {
      const roll = seededRandom(enemy.seed + Math.floor(game.time * 4));
      enemy.state = roll > 0.7 ? "flank" : roll > 0.38 ? "take_cover" : "advance";
      enemy.cover = chooseNearestCover(enemy.group.position, false);
    }
    return;
  }

  if (enemy.type === "breacher") {
    enemy.state = distance > 10 ? "advance" : "take_cover";
    enemy.cover = chooseNearestCover(enemy.group.position, false);
    return;
  }

  if (enemy.type === "marksman") {
    enemy.state = distance < 42 ? "retreat" : "take_cover";
    enemy.cover = chooseNearestCover(enemy.group.position, true);
    return;
  }

  if (enemy.type === "support") {
    enemy.state = seededRandom(enemy.seed + Math.floor(game.time * 3)) > 0.45 ? "take_cover" : "flank";
    enemy.cover = chooseNearestCover(enemy.group.position, true);
    return;
  }

  if (enemy.type === "commander") {
    enemy.state = seededRandom(enemy.seed + Math.floor(game.time * 4)) > 0.65 ? "flank" : "take_cover";
    enemy.cover = chooseNearestCover(enemy.group.position, true);
    return;
  }

  enemy.state = distance > 34 ? "advance" : seededRandom(enemy.seed + Math.floor(game.time * 5)) > 0.56 ? "flank" : "take_cover";
  enemy.cover = chooseNearestCover(enemy.group.position, true);
}

function enemyFire(enemy, distance) {
  const target = nearestPlayerTarget(enemy.group.position);
  enemy.breathUntil = game.time + (enemy.boss ? 0.62 : 0.46);
  if (enemy.boss) {
    spawnBossLaser(enemy, target, distance);
  } else {
    spawnEnemyFireball(enemy, target, distance);
  }
  playTone("enemyShot");
}

function nearbyCommanderBoost(position) {
  for (const enemy of enemies) {
    if (enemy.alive && enemy.type === "commander" && enemy.group.position.distanceToSquared(position) < 400) {
      return 0.02;
    }
  }
  return 0;
}

function damagePlayer(amount) {
  if (player.downed || game.ended) return;
  player.lastDamageAt = game.time;
  pulseGamepad(activeGamepad, 0.24, 0.58, 90);
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  ui.damage.classList.add("visible");
  window.clearTimeout(damagePlayer.timeout);
  damagePlayer.timeout = window.setTimeout(() => ui.damage.classList.remove("visible"), 150);
  if (player.health <= 0) {
    player.health = 0;
    player.downed = true;
    if (activePlayers().every((candidate) => candidate.downed)) {
      endGame(false);
    } else {
      addMessage(`${player.label || "P1"} down. Move to the revive beacon and hold ${promptNameForAction("interact")}.`);
    }
  }
}

function teammateFor(actor) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of activePlayers()) {
    if (candidate === actor || !candidate.downed) continue;
    const distance = actor.feet.distanceToSquared(candidate.feet);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function revivePlayer(target, reviver) {
  target.health = 65;
  target.armor = Math.max(target.armor, 25);
  target.stamina = 85;
  target.downed = false;
  target.reviveProgress = 0;
  target.stance = "stand";
  target.height = 1.82;
  target.targetHeight = 1.82;
  target.verticalVelocity = 0;
  target.slideTimer = 0;
  target.reloading = false;
  target.ads = false;

  const offset = target.feet.clone().sub(reviver.feet);
  if (offset.lengthSq() < 1.2) {
    const side = new THREE.Vector3(Math.cos(reviver.yaw), 0, -Math.sin(reviver.yaw)).multiplyScalar(1.2);
    target.feet.copy(reviver.feet).add(side);
  }

  pulseGamepad(activeGamepad, 0.18, 0.35, 130);
  addMessage(`${target.label} revived by ${reviver.label}.`);
}

function updateRevive(input, dt) {
  const target = teammateFor(player);
  if (!target) {
    player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.9);
    return false;
  }

  const distance = player.feet.distanceTo(target.feet);
  if (distance > 3.4) {
    player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.9);
    return false;
  }

  const reviveTime = 2.35;
  if (input.interact) {
    player.reviveProgress = Math.min(reviveTime, player.reviveProgress + dt);
    const percent = Math.floor((player.reviveProgress / reviveTime) * 100);
    game.revivePrompt = `Hold ${promptNameForAction("interact")}: reviving ${target.label} (${percent}%)`;
    if (player.reviveProgress >= reviveTime) {
      revivePlayer(target, player);
      player.reviveProgress = 0;
      game.revivePrompt = `${target.label} revived. Keep moving.`;
    }
  } else {
    player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.7);
    const percent = Math.floor((player.reviveProgress / reviveTime) * 100);
    game.revivePrompt = percent > 0
      ? `Hold ${promptNameForAction("interact")} to finish reviving ${target.label} (${percent}%)`
      : `Hold ${promptNameForAction("interact")} to revive ${target.label}`;
  }

  return true;
}

function updateObjectives(input, dt) {
  let nearest = null;
  let nearestDistance = Infinity;
  const completedPrimary = objectives.filter((objective) => !objective.extraction && objective.complete).length;

  for (const objective of objectives) {
    if (objective.extraction && completedPrimary < 3 && game.hostilesAlive > 0) {
      objective.column.visible = false;
      objective.ring.visible = false;
      continue;
    }
    objective.column.visible = true;
    objective.ring.visible = true;
    objective.ring.rotation.z += dt * 0.45;
    objective.column.material.opacity = objective.complete ? 0.045 : 0.11 + Math.sin(game.time * 2.2) * 0.025;

    if (objective.complete) continue;
    const d = objective.position.distanceTo(player.feet);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = objective;
    }
  }

  player.activeObjective = nearestDistance < (nearest?.radius || 0) ? nearest : null;
  if (player.activeObjective && input.interact) {
    player.activeObjective.progress += dt;
    if (player.activeObjective.progress >= player.activeObjective.holdTime) {
      player.activeObjective.complete = true;
      player.activeObjective.progress = player.activeObjective.holdTime;
      addMessage(`${player.activeObjective.label} complete.`);
      playTone("objective");
      if (!player.activeObjective.extraction) {
        deployEnemyWave(12, "Objective noise pulled another dispersed squad into the fight.");
      } else {
        endGame(true);
      }
    }
  } else {
    for (const objective of objectives) {
      if (!objective.complete) objective.progress = Math.max(0, objective.progress - dt * 0.8);
    }
  }

  if (game.bossPhase === "cutscene") {
    game.objectiveMessage = "Korsak inbound. Watch the commander-class cutscene.";
  } else if (game.bossPhase === "crash") {
    game.objectiveMessage = "Korsak is crash landing. Stay clear of the wreck.";
  } else if (game.bossPhase === "fight") {
    game.objectiveMessage = "Final boss: Korsak. Shoot the full 3x-tall sprite.";
  } else if (game.hostilesAlive === 0 && !objectives[3].complete) {
    game.objectiveMessage = "All hostiles neutralized. Move to extraction.";
  } else if (player.activeObjective && !player.activeObjective.complete) {
    const percent = Math.floor((player.activeObjective.progress / player.activeObjective.holdTime) * 100);
    game.objectiveMessage = `Hold ${promptNameForAction("interact")} / E: ${player.activeObjective.label} (${percent}%)`;
  } else if (completedPrimary < 3) {
    const next = objectives.find((objective) => !objective.extraction && !objective.complete);
    game.objectiveMessage = `${completedPrimary}/3 systems complete. Next: ${next?.label || "secure area"}.`;
  } else {
    game.objectiveMessage = "Primary objectives complete. Reach extraction.";
  }
}

function updatePowerUps(dt) {
  for (const powerUp of powerUps) {
    powerUp.group.rotation.y += dt * 1.1;
    powerUp.core.rotation.x += dt * 1.8;
    powerUp.ring.rotation.z -= dt * 2.2;
    const hover = Math.sin(game.time * 2.4 + powerUp.group.position.x) * 0.16;
    powerUp.core.position.y = 1.25 + hover;
    powerUp.ring.position.y = 1.25 + hover;
    powerUp.beam.material.opacity = powerUp.available ? 0.12 + Math.sin(game.time * 3) * 0.03 : 0;

    if (!powerUp.available) {
      if (game.time >= powerUp.respawnAt) {
        powerUp.available = true;
        powerUp.group.visible = true;
      }
      continue;
    }

    if (powerUp.group.position.distanceToSquared(player.feet) < 4.6) {
      applyPowerUp(powerUp);
    }
  }
}

function applyPowerUp(powerUp) {
  powerUp.available = false;
  powerUp.group.visible = false;
  powerUp.respawnAt = game.time + 34;

  if (powerUp.type === "health") {
    player.health = Math.min(125, player.health + 45);
  } else if (powerUp.type === "armor") {
    player.armor = Math.min(100, player.armor + 35);
  } else if (powerUp.type === "stamina") {
    player.stamina = 120;
    player.tacticalUntil = game.time + 2.2;
  } else if (powerUp.type === "jammer") {
    player.jammerUntil = game.time + 13;
  } else if (powerUp.type === "overdrive") {
    player.overdriveUntil = game.time + 11;
  }

  addMessage(powerUp.config.message);
  playTone("objective");
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    if (p.type === "smoke") {
      p.mesh.position.y = p.baseY + Math.sin(game.time * 0.35 + p.age) * 0.4;
      p.mesh.rotation.y += dt * 0.1;
      const fade = p.life < 999 ? clamp(1 - p.age / p.life, 0, 1) : 1;
      p.mesh.material.opacity = (0.12 + Math.sin(game.time * 0.8 + p.age) * 0.035) * fade;
      if (p.age > p.life) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    } else {
      p.mesh.scale.multiplyScalar(1 + dt * 5);
      p.mesh.material.opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age > p.life) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    const t = tracers[i];
    t.age += dt;
    t.line.material.opacity = Math.max(0, 1 - t.age / t.life);
    if (t.age > t.life) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

function updateReviveBeacons(dt) {
  for (const actor of players) {
    if (!isActorActive(actor)) {
      if (actor.reviveBeacon) actor.reviveBeacon.group.visible = false;
      continue;
    }
    const beacon = actor.reviveBeacon;
    if (!beacon) continue;
    beacon.group.visible = actor.downed;
    if (!actor.downed) continue;

    beacon.group.position.set(actor.feet.x, actor.feet.y, actor.feet.z);
    beacon.group.rotation.y += dt * 1.8;
    beacon.ring.scale.setScalar(1.2 + Math.sin(game.time * 4.2) * 0.18);
    beacon.beam.material.opacity = 0.12 + Math.sin(game.time * 3.4) * 0.04;
    beacon.ring.material.opacity = 0.68 + Math.sin(game.time * 5.0) * 0.18;
    beacon.barA.rotation.y = -beacon.group.rotation.y;
    beacon.barB.rotation.y = -beacon.group.rotation.y;
  }
}

function controllerShortName(pad) {
  if (!pad.connected) return "Pad";
  const id = pad.id.toLowerCase();
  const family = controllerFamily(id);
  if (id.includes("on-screen") || id.includes("touch")) return "Touch";
  if (family === "xbox") return "Xbox";
  if (id.includes("dualsense") || id.includes("playstation")) return "PS5";
  if (id.includes("dualshock")) return "PS4";
  return "Pad";
}

function controllerHudName() {
  if (controlPadOne.connected) {
    const slot = controllerSlot === autoControllerSlot ? "AUTO" : `C${controlPadOne.index + 1}`;
    return `${controllerShortName(controlPadOne)} ${slot}`;
  }
  if (controllerSlot !== autoControllerSlot) return `C${Number(controllerSlot) + 1} missing`;
  return "choose PS/Xbox";
}

function controllerHudNameFor(pad, fallback = "connect pad") {
  if (pad.connected) return `${controllerShortName(pad)} C${pad.index + 1}`;
  return fallback;
}

function updateControllerLabels() {
  if (localSplit.enabled && !online.enabled) {
    ui.p1Controller.textContent = `P1 ${controllerHudNameFor(controlPadOne, "choose pad")}`;
    ui.p2Controller.textContent = `P2 ${controllerHudNameFor(controlPadTwo, "connect pad 2")}`;
    if (ui.p3Controller) ui.p3Controller.textContent = `P3 ${controllerHudNameFor(controlPadThree, "connect pad 3")}`;
    return;
  }
  if (online.enabled) {
    const roomText = online.roomCode
      ? ` - ROOM ${online.roomCode}${online.remoteReady ? " SQUAD" : ""}`
      : "";
    ui.p1Controller.textContent = `${online.role?.toUpperCase() || "P?"} ${controllerHudName()}${roomText}`;
    ui.p2Controller.textContent = "";
    return;
  }
  ui.p1Controller.textContent = `P1 ${controllerHudName()}`;
  ui.p2Controller.textContent = "";
  if (ui.p3Controller) ui.p3Controller.textContent = "";
}

function formatAxis(value = 0) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function setControllerCalibrationOpen(open) {
  game.calibrationOpen = Boolean(open);
  ui.calibration?.classList.toggle("visible", game.calibrationOpen);
  if (game.calibrationOpen) {
    document.exitPointerLock?.();
    updateControllerCalibrationUi();
  }
}

function updateCalibrationToggle(button, active, onText, offText) {
  if (!button) return;
  button.textContent = active ? onText : offText;
  button.classList.toggle("active", active);
}

function updateControllerCalibrationUi() {
  if (!ui.calibration) return;
  const pad = controlPadOne.connected ? controlPadOne : emptyGamepad;
  if (ui.calibrationId) {
    ui.calibrationId.textContent = pad.connected
      ? `${controllerHudName()} - ${pad.id}`
      : "No selected controller detected";
  }
  if (ui.calibrationMapping) {
    const slotText = controllerSlot === autoControllerSlot ? "auto" : `controller ${Number(controllerSlot) + 1}`;
    ui.calibrationMapping.textContent = `${pad.mapping || "raw"} - ${slotText} - ${controllerFlowHint(pad)}`;
  }

  const axisNames = ["leftX", "leftY", "rightX", "rightY"];
  axisNames.forEach((name, index) => {
    const value = pad.axes[index] || 0;
    const readout = document.querySelector(`[data-axis-readout="${name}"]`);
    const bar = document.querySelector(`[data-axis-bar="${name}"]`);
    if (readout) readout.textContent = formatAxis(value);
    if (bar) bar.style.setProperty("--axis-fill", `${50 + value * 50}%`);
  });

  if (ui.calibrationButtons) {
    const pressed = pad.buttons
      .map((value, index) => (value > 0.35 ? controllerButtonLabel(index) : ""))
      .filter(Boolean);
    ui.calibrationButtons.textContent = pressed.length ? `Pressed: ${pressed.join(", ")}` : "Press controller buttons to verify mapping.";
  }

  if (ui.calibrationDeadzone) ui.calibrationDeadzone.textContent = controllerSettings.deadzone.toFixed(2);
  if (ui.calibrationSens) ui.calibrationSens.textContent = controllerSettings.lookSensitivity.toFixed(1);
  updateCalibrationToggle(ui.calibrationInvertLookY, controllerSettings.invertLookY, "Look Y Inverted", "Look Y Normal");
  updateCalibrationToggle(ui.calibrationInvertLookX, controllerSettings.invertLookX, "Look X Inverted", "Look X Normal");
  updateCalibrationToggle(ui.calibrationInvertMoveY, controllerSettings.invertMoveY, "Move Y Inverted", "Move Y Normal");
  updateCalibrationToggle(ui.calibrationInvertMoveX, controllerSettings.invertMoveX, "Move X Inverted", "Move X Normal");
  updateCalibrationToggle(ui.calibrationShoulderLean, controllerSettings.shoulderLean, "L1/R1 Lean On", "L1/R1 Tactical");
}

function handleControllerCalibrationAction(action) {
  if (!action) return;
  if (action === "deadzoneDown") controllerSettings.deadzone -= 0.01;
  if (action === "deadzoneUp") controllerSettings.deadzone += 0.01;
  if (action === "sensDown") controllerSettings.lookSensitivity -= 0.1;
  if (action === "sensUp") controllerSettings.lookSensitivity += 0.1;
  if (action === "invertLookY") controllerSettings.invertLookY = !controllerSettings.invertLookY;
  if (action === "invertLookX") controllerSettings.invertLookX = !controllerSettings.invertLookX;
  if (action === "invertMoveY") controllerSettings.invertMoveY = !controllerSettings.invertMoveY;
  if (action === "invertMoveX") controllerSettings.invertMoveX = !controllerSettings.invertMoveX;
  if (action === "shoulderLean") controllerSettings.shoulderLean = !controllerSettings.shoulderLean;
  if (action === "reset") {
    resetControllerSettings();
  } else {
    saveControllerSettings();
  }
  updateControllerCalibrationUi();
}

function updateHUD() {
  if (game.time - game.lastHud < 0.05) return;
  game.lastHud = game.time;
  updateControllerLabels();
  updateControllerCalibrationUi();
  updateRewardMusicUi();
  ui.objective.textContent = game.revivePrompt || game.objectiveMessage;
  ui.hostiles.textContent = `${game.hostilesAlive} left / ${activeEnemyCount()} live`;
  ui.health.style.width = `${clamp(player.health, 0, 100)}%`;
  ui.armor.style.width = `${clamp(player.armor, 0, 100)}%`;
  ui.stamina.style.width = `${clamp(player.stamina, 0, 100)}%`;
  ui.healthText.textContent = String(Math.round(player.health));
  ui.armorText.textContent = String(Math.round(player.armor));
  ui.staminaText.textContent = String(Math.round(player.stamina));
  ui.ammo.textContent = String(player.ammo);
  ui.reserve.textContent = player.infiniteAmmo ? "INF" : String(player.reserve);
  if (ui.weaponName) ui.weaponName.textContent = activeWeaponConfig().label;
  ui.fireMode.textContent = player.fireMode;
  shell.classList.toggle("night-vision", player.nightVision);
  ui.crosshair.classList.toggle("ads", player.ads);
  ui.chips.ads.classList.toggle("active", player.ads);
  ui.chips.sprint.classList.toggle("active", player.sprinting || game.time < player.tacticalUntil);
  ui.chips.slide.classList.toggle("active", player.slideTimer > 0);
  ui.chips.stance.textContent = player.stance === "slide" ? "Slide" : player.stance;
  ui.chips.stance.classList.toggle("active", player.stance !== "stand");
}

function updateRewardMusicUi() {
  if (!ui.musicUnlock || !ui.musicCountdown) return;
  if (game.rewardMusicUntil <= game.time) {
    if (ui.musicUnlock.classList.contains("visible")) {
      stopRewardSong();
    }
    return;
  }
  const remaining = Math.max(0, Math.ceil(game.rewardMusicUntil - game.time));
  ui.musicCountdown.textContent = `${remaining}s`;
}

function stopRewardSong() {
  game.rewardMusicUntil = 0;
  if (game.rewardMusicTimer) {
    window.clearTimeout(game.rewardMusicTimer);
    game.rewardMusicTimer = null;
  }
  if (ui.musicFrame) ui.musicFrame.innerHTML = "";
  ui.musicUnlock?.classList.remove("visible");
}

function playRewardSong(boxIndex) {
  const unlocked = `${game.rewardBoxesDestroyed}/${rewardBoxes.length}`;
  game.rewardMusicUntil = game.time + rewardSongDuration;
  if (game.rewardMusicTimer) window.clearTimeout(game.rewardMusicTimer);
  game.rewardMusicTimer = window.setTimeout(stopRewardSong, rewardSongDuration * 1000);

  if (ui.musicFrame) {
    const src = `https://www.youtube.com/embed/${rewardSongVideoId}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&start=0&enablejsapi=1&unlock=${boxIndex}-${Date.now()}`;
    ui.musicFrame.innerHTML = `
      <iframe
        title="Song box reward"
        src="${src}"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
  }
  ui.musicUnlock?.classList.add("visible");
  updateRewardMusicUi();
  addMessage(`Song box ${boxIndex} destroyed. Music unlocked for ${rewardSongDuration}s. ${unlocked} boxes cleared.`);
}

function updateRewardBoxes(dt) {
  for (const rewardBox of rewardBoxes) {
    if (rewardBox.destroyed) continue;
    rewardBox.mesh.rotation.y += dt * 0.24;
    const pulse = 1 + Math.sin(game.time * 4.4 + rewardBox.index) * 0.16;
    rewardBox.core.scale.setScalar(0.18 * pulse);
  }
}

function addMessage(text) {
  game.messages.unshift({ text, time: game.time });
  game.messages = game.messages.slice(0, 4);
  ui.feed.innerHTML = game.messages.map((message) => `<div class="message">${message.text}</div>`).join("");
}

function playTone(type) {
  if (!audio.unlocked || !audio.context) return;
  const ctx = audio.context;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  if (type === "shot" || type === "enemyShot") {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(type === "shot" ? 96 : 74, now);
    osc.frequency.exponentialRampToValueAtTime(type === "shot" ? 42 : 36, now + 0.06);
    gain.gain.setValueAtTime(type === "shot" ? 0.075 : 0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.09);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = type === "objective" ? "triangle" : "sine";
  const freq = {
    hit: 550,
    kill: 220,
    empty: 130,
    reload: 180,
    objective: 660
  }[type] || 240;
  osc.frequency.setValueAtTime(freq, now);
  if (type === "objective") osc.frequency.linearRampToValueAtTime(880, now + 0.16);
  gain.gain.setValueAtTime(type === "objective" ? 0.08 : 0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.2);
}

function unlockAudio() {
  if (audio.unlocked) return;
  audio.context = new AudioContext();
  audio.context.resume();
  audio.unlocked = true;
}

function moveTouchKnob(name, x = 0, y = 0) {
  const knob = ui.touchControls?.querySelector(`[data-touch-knob="${name}"]`);
  if (!knob) return;
  knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function resetTouchInput() {
  touchControls.movePointer = null;
  touchControls.lookPointer = null;
  touchControls.moveX = 0;
  touchControls.moveY = 0;
  touchControls.lookDeltaX = 0;
  touchControls.lookDeltaY = 0;
  touchControls.buttons.clear();
  moveTouchKnob("move");
  moveTouchKnob("look");
  for (const button of ui.touchControls?.querySelectorAll(".touch-btn.is-down") || []) {
    button.classList.remove("is-down");
  }
}

function updateTouchControlVisibility() {
  shell.classList.toggle("touch-enabled", touchControls.enabled);
  shell.classList.toggle("touch-active", touchControls.enabled && game.running && !game.ended && !localSplit.enabled);
  if (ui.touchToggle) {
    ui.touchToggle.textContent = `Touch Controls: ${touchControls.enabled ? "On" : "Off"}`;
    ui.touchToggle.setAttribute("aria-pressed", String(touchControls.enabled));
  }
}

function setTouchControlsEnabled(enabled, announce = false) {
  touchControls.enabled = enabled;
  if (!enabled) resetTouchInput();
  updateTouchControlVisibility();
  if (announce) {
    addMessage(`Touch controls ${enabled ? "enabled" : "disabled"}.`);
  }
}

function updateMoveStick(event) {
  const limit = 46;
  const dx = clamp(event.clientX - touchControls.moveCenter.x, -limit, limit);
  const dy = clamp(event.clientY - touchControls.moveCenter.y, -limit, limit);
  touchControls.moveX = dx / limit;
  touchControls.moveY = -dy / limit;
  moveTouchKnob("move", dx, dy);
}

function updateLookStick(event) {
  const limit = 42;
  touchControls.lookDeltaX += event.clientX - touchControls.lookLast.x;
  touchControls.lookDeltaY += event.clientY - touchControls.lookLast.y;
  touchControls.lookLast.x = event.clientX;
  touchControls.lookLast.y = event.clientY;

  const rect = event.currentTarget.getBoundingClientRect();
  const dx = clamp(event.clientX - (rect.left + rect.width * 0.5), -limit, limit);
  const dy = clamp(event.clientY - (rect.top + rect.height * 0.5), -limit, limit);
  moveTouchKnob("look", dx, dy);
}

function setTouchButton(button, down, element) {
  touchControls.buttons.set(button, down);
  element?.classList.toggle("is-down", down);
}

function bindTouchControls() {
  if (!ui.touchControls) return;
  ui.touchControls.addEventListener("contextmenu", (event) => event.preventDefault());

  const moveStick = ui.touchControls.querySelector('[data-touch-stick="move"]');
  const lookStick = ui.touchControls.querySelector('[data-touch-stick="look"]');

  moveStick?.addEventListener("pointerdown", (event) => {
    if (!touchControls.enabled) return;
    event.preventDefault();
    moveStick.setPointerCapture(event.pointerId);
    touchControls.movePointer = event.pointerId;
    const rect = moveStick.getBoundingClientRect();
    touchControls.moveCenter.x = rect.left + rect.width * 0.5;
    touchControls.moveCenter.y = rect.top + rect.height * 0.5;
    updateMoveStick(event);
  });

  moveStick?.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touchControls.movePointer) return;
    event.preventDefault();
    updateMoveStick(event);
  });

  const endMove = (event) => {
    if (event.pointerId !== touchControls.movePointer) return;
    touchControls.movePointer = null;
    touchControls.moveX = 0;
    touchControls.moveY = 0;
    moveTouchKnob("move");
  };
  moveStick?.addEventListener("pointerup", endMove);
  moveStick?.addEventListener("pointercancel", endMove);

  lookStick?.addEventListener("pointerdown", (event) => {
    if (!touchControls.enabled) return;
    event.preventDefault();
    lookStick.setPointerCapture(event.pointerId);
    touchControls.lookPointer = event.pointerId;
    touchControls.lookLast.x = event.clientX;
    touchControls.lookLast.y = event.clientY;
    updateLookStick(event);
  });

  lookStick?.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touchControls.lookPointer) return;
    event.preventDefault();
    updateLookStick(event);
  });

  const endLook = (event) => {
    if (event.pointerId !== touchControls.lookPointer) return;
    touchControls.lookPointer = null;
    touchControls.lookDeltaX = 0;
    touchControls.lookDeltaY = 0;
    moveTouchKnob("look");
  };
  lookStick?.addEventListener("pointerup", endLook);
  lookStick?.addEventListener("pointercancel", endLook);

  for (const button of ui.touchControls.querySelectorAll("[data-touch-button]")) {
    const name = button.dataset.touchButton;
    button.addEventListener("pointerdown", (event) => {
      if (!touchControls.enabled) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setTouchButton(name, true, button);
    });
    const release = (event) => {
      if (button.hasPointerCapture?.(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      setTouchButton(name, false, button);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", () => setTouchButton(name, false, button));
  }

  window.addEventListener("blur", resetTouchInput);
}

function requestPointerLockSafe() {
  const request = renderer.domElement.requestPointerLock?.();
  if (request && typeof request.catch === "function") {
    request.catch(() => {});
  }
}

function startGame(options = {}) {
  if (shouldPlayIntro(options)) {
    playIntroThenStart(options);
    return;
  }
  startMission(options);
}

function shouldPlayIntro(options = {}) {
  return !options.skipIntro && !introState.consumed && !introState.playing && ui.introCinematic && ui.introVideo;
}

function playIntroThenStart(options = {}) {
  if (introState.playing) return;
  introState.consumed = true;
  introState.playing = true;
  introState.pendingOptions = { ...options, skipIntro: true };
  introState.abort?.abort();
  introState.abort = new AbortController();
  unlockAudio();
  setControllerCalibrationOpen(false);
  ui.prompt.style.display = "none";
  ui.end.classList.remove("visible");
  shell.classList.add("intro-mode");
  ui.introCinematic.hidden = false;
  ui.introCinematic.classList.add("visible");

  const video = ui.introVideo;
  video.muted = false;
  video.volume = 1;
  try {
    video.currentTime = 0;
  } catch {
    // Some browsers reject seeking before metadata is ready; playback still starts at the beginning on first load.
  }

  const finish = () => finishIntroCinematic();
  video.addEventListener("ended", finish, { signal: introState.abort.signal });
  video.addEventListener("error", finish, { signal: introState.abort.signal });
  ui.introSkip?.addEventListener("click", finish, { signal: introState.abort.signal });
  introState.timeout = window.setTimeout(finish, introMaxDuration * 1000);

  const playRequest = video.play();
  if (playRequest && typeof playRequest.catch === "function") {
    playRequest.catch(() => {
      video.muted = true;
      video.play().catch(finish);
    });
  }
}

function finishIntroCinematic() {
  if (!introState.playing) return;
  introState.playing = false;
  window.clearTimeout(introState.timeout);
  introState.timeout = null;
  introState.abort?.abort();
  introState.abort = null;
  const options = introState.pendingOptions || { skipIntro: true };
  introState.pendingOptions = null;
  startMission(options);
  ui.introVideo.pause();
  shell.classList.remove("intro-mode");
  ui.introCinematic.classList.remove("visible");
  window.setTimeout(() => {
    if (!introState.playing) ui.introCinematic.hidden = true;
  }, 520);
}

function startMission(options = {}) {
  const splitPlayers = Number(options?.splitPlayers || 0);
  unlockAudio();
  setControllerCalibrationOpen(false);
  localSplit.enabled = !online.enabled && splitPlayers > 1;
  localSplit.players = localSplit.enabled ? clamp(splitPlayers, 2, 3) : 1;
  game.running = true;
  game.ended = false;
  shell.classList.remove("online-lobby");
  shell.classList.add("online-mode");
  shell.classList.toggle("split-mode", localSplit.enabled);
  ui.prompt.style.display = "none";
  ui.end.classList.remove("visible");
  updateCameraAspects();
  updateTouchControlVisibility();
  if (localSplit.enabled) {
    addMessage("3-player split screen live. P1 selected pad, P2/P3 next connected pads.");
  } else {
    addMessage("Mission live. Secure three objectives or eliminate all hostiles.");
  }
}

function endGame(success) {
  game.running = false;
  game.ended = true;
  const totalKills = players.reduce((sum, actor) => sum + actor.kills, 0);
  ui.endTitle.textContent = success ? "Mission Complete" : "Killed In Action";
  ui.endBody.textContent = success
    ? `Objectives secured with ${totalKills} hostiles neutralized.`
    : `Run ended with ${totalKills} hostiles neutralized.`;
  ui.end.classList.add("visible");
  updateTouchControlVisibility();
  document.exitPointerLock?.();
}

function resetGame() {
  window.location.reload();
}

function updatePlayer(actor, view, input, pad, dt) {
  setActivePlayer(actor, view, pad);
  if (actor.downed) return;
  updateLook(input, dt);
  handleStanceInput(input, dt);
  updateMovement(input, dt);
  updateWeapon(input, dt);
  if (!updateRevive(input, dt)) {
    updateObjectives(input, dt);
  }
  updatePowerUps(dt);
}

function updateCameraAspects() {
  const aspect = localSplit.enabled && !online.enabled
    ? (Math.floor(window.innerWidth / 2) || 1) / (Math.floor(window.innerHeight / 2) || 1)
    : window.innerWidth / window.innerHeight;
  cameraOne.aspect = aspect;
  cameraTwo.aspect = aspect;
  cameraThree.aspect = aspect;
  cameraOne.updateProjectionMatrix();
  cameraTwo.updateProjectionMatrix();
  cameraThree.updateProjectionMatrix();
}

function renderSingleScreen() {
  const local = localBundle();
  renderer.setClearColor(0x060806, 1);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  prepareSceneForView(local.view, local.actor);
  renderer.render(scene, local.view);
}

function renderViewport(bundle, x, y, width, height) {
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  prepareSceneForView(bundle.view, bundle.actor);
  renderer.render(scene, bundle.view);
}

function clearViewport(x, y, width, height) {
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  renderer.setClearColor(0x050805, 1);
  renderer.clear(true, true, true);
}

function renderSplitScreen() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const bundles = localSplitBundles();
  renderer.setClearColor(0x060806, 1);
  renderer.setScissorTest(true);
  renderViewport(bundles[0], 0, halfH, halfW, height - halfH);
  renderViewport(bundles[1], halfW, halfH, width - halfW, height - halfH);
  renderViewport(bundles[2], 0, 0, halfW, halfH);
  clearViewport(halfW, 0, width - halfW, halfH);
  renderer.setScissorTest(false);
}

function renderGame() {
  if (localSplit.enabled && !online.enabled) {
    renderSplitScreen();
  } else {
    renderSingleScreen();
  }
}

function prepareSceneForView(view, hiddenActor) {
  for (const enemy of enemies) {
    updateEnemyVisual(enemy, view);
  }
  updatePlayerWorldSpritesForView(view, hiddenActor);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.045);
  game.time += dt;
  pollGamepad();
  handleControllerMenuInput();
  game.revivePrompt = "";
  updateOnlineRoom(dt);

  if (game.running && !game.ended && !game.calibrationOpen) {
    updateFinalBossSequence(dt);
    if (game.bossPhase !== "cutscene") {
      if (online.enabled) {
        const local = localBundle();
        updatePlayer(local.actor, local.view, getInputState({ keyboardMouse: false, pad: controlPadOne }), controlPadOne, dt);
      } else if (localSplit.enabled) {
        for (const bundle of localSplitBundles()) {
          updatePlayer(bundle.actor, bundle.view, getInputState({ keyboardMouse: false, pad: bundle.pad }), bundle.pad, dt);
        }
      } else {
        updatePlayer(playerOne, cameraOne, getInputState({ keyboardMouse: false, pad: controlPadOne }), controlPadOne, dt);
      }
      updateSpawnDirector();
      for (let i = 0; i < enemies.length; i += 1) {
        updateEnemy(enemies[i], dt, i);
      }
    }
  }

  if (!game.calibrationOpen) {
    updateFireballs(dt);
    updateParticles(dt);
    updateRewardBoxes(dt);
  }
  updateReviveBeacons(dt);
  const local = localSplit.enabled && !online.enabled ? bundleForLocalActor(playerOne) : localBundle();
  setActivePlayer(local.actor, local.view, local.pad);
  updateHUD();
  renderGame();
  requestAnimationFrame(animate);
}

function bindEvents() {
  window.addEventListener("resize", () => {
    updateCameraAspects();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener("keydown", (event) => {
    keys.set(event.code, true);
    if (event.code === "Escape") {
      if (introState.playing) {
        finishIntroCinematic();
        return;
      }
      if (game.calibrationOpen) {
        setControllerCalibrationOpen(false);
        return;
      }
      if (online.enabled && !game.running) {
        void leaveOnlineRoom();
        return;
      }
      localSplit.enabled = false;
      localSplit.players = 1;
      shell.classList.remove("split-mode");
      updateCameraAspects();
      ui.prompt.style.display = "grid";
      game.running = false;
      updateTouchControlVisibility();
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.set(event.code, false);
  });

  window.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveOnlineSession();
      return;
    }
    if (online.enabled) {
      online.lastSyncAt = -10;
      void syncOnlineRoom();
    }
  });

  window.addEventListener("beforeunload", saveOnlineSession);

  window.addEventListener("gamepadconnected", (event) => {
    addMessage(`${controllerPadLabel(event.gamepad)} connected (${event.gamepad.mapping || "raw"} mapping). Assign it on the start screen or press Menu/Options to calibrate.`);
    updateControllerSelectionUi(true);
  });

  window.addEventListener("gamepaddisconnected", (event) => {
    addMessage(`Controller ${event.gamepad.index + 1} disconnected.`);
    updateControllerSelectionUi(true);
  });

  ui.start.addEventListener("click", () => startGame());
  ui.startSplit?.addEventListener("click", () => startGame({ splitPlayers: 3 }));
  ui.calibrationOpen?.addEventListener("click", () => setControllerCalibrationOpen(true));
  ui.calibrationClose?.addEventListener("click", () => setControllerCalibrationOpen(false));
  ui.calibration?.addEventListener("click", (event) => {
    const action = event.target?.dataset?.calibrationAction;
    if (action) handleControllerCalibrationAction(action);
  });
  ui.touchToggle.addEventListener("click", () => {
    setTouchControlsEnabled(!touchControls.enabled, true);
  });
  ui.controllerPrev?.addEventListener("click", () => cycleControllerSlot(-1));
  ui.controllerNext?.addEventListener("click", () => cycleControllerSlot(1));
  ui.controllerDetect?.addEventListener("click", armControllerClaim);
  ui.musicClose?.addEventListener("click", stopRewardSong);
  ui.readyUp.addEventListener("click", toggleReadyUp);
  ui.leaveRoom.addEventListener("click", leaveOnlineRoom);
  for (const button of ui.skinButtons) {
    button.addEventListener("click", () => {
      void selectSkin(button.dataset.skin);
    });
  }
  ui.reset.addEventListener("click", resetGame);
  ui.restart.addEventListener("click", resetGame);
  ui.createRoom.addEventListener("click", createOnlineRoom);
  ui.joinRoom.addEventListener("click", joinOnlineRoom);
  ui.roomCode.addEventListener("input", () => {
    ui.roomCode.value = normalizeRoomCode(ui.roomCode.value);
  });
  ui.roomCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      joinOnlineRoom();
    }
  });
  bindTouchControls();
}

function init() {
  createSharedAssets();
  addLights();
  buildBattlefield();
  createWeaponModel(playerOne, cameraOne);
  createWeaponModel(playerTwo, cameraTwo);
  createWeaponModel(playerThree, cameraThree);
  createPlayerWorldSprite(playerOne, 0);
  createPlayerWorldSprite(playerTwo, 1);
  createPlayerWorldSprite(playerThree, 0);
  createReviveBeacon(playerOne);
  createReviveBeacon(playerTwo);
  createReviveBeacon(playerThree);
  spawnEnemies();
  updateCameraAspects();
  setTouchControlsEnabled(touchControls.enabled);
  updateControllerPromptUi(true);
  updateControllerSelectionUi(true);
  updateLobbyUi();
  cameraOne.position.set(playerOne.feet.x, playerOne.feet.y + playerOne.height, playerOne.feet.z);
  cameraOne.rotation.y = playerOne.yaw;
  cameraTwo.position.set(playerTwo.feet.x, playerTwo.feet.y + playerTwo.height, playerTwo.feet.z);
  cameraTwo.rotation.y = playerTwo.yaw;
  cameraThree.position.set(playerThree.feet.x, playerThree.feet.y + playerThree.height, playerThree.feet.z);
  cameraThree.rotation.y = playerThree.yaw;
  addMessage("Ready. Co-op uses one full-screen player per device with room codes.");
  bindEvents();
  void restoreOnlineSession();
  animate();
}

init();
