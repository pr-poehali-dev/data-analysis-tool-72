import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const W = 800, H = 500;
const HALF_H = H / 2;
const FOV = Math.PI / 3;
const NUM_RAYS = W;
const MAX_DEPTH = 20;
const PLAYER_SPEED = 0.06;
const ROT_SPEED = 0.003;
const CELL = 1;

// Map: 1=wall, 0=floor
const MAP_W = 12, MAP_H = 12;
const MAP: number[] = [
  1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,0,0,1,
  1,0,1,1,0,0,0,0,1,1,0,1,
  1,0,1,0,0,0,0,0,0,1,0,1,
  1,0,0,0,0,1,1,0,0,0,0,1,
  1,0,0,0,0,1,1,0,0,0,0,1,
  1,0,0,0,0,0,0,0,0,1,0,1,
  1,0,1,0,0,0,0,0,0,1,0,1,
  1,0,1,1,0,0,0,0,1,1,0,1,
  1,0,0,0,0,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,
];

function mapAt(x: number, y: number) {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return 1;
  return MAP[my * MAP_W + mx];
}

interface Enemy {
  x: number; y: number;
  hp: number;
  alive: boolean;
  shootCooldown: number;
  hitFlash: number;
  walkPhase: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const animRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(100);
  const [ammo, setAmmo] = useState(30);
  const [muzzleFlash, setMuzzleFlash] = useState(false);
  const [hitFlash, setHitFlash] = useState(false);

  const S = useRef({
    player: { x: 1.5, y: 1.5, angle: 0.3 },
    keys: {} as Record<string, boolean>,
    mouseX: 0,
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    score: 0,
    hp: 100,
    ammo: 30,
    gameOver: false,
    shootCooldown: 0,
    gunRecoil: 0,
    gunSway: 0,
    gunSwayDir: 1,
    lastSpawn: 0,
    bobPhase: 0,
    hitFlash: 0,
  });

  const initEnemies = useCallback(() => {
    S.current.enemies = [
      { x: 5.5, y: 2.5, hp: 3, alive: true, shootCooldown: 120, hitFlash: 0, walkPhase: 0 },
      { x: 9.5, y: 5.5, hp: 3, alive: true, shootCooldown: 180, hitFlash: 0, walkPhase: 1 },
      { x: 5.5, y: 9.5, hp: 3, alive: true, shootCooldown: 90,  hitFlash: 0, walkPhase: 2 },
      { x: 2.5, y: 7.5, hp: 3, alive: true, shootCooldown: 150, hitFlash: 0, walkPhase: 0.5 },
      { x: 8.5, y: 9.5, hp: 3, alive: true, shootCooldown: 200, hitFlash: 0, walkPhase: 1.5 },
    ];
  }, []);

  const resetGame = useCallback(() => {
    const s = S.current;
    s.player = { x: 1.5, y: 1.5, angle: 0.3 };
    s.score = 0; s.hp = 100; s.ammo = 30;
    s.gameOver = false; s.shootCooldown = 0; s.gunRecoil = 0;
    s.particles = []; s.hitFlash = 0; s.lastSpawn = 0;
    initEnemies();
    setScore(0); setHp(100); setAmmo(30); setGameOver(false);
    setMuzzleFlash(false); setHitFlash(false);
  }, [initEnemies]);

