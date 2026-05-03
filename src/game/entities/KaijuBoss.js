import * as THREE from "three";

const kaijuSpriteSrc = "/assets/kaiju-boss.png";

// Sprite crop guide: tweak these cells if a better sheet frame is added later.
// The sheet is roughly 6 columns by 6 rows, with black row labels between sets.
const kaijuFrames = {
  idle: [
    { x: 6, y: 4, w: 158, h: 160 },
    { x: 176, y: 4, w: 158, h: 160 },
    { x: 348, y: 4, w: 158, h: 160 },
    { x: 518, y: 4, w: 158, h: 160 }
  ],
  walk: [
    { x: 2, y: 192, w: 164, h: 146 },
    { x: 174, y: 192, w: 164, h: 146 },
    { x: 344, y: 192, w: 164, h: 146 },
    { x: 516, y: 192, w: 164, h: 146 },
    { x: 686, y: 192, w: 164, h: 146 },
    { x: 856, y: 192, w: 164, h: 146 }
  ],
  attack: [
    { x: 4, y: 542, w: 166, h: 122 },
    { x: 174, y: 542, w: 166, h: 122 },
    { x: 344, y: 542, w: 166, h: 122 },
    { x: 688, y: 686, w: 332, h: 132 }
  ]
};

function removeCheckerBackground(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const checkerGrey = max - min < 18 && max > 126;
    const brightCell = r > 210 && g > 210 && b > 210;
    if (a < 20 || checkerGrey || brightCell) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function trimAlphaToCenter(ctx, width, height, padding = 18) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 18) {
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
  scratch.getContext("2d").putImageData(imageData, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(scratch, minX, minY, sourceW, sourceH, targetX, targetY, targetW, targetH);
}

function createFrameTexture(cell) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(31, 67, 54, 0.9)";
  ctx.beginPath();
  ctx.ellipse(256, 280, 120, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(470 / cell.w, 486 / cell.h);
    const width = cell.w * scale;
    const height = cell.h * scale;
    ctx.drawImage(
      image,
      cell.x,
      cell.y,
      cell.w,
      cell.h,
      (512 - width) * 0.5,
      (512 - height) * 0.5,
      width,
      height
    );
    removeCheckerBackground(ctx, canvas.width, canvas.height);
    trimAlphaToCenter(ctx, canvas.width, canvas.height, 16);
    texture.needsUpdate = true;
  };
  image.src = kaijuSpriteSrc;
  return texture;
}

function buildTextures() {
  return Object.fromEntries(
    Object.entries(kaijuFrames).map(([name, frames]) => [
      name,
      frames.map((cell) => createFrameTexture(cell))
    ])
  );
}

function actorCenter(actor) {
  return actor.feet.clone().add(new THREE.Vector3(0, actor.height * 0.62, 0));
}

