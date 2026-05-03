const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomTtlMs = 1000 * 60 * 90;
const playerStaleMs = 1000 * 60 * 4;
const playerRoles = ["p1", "p2", "p3"];
const skinIds = new Set(["blue", "black", "three"]);
const skinAliases = new Map([["gold", "three"]]);

const store = globalThis.__jaydensWarzoneRooms || {
  rooms: new Map()
};
globalThis.__jaydensWarzoneRooms = store;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of store.rooms) {
    if (now - room.updatedAt > roomTtlMs) {
      store.rooms.delete(code);
    }
  }
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createRoomCode() {
  let code = makeCode();
  let guard = 0;
  while (store.rooms.has(code) && guard < 24) {
    code = makeCode();
    guard += 1;
  }
  return code;
}

function normalizeCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function normalizeSkin(skin) {
  const id = String(skin || "").toLowerCase();
  const normalized = skinAliases.get(id) || id;
  return skinIds.has(normalized) ? normalized : "blue";
}

function defaultSkinForRole(role) {
  if (role === "p2") return "black";
  if (role === "p3") return "three";
  return "blue";
}

function createPlayer(body, role, clientId, now, previous = null) {
  return {
    clientId,
    lastSeen: now,
    ready: typeof body.ready === "boolean"
      ? Boolean(body.ready)
      : previous?.clientId === clientId
        ? Boolean(previous.ready)
        : false,
    skin: previous?.clientId === clientId
      ? normalizeSkin(body.skin || previous.skin || defaultSkinForRole(role))
      : normalizeSkin(body.skin || defaultSkinForRole(role)),
    state: body.state || previous?.state || null
  };
}

function createEmptyPlayers() {
  return { p1: null, p2: null, p3: null };
}

function ensureRoomShape(room) {
  room.players = room.players || createEmptyPlayers();
  for (const role of playerRoles) {
    room.players[role] = room.players[role] || null;
  }
}

function pruneStalePlayers(room, now) {
  ensureRoomShape(room);
  if (room.started) return;
  for (const role of playerRoles) {
    const player = room.players[role];
    if (player && now - player.lastSeen > playerStaleMs) {
      room.players[role] = null;
    }
  }
}

function publicPlayer(player) {
  return player ? {
    connected: true,
    ready: Boolean(player.ready),
    skin: normalizeSkin(player.skin),
    lastSeen: player.lastSeen,
    state: player.state || null
  } : null;
}

function publicRoom(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    started: Boolean(room.started),
    startedAt: room.startedAt || null,
    players: {
      p1: publicPlayer(room.players.p1),
      p2: publicPlayer(room.players.p2),
      p3: publicPlayer(room.players.p3)
    }
  };
}

function assignPlayer(room, clientId) {
  ensureRoomShape(room);
  for (const role of playerRoles) {
    if (room.players[role]?.clientId === clientId) return role;
  }
  for (const role of playerRoles) {
    if (!room.players[role]) return role;
  }
  return null;
}

function maybeStartRoom(room, now) {
  pruneStalePlayers(room, now);
  const connected = playerRoles.map((role) => room.players[role]).filter(Boolean);
  const enoughPlayers = connected.length >= 2;
  const allConnectedReady = connected.every((player) => player.ready);
  if (!room.started && enoughPlayers && allConnectedReady) {
    room.started = true;
    room.startedAt = now;
  }
}

function connectedCount(room) {
  ensureRoomShape(room);
  return playerRoles.reduce((count, role) => count + (room.players[role] ? 1 : 0), 0);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { error: "Use POST." });
    return;
  }

  cleanupRooms();

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    send(res, 400, { error: "Invalid JSON." });
    return;
  }

  const action = body.action;
  const clientId = String(body.clientId || "").slice(0, 80);
  if (!clientId) {
    send(res, 400, { error: "Missing clientId." });
    return;
  }

  if (action === "create") {
    const code = createRoomCode();
    const now = Date.now();
    const room = {
      code,
      createdAt: now,
      updatedAt: now,
      started: false,
      startedAt: null,
      players: createEmptyPlayers()
    };
    room.players.p1 = createPlayer({ ...body, ready: false }, "p1", clientId, now);
    store.rooms.set(code, room);
    send(res, 200, { code, role: "p1", room: publicRoom(room) });
    return;
  }

  const code = normalizeCode(body.code);
  const now = Date.now();
  if (!code) {
    send(res, 400, { error: "Missing room code." });
    return;
  }
  const room = store.rooms.get(code);

  if (!room && action === "recover") {
    const role = playerRoles.includes(body.role) ? body.role : "p1";
    const recoveredRoom = {
      code,
      createdAt: now,
      updatedAt: now,
      started: Boolean(body.started),
      startedAt: body.started ? now : null,
      players: createEmptyPlayers()
    };
    recoveredRoom.players[role] = createPlayer(body, role, clientId, now);
    store.rooms.set(code, recoveredRoom);
    send(res, 200, { code, role, room: publicRoom(recoveredRoom), recovered: true });
    return;
  }

  if (!room) {
    send(res, 404, { error: "Room not found." });
    return;
  }

  room.updatedAt = now;
  ensureRoomShape(room);
  pruneStalePlayers(room, now);

  if (action === "join") {
    const role = assignPlayer(room, clientId);
    if (!role) {
      send(res, 409, { error: "Room is full." });
      return;
    }
    const previous = room.players[role];
    room.players[role] = createPlayer(body, role, clientId, now, previous);
    send(res, 200, { code, role, room: publicRoom(room) });
    return;
  }

  if (action === "leave") {
    const role = playerRoles.includes(body.role) ? body.role : assignPlayer(room, clientId);
    if (!role || room.players[role]?.clientId !== clientId) {
      send(res, 403, { error: "Player is not assigned to this room." });
      return;
    }
    room.players[role] = null;
    room.updatedAt = now;
    if (connectedCount(room) === 0) {
      store.rooms.delete(code);
      send(res, 200, { code, role, left: true, room: null });
      return;
    }
    send(res, 200, { code, role, left: true, room: publicRoom(room) });
    return;
  }

  if (action === "recover") {
    const role = playerRoles.includes(body.role) ? body.role : assignPlayer(room, clientId);
    if (!role) {
      send(res, 409, { error: "Room is full." });
      return;
    }
    const previous = room.players[role];
    if (previous && previous.clientId !== clientId && now - previous.lastSeen <= playerStaleMs) {
      send(res, 409, { error: "Role is already active in this room." });
      return;
    }
    room.players[role] = createPlayer(body, role, clientId, now, previous);
    room.started = room.started || Boolean(body.started);
    room.startedAt = room.startedAt || (room.started ? now : null);
    maybeStartRoom(room, now);
    send(res, 200, { code, role, room: publicRoom(room), recovered: true });
    return;
  }

  if (action === "sync" || action === "ready" || action === "skin") {
    const role = playerRoles.includes(body.role) ? body.role : assignPlayer(room, clientId);
    if (!role || room.players[role]?.clientId !== clientId) {
      send(res, 403, { error: "Player is not assigned to this room." });
      return;
    }
    room.players[role].lastSeen = now;
    room.players[role].state = body.state || room.players[role].state || null;
    if (body.skin) {
      room.players[role].skin = normalizeSkin(body.skin);
    }
    if (action === "ready") {
      room.players[role].ready = Boolean(body.ready);
      maybeStartRoom(room, now);
    }
    send(res, 200, { code, role, room: publicRoom(room) });
    return;
  }

  send(res, 400, { error: "Unknown action." });
}