  useEffect(() => {
    if (!started) return;
    initEnemies();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Pointer lock
    const requestLock = () => canvas.requestPointerLock?.();
    canvas.addEventListener("click", requestLock);

    const onMouseMove = (e: MouseEvent) => {
      S.current.player.angle += e.movementX * ROT_SPEED;
    };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      S.current.keys[e.code] = down;
      if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      shoot();
    };

    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
    canvas.addEventListener("mousedown", onMouseDown);

    function shoot() {
      const s = S.current;
      if (s.gameOver || s.shootCooldown > 0 || s.ammo <= 0) return;
      s.ammo--; setAmmo(s.ammo);
      s.shootCooldown = 18;
      s.gunRecoil = 14;
      setMuzzleFlash(true);
      setTimeout(() => setMuzzleFlash(false), 80);

      // Raycast center shot
      const angle = s.player.angle;
      let rx = s.player.x, ry = s.player.y;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      for (let i = 0; i < MAX_DEPTH * 20; i++) {
        rx += dx * 0.05; ry += dy * 0.05;
        if (mapAt(rx, ry) === 1) break;
        for (const e of s.enemies) {
          if (!e.alive) continue;
          const dist = Math.sqrt((e.x - rx) ** 2 + (e.y - ry) ** 2);
          if (dist < 0.35) {
            e.hp--;
            e.hitFlash = 12;
            // Blood particles
            for (let p = 0; p < 8; p++) {
              s.particles.push({ x: e.x, y: e.y, vx: (Math.random()-0.5)*0.08, vy: (Math.random()-0.5)*0.08, life: 30, color: "#ff2200" });
            }
            if (e.hp <= 0) {
              e.alive = false;
              s.score++; setScore(s.score);
              // Check win
              if (s.enemies.every(en => !en.alive)) {
                // Respawn all
                initEnemies();
              }
            }
            return;
          }
        }
      }
    }

    // Raycaster DDA
    function castRay(angle: number): { dist: number; side: number } {
      const p = S.current.player;
      let mapX = Math.floor(p.x), mapY = Math.floor(p.y);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const deltaX = Math.abs(1 / dx), deltaY = Math.abs(1 / dy);
      let stepX: number, stepY: number;
      let sideDistX: number, sideDistY: number;
      if (dx < 0) { stepX = -1; sideDistX = (p.x - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - p.x) * deltaX; }
      if (dy < 0) { stepY = -1; sideDistY = (p.y - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - p.y) * deltaY; }
      let side = 0;
      for (let i = 0; i < 64; i++) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (mapAt(mapX, mapY) === 1) {
          const dist = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
          return { dist, side };
        }
      }
      return { dist: MAX_DEPTH, side: 0 };
    }