export class KaijuBoss {
  constructor({
    scene,
    position = new THREE.Vector3(0, 0, -35),
    scale = 11,
    maxHealth = 5000,
    fireballCooldown = 3,
    onFireballHit = () => {},
    onDefeated = () => {},
    onRoar = () => {}
  }) {
    this.scene = scene;
    this.maxHealth = maxHealth; // Change this value to rebalance boss HP.
    this.currentHealth = maxHealth;
    this.scale = scale; // Change this value to make the boss taller or shorter.
    this.width = scale * 0.82;
    this.fireballCooldown = fireballCooldown; // Fireball cooldown in seconds.
    this.fireballSpeed = 18;
    this.fireballRadius = 0.5;
    this.fireballDamage = 25;
    this.minDistance = 25;
    this.walkSpeed = 1.15;
    this.position = position.clone();
    this.onFireballHit = onFireballHit;
    this.onDefeated = onDefeated;
    this.onRoar = onRoar;
    this.fireballs = [];
    this.hitMeshes = [];
    this.alive = true;
    this.animation = "idle";
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.fireTimer = 1.4;
    this.attackUntil = -1;
    this.nextRoarAt = 2.6;
    this.flashUntil = -1;

    this.textures = buildTextures();
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.spriteMaterial = new THREE.MeshBasicMaterial({
      map: this.textures.idle[0],
      transparent: true,
      alphaTest: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.spriteMaterial);
    this.sprite.position.copy(this.position).add(new THREE.Vector3(0, this.scale * 0.5, 0));
    this.sprite.scale.set(this.width, this.scale, 1);
    this.sprite.userData.kaijuBoss = this;
    this.scene.add(this.sprite);

    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false
      })
    );
    this.hitbox.position.copy(this.position).add(new THREE.Vector3(0, this.scale * 0.5, 0));
    this.hitbox.scale.set(this.width * 0.8, this.scale * 0.9, 1.65);
    this.hitbox.userData.kaijuBoss = this;
    this.scene.add(this.hitbox);
    this.hitMeshes.push(this.sprite, this.hitbox);
  }

  get healthRatio() {
    return Math.max(0, this.currentHealth / this.maxHealth);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.flashUntil = performance.now() / 1000 + 0.08;
    if (this.currentHealth <= 0) {
      this.alive = false;
      this.dispose();
      this.onDefeated(this);
    }
  }

  update(deltaTime, players = [], camera) {
    this.updateFireballs(deltaTime, players, camera);
    if (!this.alive) return;

    const target = this.findTarget(players);
    if (target) {
      this.moveAndAim(deltaTime, target);
      this.updateAttack(deltaTime, target);
    }

    this.updateAnimation(deltaTime);
    this.updateBillboard(camera, target);
  }

  findTarget(players) {
    let best = null;
    let bestDistance = Infinity;
    for (const actor of players) {
      if (!actor || actor.downed) continue;
      const distance = actor.feet.distanceToSquared(this.position);
      if (distance < bestDistance) {
        best = actor;
        bestDistance = distance;
      }
    }
    return best;
  }

  moveAndAim(deltaTime, target) {
    const toTarget = target.feet.clone().sub(this.position);
    toTarget.y = 0;
    const distance = toTarget.length();
    this.animation = distance > this.minDistance + 2 ? "walk" : "idle";
    if (distance > this.minDistance && distance > 0.1) {
      toTarget.normalize();
      this.position.addScaledVector(toTarget, this.walkSpeed * deltaTime);
      this.position.x = THREE.MathUtils.clamp(this.position.x, -96, 96);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -96, 96);
    }
  }

  updateAttack(deltaTime, target) {
    this.fireTimer -= deltaTime;
    this.nextRoarAt -= deltaTime;
    if (this.nextRoarAt <= 0) {
      this.nextRoarAt = 4.5 + Math.random() * 2.5;
      this.onRoar();
    }

    if (this.fireTimer > 0) return;
    this.animation = "attack";
    this.attackUntil = performance.now() / 1000 + 0.32;
    this.shootFireball(target);
    this.fireTimer = this.fireballCooldown + Math.random();
  }

  shootFireball(target) {
    const targetCenter = actorCenter(target);
    const direction = targetCenter.clone().sub(this.position).normalize();
    const mouth = this.position.clone()
      .addScaledVector(direction, this.width * 0.32)
      .add(new THREE.Vector3(0, this.scale * 0.66, 0));
    const velocity = targetCenter.clone().sub(mouth).normalize().multiplyScalar(this.fireballSpeed);

    const material = new THREE.MeshBasicMaterial({
      color: 0xff4b18,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(this.fireballRadius, 16, 12), material);
    const glow = new THREE.PointLight(0xff5a1c, 3.2, 16, 1.6);
    const group = new THREE.Group();
    group.add(core);
    group.add(glow);
    group.position.copy(mouth);
    this.scene.add(group);

    this.fireballs.push({
      group,
      core,
      glow,
      position: mouth.clone(),
      previous: mouth.clone(),
      velocity,
      age: 0,
      trailAt: 0
    });
  }

  updateFireballs(deltaTime, players, camera) {
    for (let i = this.fireballs.length - 1; i >= 0; i -= 1) {
      const fireball = this.fireballs[i];
      fireball.age += deltaTime;
      fireball.previous.copy(fireball.position);
      fireball.position.addScaledVector(fireball.velocity, deltaTime);
      fireball.group.position.copy(fireball.position);
      fireball.core.scale.setScalar(1 + Math.sin(fireball.age * 24) * 0.08);
      fireball.glow.intensity = 2.4 + Math.sin(fireball.age * 18) * 0.8;

      if (camera) {
        fireball.group.lookAt(camera.position);
      }

      fireball.trailAt -= deltaTime;
      if (fireball.trailAt <= 0) {
        fireball.trailAt = 0.055;
        this.spawnFireTrail(fireball.position);
      }

      const hitActor = players.find((actor) => {
        if (!actor || actor.downed) return false;
        return actorCenter(actor).distanceTo(fireball.position) < this.fireballRadius + 0.72;
      });
      if (hitActor) {
        this.onFireballHit(hitActor, this.fireballDamage, fireball.position.clone());
        this.removeFireball(i);
        continue;
      }

      if (fireball.age > 5.4 || fireball.position.distanceToSquared(this.position) > 130 * 130 || fireball.position.y < -1.2) {
        this.removeFireball(i);
      }
    }
  }

  spawnFireTrail(position) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff9d34,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    mesh.position.copy(position);
    mesh.scale.set(1, 0.72, 1);
    this.scene.add(mesh);
    window.setTimeout(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }, 360);
  }

  removeFireball(index) {
    const fireball = this.fireballs[index];
    if (!fireball) return;
    this.scene.remove(fireball.group);
    fireball.core.geometry.dispose();
    fireball.core.material.dispose();
    fireball.glow.dispose?.();
    this.fireballs.splice(index, 1);
  }

  updateAnimation(deltaTime) {
    const now = performance.now() / 1000;
    const activeAnimation = now < this.attackUntil ? "attack" : this.animation;
    const frames = this.textures[activeAnimation] || this.textures.idle;
    this.frameTimer += deltaTime;
    const frameTime = activeAnimation === "attack" ? 0.11 : activeAnimation === "walk" ? 0.14 : 0.22;
    if (this.frameTimer >= frameTime) {
      this.frameTimer = 0;
      this.frameIndex = (this.frameIndex + 1) % frames.length;
    }
    this.spriteMaterial.map = frames[this.frameIndex % frames.length];
    this.spriteMaterial.color.set(now < this.flashUntil ? 0xffe0c6 : 0xffffff);
    this.spriteMaterial.needsUpdate = true;
  }

  updateBillboard(camera, target) {
    this.group.position.copy(this.position);
    this.sprite.position.copy(this.position).add(new THREE.Vector3(0, this.scale * 0.5, 0));
    this.hitbox.position.copy(this.position).add(new THREE.Vector3(0, this.scale * 0.5, 0));
    if (camera) {
      this.sprite.lookAt(camera.position.x, this.sprite.position.y, camera.position.z);
    } else if (target) {
      this.sprite.lookAt(target.feet.x, this.sprite.position.y, target.feet.z);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.sprite);
    this.scene.remove(this.hitbox);
    for (let i = this.fireballs.length - 1; i >= 0; i -= 1) {
      this.removeFireball(i);
    }
  }
}
