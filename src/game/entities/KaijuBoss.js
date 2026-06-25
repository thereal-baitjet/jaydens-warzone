import * as THREE from "three";

const kaijuFrameCounts = { idle: 4, walk: 6, attack: 4 };
const kaijuTextureLoader = new THREE.TextureLoader();

function loadFrameTexture(name, index) {
  const texture = kaijuTextureLoader.load(`/assets/sprites/kaiju/${name}${index}.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function buildTextures() {
  return Object.fromEntries(
    Object.entries(kaijuFrameCounts).map(([name, count]) => [
      name,
      Array.from({ length: count }, (_, index) => loadFrameTexture(name, index))
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