    function project3DEnemy(e: Enemy) {
      const p = S.current.player;
      const dx = e.x - p.x, dy = e.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) - p.angle;
      let a = angle;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > FOV) return null;
      const screenX = (0.5 + a / FOV) * W;
      const h = H / dist * 0.9;
      return { screenX, h, dist, hitFlash: e.hitFlash > 0 };
    }

    // Z-buffer for walls
    const zBuffer = new Float32Array(W);

    function drawFrame(time: number) {
      const s = S.current;
      if (s.gameOver) { animRef.current = requestAnimationFrame(drawFrame); return; }

      // Input
      const keys = s.keys;
      const spd = PLAYER_SPEED;
      const cos = Math.cos(s.player.angle), sin = Math.sin(s.player.angle);
      let nx = s.player.x, ny = s.player.y;
      const moving = keys["KeyW"] || keys["ArrowUp"] || keys["KeyS"] || keys["ArrowDown"] || keys["KeyA"] || keys["KeyD"];
      if (keys["KeyW"] || keys["ArrowUp"]) { nx += cos * spd; ny += sin * spd; }
      if (keys["KeyS"] || keys["ArrowDown"]) { nx -= cos * spd; ny -= sin * spd; }
      if (keys["KeyA"]) { nx += sin * spd; ny -= cos * spd; }
      if (keys["KeyD"]) { nx -= sin * spd; ny += cos * spd; }
      if (keys["ArrowLeft"]) s.player.angle -= 0.035;
      if (keys["ArrowRight"]) s.player.angle += 0.035;
      if (mapAt(nx, s.player.y) === 0) s.player.x = nx;
      if (mapAt(s.player.x, ny) === 0) s.player.y = ny;

      // Bob
      if (moving) s.bobPhase += 0.12;
      const bobY = moving ? Math.sin(s.bobPhase) * 6 : 0;
      const bobX = moving ? Math.cos(s.bobPhase * 0.5) * 3 : 0;

      // Gun recoil
      if (s.gunRecoil > 0) s.gunRecoil -= 1.2;
      if (s.shootCooldown > 0) s.shootCooldown--;

      // Sway
      s.gunSway += s.gunSwayDir * 0.008;
      if (Math.abs(s.gunSway) > 0.5) s.gunSwayDir *= -1;

      // Enemy AI
      s.enemies.forEach(e => {
        if (!e.alive) return;
        e.walkPhase += 0.05;
        const dx = s.player.x - e.x, dy = s.player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) {
          const nx = e.x + (dx / dist) * 0.022;
          const ny = e.y + (dy / dist) * 0.022;
          if (mapAt(nx, e.y) === 0) e.x = nx;
          if (mapAt(e.x, ny) === 0) e.y = ny;
        }
        if (e.hitFlash > 0) e.hitFlash--;
        e.shootCooldown--;
        if (e.shootCooldown <= 0 && dist < 8) {
          e.shootCooldown = 100 + Math.random() * 80;
          if (dist < 6) {
            s.hp -= Math.floor(8 + Math.random() * 7);
            s.hitFlash = 12;
            setHp(Math.max(0, s.hp));
            setHitFlash(true);
            setTimeout(() => setHitFlash(false), 200);
            if (s.hp <= 0) { s.gameOver = true; setGameOver(true); }
          }
        }
      });

      // Particles
      s.particles = s.particles.filter(p => p.life > 0);
      s.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });

      // --- DRAW ---

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, HALF_H + bobY);
      sky.addColorStop(0, "#0a0a14");
      sky.addColorStop(1, "#1a0505");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, HALF_H + bobY);

      // Floor gradient
      const floor = ctx.createLinearGradient(0, HALF_H + bobY, 0, H);
      floor.addColorStop(0, "#1a0808");
      floor.addColorStop(1, "#080808");
      ctx.fillStyle = floor;
      ctx.fillRect(0, HALF_H + bobY, W, H);

      // Walls
      for (let ray = 0; ray < NUM_RAYS; ray++) {
        const rayAngle = s.player.angle - FOV / 2 + (ray / NUM_RAYS) * FOV;
        const { dist, side } = castRay(rayAngle);
        zBuffer[ray] = dist;
        const wallH = Math.min(H, (H / dist) * CELL);
        const top = HALF_H - wallH / 2 + bobY;
        const shade = Math.max(0, Math.min(1, 1 - dist / MAX_DEPTH));
        const r = side === 0 ? Math.floor(180 * shade) : Math.floor(120 * shade);
        const g = side === 0 ? Math.floor(20 * shade) : Math.floor(15 * shade);
        const b = side === 0 ? Math.floor(20 * shade) : Math.floor(15 * shade);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(ray, top, 1, wallH);
      }

      // Enemies (sorted by distance, farthest first)
      const aliveEnemies = s.enemies.filter(e => e.alive);
      aliveEnemies.sort((a, b) => {
        const da = (a.x - s.player.x) ** 2 + (a.y - s.player.y) ** 2;
        const db = (b.x - s.player.x) ** 2 + (b.y - s.player.y) ** 2;
        return db - da;
      });

      aliveEnemies.forEach(e => {
        const proj = project3DEnemy(e);
        if (!proj) return;
        const { screenX, h, dist, hitFlash } = proj;
        const sx = screenX - h * 0.5;
        const sy = HALF_H - h * 0.5 + bobY;
        const rayIdx = Math.floor(screenX);
        if (rayIdx < 0 || rayIdx >= W) return;
        if (zBuffer[rayIdx] < dist) return;

        const shade = Math.max(0.15, Math.min(1, 1 - dist / 10));

        // Body (3D soldier silhouette)
        // Torso
        const headR = h * 0.15;
        const bodyW = h * 0.38;
        const bodyH = h * 0.38;
        const legH = h * 0.28;
        const legW = h * 0.13;
        const cx = screenX;
        const cy = sy;
        const walkOff = Math.sin(e.walkPhase) * (h * 0.04);

        // Legs
        ctx.fillStyle = hitFlash ? `rgba(255,100,0,${shade})` : `rgba(${Math.floor(80*shade)},${Math.floor(30*shade)},${Math.floor(30*shade)},1)`;
        ctx.fillRect(cx - legW * 1.1, cy + bodyH + headR * 2 + walkOff, legW, legH);
        ctx.fillRect(cx + legW * 0.1, cy + bodyH + headR * 2 - walkOff, legW, legH);

        // Body
        ctx.fillStyle = hitFlash ? `rgba(255,150,0,${shade})` : `rgba(${Math.floor(120*shade)},${Math.floor(40*shade)},${Math.floor(40*shade)},1)`;
        ctx.fillRect(cx - bodyW / 2, cy + headR * 2, bodyW, bodyH);

        // Arms
        ctx.fillStyle = hitFlash ? `rgba(255,100,0,${shade})` : `rgba(${Math.floor(100*shade)},${Math.floor(35*shade)},${Math.floor(35*shade)},1)`;
        ctx.fillRect(cx - bodyW / 2 - legW + walkOff, cy + headR * 2.2, legW, bodyH * 0.7);
        ctx.fillRect(cx + bodyW / 2 - walkOff, cy + headR * 2.2, legW, bodyH * 0.7);

        // Gun in hand
        ctx.fillStyle = "#888";
        ctx.fillRect(cx + bodyW / 2 - walkOff, cy + headR * 2.5, legW * 0.5, bodyH * 0.4);
        ctx.fillRect(cx + bodyW / 2 - walkOff + legW * 0.2, cy + headR * 2.6, h * 0.18, legW * 0.3);

        // Head
        ctx.beginPath();
        ctx.arc(cx, cy + headR, headR, 0, Math.PI * 2);
        ctx.fillStyle = hitFlash ? `rgba(255,200,0,${shade})` : `rgba(${Math.floor(160*shade)},${Math.floor(60*shade)},${Math.floor(60*shade)},1)`;
        ctx.fill();

        // Eyes glow
        ctx.fillStyle = hitFlash ? "#fff" : `rgba(255,80,0,${shade * 0.9})`;
        ctx.fillRect(cx - headR * 0.45, cy + headR * 0.7, headR * 0.3, headR * 0.2);
        ctx.fillRect(cx + headR * 0.15, cy + headR * 0.7, headR * 0.3, headR * 0.2);

        // HP bar
        if (dist < 6) {
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(cx - h * 0.35, cy - 8, h * 0.7, 5);
          ctx.fillStyle = "#ff3b3b";
          ctx.fillRect(cx - h * 0.35, cy - 8, h * 0.7 * (e.hp / 3), 5);
        }
      });

      // --- GUN ---
      const gunX = W / 2 + 80 + bobX + s.gunSway * 8;
      const gunY = H - 140 + Math.max(0, s.gunRecoil) * 3 + Math.abs(bobY) * 0.5;

      ctx.save();
      ctx.translate(gunX, gunY);

      // Gun shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(-8, 22, 120, 14);

      // Magazine
      ctx.fillStyle = "#222";
      ctx.fillRect(18, 28, 14, 28);

      // Handle
      const handleGrad = ctx.createLinearGradient(10, 20, 40, 20);
      handleGrad.addColorStop(0, "#444");
      handleGrad.addColorStop(1, "#1a1a1a");
      ctx.fillStyle = handleGrad;
      ctx.fillRect(10, 20, 30, 50);

      // Body
      const bodyGrad = ctx.createLinearGradient(0, 0, 100, 0);
      bodyGrad.addColorStop(0, "#555");
      bodyGrad.addColorStop(0.4, "#888");
      bodyGrad.addColorStop(1, "#333");
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(-5, 5, 110, 22);

      // Barrel
      const barrelGrad = ctx.createLinearGradient(0, 0, 120, 0);
      barrelGrad.addColorStop(0, "#777");
      barrelGrad.addColorStop(1, "#2a2a2a");
      ctx.fillStyle = barrelGrad;
      ctx.fillRect(-5, 8, 130, 10);

      // Barrel tip
      ctx.fillStyle = "#111";
      ctx.fillRect(123, 6, 8, 14);

      // Scope/rail
      ctx.fillStyle = "#333";
      ctx.fillRect(10, 2, 70, 6);
      ctx.fillStyle = "#555";
      ctx.fillRect(20, 0, 30, 4);

      // Trigger guard
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(28, 30, 12, 0, Math.PI);
      ctx.stroke();

      // Muzzle flash
      if (muzzleFlash) {
        ctx.shadowColor = "#ffaa00";
        ctx.shadowBlur = 30;
        ctx.fillStyle = "#ffee00";
        ctx.beginPath();
        ctx.arc(126, 13, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(126, 13, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // Crosshair
      const cx2 = W / 2, cy2 = H / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx2 - 12, cy2); ctx.lineTo(cx2 - 4, cy2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2 + 4, cy2); ctx.lineTo(cx2 + 12, cy2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2 - 12); ctx.lineTo(cx2, cy2 - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy2 + 4); ctx.lineTo(cx2, cy2 + 12); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx2, cy2, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();

      // Hit flash
      if (s.hitFlash > 0) {
        s.hitFlash--;
        ctx.fillStyle = `rgba(200,0,0,${s.hitFlash / 30 * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Vignette
      const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.9);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      animRef.current = requestAnimationFrame(drawFrame);
    }

    animRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", requestLock);
      canvas.removeEventListener("mousedown", onMouseDown);
    };
  }, [started, initEnemies, muzzleFlash]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center select-none" style={{ fontFamily: "Montserrat, sans-serif" }}>
      {/* HUD */}
      <div className="flex items-center justify-between w-full max-w-[800px] px-2 mb-2">
        <button onClick={() => { document.exitPointerLock?.(); navigate("/"); }} className="text-neutral-600 hover:text-white text-xs uppercase tracking-widest transition-colors">
          ← Выйти
        </button>
        <div className="text-red-600 font-black text-base uppercase tracking-widest">Strike Zone</div>
        <div className="text-neutral-400 text-sm font-bold">Счёт: <span className="text-white">{score}</span></div>
      </div>

      <div className="relative" style={{ width: "100%", maxWidth: W }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full block" style={{ imageRendering: "pixelated" }} />

        {/* HP & Ammo bar */}
        {started && !gameOver && (
          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end pointer-events-none">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Здоровье</div>
              <div className="w-36 h-3 bg-neutral-900 border border-neutral-700">
                <div className="h-full bg-red-600 transition-all" style={{ width: `${Math.max(0, hp)}%` }} />
              </div>
              <div className="text-white font-black text-lg mt-0.5">{Math.max(0, hp)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Патроны</div>
              <div className="text-white font-black text-2xl">{ammo} <span className="text-neutral-600 text-sm">/ 30</span></div>
            </div>
          </div>
        )}

        {/* Hit flash overlay */}
        {hitFlash && (
          <div className="absolute inset-0 pointer-events-none border-4 border-red-600" style={{ boxShadow: "inset 0 0 60px rgba(200,0,0,0.5)" }} />
        )}

        {/* Start screen */}
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
            <div className="text-red-500 text-xs uppercase tracking-[0.4em] mb-3 font-semibold">Тактический шутер</div>
            <h1 className="text-6xl font-black uppercase text-white mb-2" style={{ textShadow: "0 0 40px #ff3b3b" }}>STRIKE ZONE</h1>
            <div className="text-neutral-500 text-sm mb-1 mt-4">WASD — движение&nbsp;&nbsp;|&nbsp;&nbsp;Мышь — обзор&nbsp;&nbsp;|&nbsp;&nbsp;ЛКМ — выстрел</div>
            <div className="text-neutral-600 text-xs mb-8">Нажми для захвата мыши</div>
            <button onClick={() => setStarted(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-12 py-4 text-xl transition-all">
              В БОЙ
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
            <h2 className="text-6xl font-black uppercase text-red-500 mb-2" style={{ textShadow: "0 0 30px #ff0000" }}>УБИТ</h2>
            <p className="text-white text-3xl font-bold mb-8">Счёт: {score}</p>
            <button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-12 py-4 text-xl transition-all">
              Ещё раз
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
