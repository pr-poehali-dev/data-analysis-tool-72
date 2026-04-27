import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const CANVAS_W = 800;
const CANVAS_H = 600;
const PLAYER_R = 18;
const ENEMY_R = 18;
const BULLET_R = 5;
const PLAYER_SPEED = 4;
const BULLET_SPEED = 10;
const ENEMY_SPEED = 1.4;
const MAX_ENEMIES = 6;
const ENEMY_SPAWN_INTERVAL = 2000;

interface Vec2 { x: number; y: number }
interface Bullet { x: number; y: number; vx: number; vy: number; fromPlayer: boolean }
interface Enemy { x: number; y: number; hp: number; shootCooldown: number }

function dist(a: Vec2, b: Vec2) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const stateRef = useRef({
    player: { x: CANVAS_W / 2, y: CANVAS_H / 2, hp: 5 },
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    keys: {} as Record<string, boolean>,
    mouse: { x: CANVAS_W / 2, y: CANVAS_H / 2 },
    score: 0,
    gameOver: false,
    lastSpawn: 0,
    shootCooldown: 0,
  });

  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(5);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const animRef = useRef<number>(0);

  const spawnEnemy = useCallback(() => {
    const s = stateRef.current;
    if (s.enemies.length >= MAX_ENEMIES) return;
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = Math.random() * CANVAS_W; y = -ENEMY_R; }
    else if (side === 1) { x = CANVAS_W + ENEMY_R; y = Math.random() * CANVAS_H; }
    else if (side === 2) { x = Math.random() * CANVAS_W; y = CANVAS_H + ENEMY_R; }
    else { x = -ENEMY_R; y = Math.random() * CANVAS_H; }
    s.enemies.push({ x, y, hp: 2, shootCooldown: Math.random() * 120 + 60 });
  }, []);

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.player = { x: CANVAS_W / 2, y: CANVAS_H / 2, hp: 5 };
    s.bullets = [];
    s.enemies = [];
    s.score = 0;
    s.gameOver = false;
    s.lastSpawn = 0;
    s.shootCooldown = 0;
    setScore(0);
    setHp(5);
    setGameOver(false);
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      stateRef.current.keys[e.key.toLowerCase()] = down;
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      stateRef.current.mouse = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };
    const onClick = () => {
      const s = stateRef.current;
      if (s.gameOver || s.shootCooldown > 0) return;
      const angle = Math.atan2(s.mouse.y - s.player.y, s.mouse.x - s.player.x);
      s.bullets.push({ x: s.player.x, y: s.player.y, vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED, fromPlayer: true });
      s.shootCooldown = 15;
    };

    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("click", onClick);

    let lastTime = 0;

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      const s = stateRef.current;
      if (s.gameOver) { animRef.current = requestAnimationFrame(loop); return; }

      // Spawn
      if (time - s.lastSpawn > ENEMY_SPAWN_INTERVAL) { spawnEnemy(); s.lastSpawn = time; }

      // Move player
      const keys = s.keys;
      if (keys["w"] || keys["arrowup"])    s.player.y = Math.max(PLAYER_R, s.player.y - PLAYER_SPEED);
      if (keys["s"] || keys["arrowdown"])  s.player.y = Math.min(CANVAS_H - PLAYER_R, s.player.y + PLAYER_SPEED);
      if (keys["a"] || keys["arrowleft"])  s.player.x = Math.max(PLAYER_R, s.player.x - PLAYER_SPEED);
      if (keys["d"] || keys["arrowright"]) s.player.x = Math.min(CANVAS_W - PLAYER_R, s.player.x + PLAYER_SPEED);
      if (s.shootCooldown > 0) s.shootCooldown--;

      // Move bullets
      s.bullets = s.bullets.filter(b => b.x > -20 && b.x < CANVAS_W + 20 && b.y > -20 && b.y < CANVAS_H + 20);
      s.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });

      // Move enemies & shoot
      s.enemies.forEach(e => {
        const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
        e.x += Math.cos(angle) * ENEMY_SPEED;
        e.y += Math.sin(angle) * ENEMY_SPEED;
        e.shootCooldown--;
        if (e.shootCooldown <= 0) {
          s.bullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4, fromPlayer: false });
          e.shootCooldown = 80 + Math.random() * 60;
        }
      });

      // Bullet-enemy collisions
      s.bullets = s.bullets.filter(b => {
        if (!b.fromPlayer) return true;
        let hit = false;
        s.enemies = s.enemies.filter(e => {
          if (dist(b, e) < BULLET_R + ENEMY_R) { e.hp--; hit = true; return e.hp > 0; }
          return true;
        });
        if (hit) { s.score++; setScore(s.score); }
        return !hit;
      });

      // Bullet-player collisions
      s.bullets = s.bullets.filter(b => {
        if (b.fromPlayer) return true;
        if (dist(b, s.player) < BULLET_R + PLAYER_R) {
          s.player.hp--;
          setHp(s.player.hp);
          if (s.player.hp <= 0) { s.gameOver = true; setGameOver(true); }
          return false;
        }
        return true;
      });

      // Enemy-player collision
      s.enemies.forEach(e => {
        if (dist(e, s.player) < ENEMY_R + PLAYER_R) {
          s.player.hp = 0; s.gameOver = true; setGameOver(true);
        }
      });

      // Draw
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Grid
      ctx.strokeStyle = "rgba(255,50,50,0.07)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < CANVAS_W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke(); }
      for (let gy = 0; gy < CANVAS_H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke(); }

      // Bullets
      s.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
        ctx.fillStyle = b.fromPlayer ? "#ff3b3b" : "#ffaa00";
        ctx.shadowColor = b.fromPlayer ? "#ff3b3b" : "#ffaa00";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Enemies
      s.enemies.forEach(e => {
        ctx.beginPath();
        ctx.arc(e.x, e.y, ENEMY_R, 0, Math.PI * 2);
        ctx.fillStyle = e.hp === 2 ? "#cc2200" : "#ff6644";
        ctx.shadowColor = "#ff3b3b";
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ff3b3b";
        ctx.lineWidth = 2;
        ctx.stroke();
        // HP bar
        ctx.fillStyle = "#333";
        ctx.fillRect(e.x - 18, e.y - 28, 36, 5);
        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(e.x - 18, e.y - 28, 36 * (e.hp / 2), 5);
      });

      // Player
      const angle = Math.atan2(s.mouse.y - s.player.y, s.mouse.x - s.player.x);
      ctx.save();
      ctx.translate(s.player.x, s.player.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.fillStyle = "#1a8cff";
      ctx.shadowColor = "#1a8cff";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Gun
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, -4, PLAYER_R + 8, 8);
      ctx.restore();

      // Crosshair
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.mouse.x - 10, s.mouse.y); ctx.lineTo(s.mouse.x + 10, s.mouse.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.mouse.x, s.mouse.y - 10); ctx.lineTo(s.mouse.x, s.mouse.y + 10); ctx.stroke();

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("click", onClick);
    };
  }, [started, spawnEnemy]);

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center" style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div className="flex items-center justify-between w-full max-w-[800px] px-2 mb-3">
        <button onClick={() => navigate("/")} className="text-neutral-500 hover:text-white text-xs uppercase tracking-widest transition-colors">
          ← Назад
        </button>
        <div className="text-red-500 font-black text-lg uppercase tracking-widest">Strike Zone</div>
        <div className="flex gap-6 text-sm">
          <span className="text-neutral-400">Очки: <span className="text-white font-bold">{score}</span></span>
          <span className="text-neutral-400">HP: <span className="text-red-400 font-bold">{"❤️".repeat(Math.max(0, hp))}</span></span>
        </div>
      </div>

      <div className="relative" style={{ width: "100%", maxWidth: 800 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full border border-red-900 cursor-none"
          style={{ display: "block", background: "#0a0a0a" }}
        />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <h1 className="text-5xl font-black uppercase text-white mb-3" style={{ textShadow: "0 0 30px #ff3b3b" }}>STRIKE ZONE</h1>
            <p className="text-neutral-400 text-sm mb-2">WASD / стрелки — движение</p>
            <p className="text-neutral-400 text-sm mb-8">Мышь — прицел, клик — выстрел</p>
            <button
              onClick={() => setStarted(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-10 py-4 text-lg transition-all"
            >
              В БОЙ
            </button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <h2 className="text-5xl font-black uppercase text-red-500 mb-2">УБИТ</h2>
            <p className="text-white text-2xl font-bold mb-8">Счёт: {score}</p>
            <button
              onClick={() => { resetGame(); setStarted(true); }}
              className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-10 py-4 text-lg transition-all"
            >
              Ещё раз
            </button>
          </div>
        )}
      </div>

      <p className="text-neutral-700 text-xs mt-3 uppercase tracking-widest">Выживи как можно дольше</p>
    </div>
  );
}
