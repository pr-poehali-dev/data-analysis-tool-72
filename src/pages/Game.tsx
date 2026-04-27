import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const W = 800, H = 500;
const HALF_H = H / 2;
const FOV = Math.PI / 3;
const NUM_RAYS = W;
const MAX_DEPTH = 20;
const PLAYER_SPEED = 0.06;
const ROT_SPEED = 0.003;

const MAP_W = 14, MAP_H = 14;
const MAP: number[] = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,0,1,1,0,0,2,2,0,0,1,1,0,1,
  1,0,1,0,0,0,0,0,0,0,0,1,0,1,
  1,0,0,0,0,2,0,0,2,0,0,0,0,1,
  1,0,0,2,0,0,0,0,0,2,0,0,0,1,
  1,0,0,0,0,0,1,1,0,0,0,0,0,1,
  1,0,0,0,0,0,1,1,0,0,0,0,0,1,
  1,0,0,2,0,0,0,0,0,2,0,0,0,1,
  1,0,0,0,0,2,0,0,2,0,0,0,0,1,
  1,0,1,0,0,0,0,0,0,0,0,1,0,1,
  1,0,1,1,0,0,2,2,0,0,1,1,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,
];

function mapAt(x: number, y: number) {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return 1;
  return MAP[my * MAP_W + mx];
}

interface WeaponDef {
  id: string; name: string; price: number; damage: number;
  fireRate: number; ammo: number; maxAmmo: number;
  spread: number; auto: boolean; color: string; desc: string;
}

const WEAPONS: WeaponDef[] = [
  { id:"pistol",  name:"Пистолет", price:0,    damage:1, fireRate:18, ammo:15, maxAmmo:15, spread:0.01, auto:false, color:"#aaa", desc:"Стандартный" },
  { id:"smg",     name:"SMG",      price:800,  damage:1, fireRate:6,  ammo:25, maxAmmo:25, spread:0.04, auto:true,  color:"#5af", desc:"Пистолет-пулемёт" },
  { id:"rifle",   name:"Автомат",  price:1500, damage:2, fireRate:8,  ammo:30, maxAmmo:30, spread:0.02, auto:true,  color:"#fa5", desc:"Штурмовая винтовка" },
  { id:"shotgun", name:"Дробовик", price:1200, damage:1, fireRate:28, ammo:8,  maxAmmo:8,  spread:0.15, auto:false, color:"#f85", desc:"Мощный в упор" },
  { id:"sniper",  name:"Снайпер",  price:2000, damage:5, fireRate:40, ammo:5,  maxAmmo:5,  spread:0,    auto:false, color:"#5fa", desc:"Убивает с одного" },
];

interface Enemy {
  x:number; y:number; hp:number; alive:boolean;
  shootCooldown:number; hitFlash:number; walkPhase:number;
}

// ── Texture generators ────────────────────────────────────────────
function makeBrick(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#2a0e06"; ctx.fillRect(0,0,size,size);
  const bw=size/4, bh=size/3;
  for(let row=0;row<4;row++){
    const off=(row%2)*(bw/2);
    for(let col=-1;col<5;col++){
      const x=col*bw+off, y=row*bh;
      const rv=80+Math.floor(Math.random()*50), gv=25+Math.floor(Math.random()*20);
      ctx.fillStyle=`rgb(${rv},${gv},${gv*0.4|0})`; ctx.fillRect(x+1,y+1,bw-2,bh-2);
      ctx.fillStyle="rgba(255,160,100,0.06)"; ctx.fillRect(x+2,y+2,bw-4,3);
      ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(x,y,bw,1); ctx.fillRect(x,y,1,bh);
    }
  }
  for(let i=0;i<60;i++){ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.25})`;ctx.fillRect(Math.random()*size,Math.random()*size,2,2);}
  return c;
}

function makeConcrete(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#1e0c0c"; ctx.fillRect(0,0,size,size);
  for(let i=0;i<180;i++){
    const v=20+Math.random()*25;
    ctx.fillStyle=`rgba(${v*1.8|0},${v*0.6|0},${v*0.5|0},0.55)`;
    ctx.fillRect(Math.random()*size,Math.random()*size,2+Math.random()*3,2+Math.random()*3);
  }
  ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(Math.random()*size,Math.random()*size);ctx.lineTo(Math.random()*size,Math.random()*size);ctx.stroke();}
  return c;
}

function makeFloor(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#120606"; ctx.fillRect(0,0,size,size);
  const tw=size/2;
  for(let r=0;r<2;r++) for(let col=0;col<2;col++){
    const v=(r+col)%2===0?28:22;
    ctx.fillStyle=`rgb(${v+8},${v*0.45|0},${v*0.4|0})`;
    ctx.fillRect(col*tw+1,r*tw+1,tw-1,tw-1);
  }
  ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(tw,0);ctx.lineTo(tw,size);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,tw);ctx.lineTo(size,tw);ctx.stroke();
  return c;
}

function makeCeiling(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#080304"; ctx.fillRect(0,0,size,size);
  for(let i=0;i<100;i++){const v=10+Math.random()*15;ctx.fillStyle=`rgba(${v*1.5|0},${v*0.4|0},${v*0.3|0},0.4)`;ctx.fillRect(Math.random()*size,Math.random()*size,3,3);}
  ctx.strokeStyle="rgba(50,10,5,0.35)"; ctx.lineWidth=1;
  for(let x=0;x<size;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size);ctx.stroke();}
  for(let y=0;y<size;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}
  return c;
}

// ── Draw weapon ───────────────────────────────────────────────────
function drawWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponDef, bobX:number, bobY:number,
  gunRecoil:number, gunSway:number, flash:boolean, ammo:number
) {
  const gx=W/2+85+bobX+gunSway*6;
  const gy=H-155+Math.max(0,gunRecoil)*4+Math.abs(bobY)*0.4;
  ctx.save(); ctx.translate(gx,gy);

  if(weapon.id==="pistol"){
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(-4,38,100,10);
    const hg=ctx.createLinearGradient(5,14,40,60); hg.addColorStop(0,"#3e3e3e"); hg.addColorStop(0.5,"#585858"); hg.addColorStop(1,"#1c1c1c");
    ctx.fillStyle=hg; ctx.beginPath(); ctx.moveTo(10,18); ctx.lineTo(38,18); ctx.lineTo(42,65); ctx.lineTo(8,65); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
    for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(12,28+i*5);ctx.lineTo(36,28+i*5);ctx.stroke();}
    ctx.strokeStyle="#3a3a3a"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(26,30,13,0,Math.PI); ctx.stroke();
    ctx.strokeStyle="#777"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(26,18); ctx.lineTo(26,30); ctx.stroke();
    const sg=ctx.createLinearGradient(0,0,0,18); sg.addColorStop(0,"#6a6a6a"); sg.addColorStop(0.5,"#aaa"); sg.addColorStop(1,"#505050");
    ctx.fillStyle=sg; ctx.fillRect(-4,3,106,18);
    ctx.fillStyle="rgba(0,0,0,0.3)"; for(let i=0;i<6;i++) ctx.fillRect(60+i*5,4,2,16);
    const bg=ctx.createLinearGradient(0,8,0,16); bg.addColorStop(0,"#999"); bg.addColorStop(1,"#444");
    ctx.fillStyle=bg; ctx.fillRect(-4,8,118,10);
    ctx.fillStyle="#111"; ctx.fillRect(112,5,9,16);
    ctx.fillStyle="#1a1a1a"; ctx.beginPath(); ctx.arc(116,13,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#222"; ctx.fillRect(56,0,12,5); ctx.fillStyle="#ff0"; ctx.fillRect(60,1,4,3);
    ctx.fillStyle="#222"; ctx.fillRect(10,0,8,5); ctx.fillStyle="#0f0"; ctx.fillRect(13,1,3,3);
    ctx.fillStyle="#333"; ctx.fillRect(16,28,13,30); ctx.fillStyle="#555"; ctx.fillRect(17,29,5,26);

  } else if(weapon.id==="smg"){
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(-28,44,155,10);
    const stk=ctx.createLinearGradient(0,5,0,28); stk.addColorStop(0,"#484848"); stk.addColorStop(1,"#282828");
    ctx.fillStyle=stk; ctx.fillRect(-30,8,32,18); ctx.fillStyle="#181818"; ctx.fillRect(-32,10,5,14);
    const hg=ctx.createLinearGradient(10,15,38,55); hg.addColorStop(0,"#444"); hg.addColorStop(1,"#1e1e1e");
    ctx.fillStyle=hg; ctx.beginPath(); ctx.moveTo(10,15); ctx.lineTo(38,15); ctx.lineTo(42,60); ctx.lineTo(8,60); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1; for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(12,22+i*5);ctx.lineTo(36,22+i*5);ctx.stroke();}
    ctx.strokeStyle="#555"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(26,26,12,0,Math.PI); ctx.stroke();
    const bg=ctx.createLinearGradient(0,0,0,22); bg.addColorStop(0,"#686868"); bg.addColorStop(0.5,"#9a9a9a"); bg.addColorStop(1,"#484848");
    ctx.fillStyle=bg; ctx.fillRect(-28,5,145,22);
    ctx.fillStyle="#888"; ctx.fillRect(-28,9,150,10);
    ctx.fillStyle="#111"; ctx.fillRect(116,5,12,18);
    ctx.fillStyle="#333"; ctx.fillRect(0,1,90,5);
    for(let i=0;i<8;i++){ctx.fillStyle=i%2?"#444":"#555"; ctx.fillRect(5+i*10,0,9,4);}
    ctx.fillStyle="#2a2a2a"; ctx.fillRect(14,27,18,38); ctx.fillStyle="#444"; ctx.fillRect(15,28,7,35);
    const fg=ctx.createLinearGradient(58,22,72,55); fg.addColorStop(0,"#555"); fg.addColorStop(1,"#222");
    ctx.fillStyle=fg; ctx.beginPath(); ctx.moveTo(58,22); ctx.lineTo(72,22); ctx.lineTo(70,55); ctx.lineTo(60,55); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#222"; ctx.fillRect(40,0,22,7); ctx.fillStyle="#0af"; ctx.fillRect(48,1,6,5);

  } else if(weapon.id==="rifle"){
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(-38,46,178,10);
    const stk=ctx.createLinearGradient(0,5,0,30); stk.addColorStop(0,"#573010"); stk.addColorStop(1,"#2a1005");
    ctx.fillStyle=stk; ctx.fillRect(-40,7,42,22); ctx.fillStyle="#1a0a02"; ctx.fillRect(-42,9,4,18);
    ctx.fillStyle="#3a1a08"; ctx.fillRect(-38,25,40,4);
    const hg=ctx.createLinearGradient(10,12,38,58); hg.addColorStop(0,"#5a3012"); hg.addColorStop(1,"#2a1005");
    ctx.fillStyle=hg; ctx.beginPath(); ctx.moveTo(10,12); ctx.lineTo(40,12); ctx.lineTo(44,62); ctx.lineTo(8,62); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.lineWidth=1; for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(12,20+i*5);ctx.lineTo(38,20+i*5);ctx.stroke();}
    ctx.strokeStyle="#3a1a08"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(28,24,13,0,Math.PI); ctx.stroke();
    const rb=ctx.createLinearGradient(0,0,0,24); rb.addColorStop(0,"#5a3010"); rb.addColorStop(0.4,"#8a5020"); rb.addColorStop(1,"#3a1808");
    ctx.fillStyle=rb; ctx.fillRect(-38,5,158,24);
    const bar=ctx.createLinearGradient(0,9,0,18); bar.addColorStop(0,"#aaa"); bar.addColorStop(1,"#555");
    ctx.fillStyle=bar; ctx.fillRect(-38,9,168,12);
    ctx.fillStyle="#777"; ctx.fillRect(126,6,10,18);
    for(let i=0;i<3;i++){ctx.fillStyle="#111"; ctx.fillRect(127+i*2,7,1,16);}
    ctx.fillStyle="#111"; ctx.fillRect(136,9,6,12);
    ctx.fillStyle="#444"; ctx.fillRect(-30,6,80,4);
    const hgd=ctx.createLinearGradient(0,5,0,30); hgd.addColorStop(0,"#4a2808"); hgd.addColorStop(1,"#2a1004");
    ctx.fillStyle=hgd; ctx.fillRect(-30,6,75,22);
    ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1; for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-25+i*12,7);ctx.lineTo(-25+i*12,27);ctx.stroke();}
    ctx.fillStyle="#2a1005"; ctx.beginPath(); ctx.moveTo(16,28); ctx.lineTo(32,28); ctx.quadraticCurveTo(38,62,30,65); ctx.lineTo(18,65); ctx.quadraticCurveTo(10,62,16,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#4a2010"; ctx.fillRect(17,29,5,32);
    ctx.fillStyle="#333"; ctx.fillRect(15,1,70,5);
    for(let i=0;i<6;i++){ctx.fillStyle=i%2?"#444":"#555"; ctx.fillRect(18+i*10,0,8,4);}
    ctx.fillStyle="#2a1005"; ctx.fillRect(90,0,8,10); ctx.fillStyle="#fa5"; ctx.fillRect(93,2,3,4);

  } else if(weapon.id==="shotgun"){
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(-48,46,170,10);
    const stk=ctx.createLinearGradient(0,5,0,32); stk.addColorStop(0,"#5a3010"); stk.addColorStop(1,"#2a1005");
    ctx.fillStyle=stk; ctx.fillRect(-50,7,52,26); ctx.fillStyle="#2a1005"; ctx.fillRect(-52,10,5,18);
    const pg=ctx.createLinearGradient(8,12,36,58); pg.addColorStop(0,"#5a3010"); pg.addColorStop(1,"#2a1005");
    ctx.fillStyle=pg; ctx.beginPath(); ctx.moveTo(8,12); ctx.lineTo(36,12); ctx.lineTo(38,60); ctx.lineTo(6,60); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#3a1a08"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(22,24,12,0,Math.PI); ctx.stroke();
    const rb=ctx.createLinearGradient(0,4,0,32); rb.addColorStop(0,"#888"); rb.addColorStop(0.5,"#bbb"); rb.addColorStop(1,"#555");
    ctx.fillStyle=rb; ctx.fillRect(-48,4,155,28);
    ctx.fillStyle="#333"; ctx.fillRect(-48,17,155,2);
    ctx.fillStyle="#111"; ctx.fillRect(102,2,12,30);
    ctx.beginPath(); ctx.arc(108,8,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(108,22,4,0,Math.PI*2); ctx.fill();
    const pmp=ctx.createLinearGradient(0,5,0,28); pmp.addColorStop(0,"#4a2808"); pmp.addColorStop(1,"#2a1004");
    ctx.fillStyle=pmp; ctx.fillRect(-20,5,55,26);
    ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1; for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-16+i*12,6);ctx.lineTo(-16+i*12,28);ctx.stroke();}
    ctx.fillStyle="#fa0"; ctx.fillRect(36,8,6,14); ctx.fillRect(44,8,6,14);

  } else if(weapon.id==="sniper"){
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.fillRect(-58,46,215,10);
    const stk=ctx.createLinearGradient(0,5,0,30); stk.addColorStop(0,"#3a3a3a"); stk.addColorStop(1,"#1a1a1a");
    ctx.fillStyle=stk; ctx.fillRect(-60,8,62,22); ctx.fillStyle="#111"; ctx.fillRect(-62,10,4,18);
    ctx.fillStyle="#2a2a2a"; ctx.fillRect(-58,26,60,4); ctx.fillRect(-45,5,25,6);
    const hg=ctx.createLinearGradient(8,12,36,60); hg.addColorStop(0,"#444"); hg.addColorStop(1,"#1e1e1e");
    ctx.fillStyle=hg; ctx.beginPath(); ctx.moveTo(8,12); ctx.lineTo(36,12); ctx.lineTo(38,62); ctx.lineTo(6,62); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=1; for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(10,18+i*5);ctx.lineTo(34,18+i*5);ctx.stroke();}
    ctx.strokeStyle="#333"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(22,22,12,0,Math.PI); ctx.stroke();
    const rcv=ctx.createLinearGradient(0,0,0,24); rcv.addColorStop(0,"#606060"); rcv.addColorStop(0.5,"#999"); rcv.addColorStop(1,"#404040");
    ctx.fillStyle=rcv; ctx.fillRect(-58,6,200,22);
    const lb=ctx.createLinearGradient(0,9,0,19); lb.addColorStop(0,"#bbb"); lb.addColorStop(1,"#666");
    ctx.fillStyle=lb; ctx.fillRect(-58,9,210,12);
    ctx.fillStyle="#333"; ctx.fillRect(140,5,18,18);
    for(let i=0;i<5;i++){ctx.fillStyle="#222"; ctx.fillRect(141+i*3,6,2,16);}
    ctx.fillStyle="#111"; ctx.fillRect(158,8,6,12);
    ctx.strokeStyle="#555"; ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(110,26);ctx.lineTo(100,48);ctx.stroke();
    ctx.beginPath();ctx.moveTo(120,26);ctx.lineTo(130,48);ctx.stroke();
    ctx.fillStyle="#333"; ctx.fillRect(97,44,8,6); ctx.fillRect(127,44,8,6);
    ctx.fillStyle="#2a2a2a"; ctx.fillRect(18,28,12,25); ctx.fillStyle="#444"; ctx.fillRect(19,29,4,22);
    const scp=ctx.createLinearGradient(30,0,30,16); scp.addColorStop(0,"#555"); scp.addColorStop(0.5,"#888"); scp.addColorStop(1,"#333");
    ctx.fillStyle=scp; ctx.fillRect(30,-6,80,16);
    ctx.fillStyle="#001a33"; ctx.beginPath(); ctx.arc(35,4,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#0af"; ctx.globalAlpha=0.3; ctx.beginPath(); ctx.arc(35,4,6,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle="#001a33"; ctx.beginPath(); ctx.arc(105,4,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#0af"; ctx.globalAlpha=0.3; ctx.beginPath(); ctx.arc(105,4,6,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle="#444"; ctx.fillRect(62,-10,14,8); ctx.fillRect(68,10,8,14);
  }

  // Muzzle flash
  if(flash){
    const mx=weapon.id==="pistol"?116:weapon.id==="smg"?116:weapon.id==="rifle"?140:weapon.id==="shotgun"?108:160;
    ctx.shadowColor="#ffcc00"; ctx.shadowBlur=40;
    ctx.fillStyle="rgba(255,200,0,0.95)";
    for(let i=0;i<6;i++){ctx.save();ctx.translate(mx,13);ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(3,14);ctx.lineTo(-3,14);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.beginPath();ctx.arc(mx,13,8,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
    ctx.beginPath();ctx.arc(mx,13,4,0,Math.PI*2);ctx.fillStyle="#ffff80";ctx.fill();
    ctx.shadowBlur=0;
  }

  // Ammo dots
  const maxDots=Math.min(weapon.maxAmmo,20);
  const ratio=ammo/weapon.maxAmmo;
  for(let i=0;i<maxDots;i++){
    const filled=i<Math.round(ratio*maxDots);
    ctx.fillStyle=filled?(ratio>0.5?"#4ade80":"#fbbf24"):"#2a2a2a";
    ctx.beginPath();ctx.arc(-4+i*8,78,2.5,0,Math.PI*2);ctx.fill();
  }

  ctx.restore();
}

// ── Main ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const navigate=useNavigate();
  const animRef=useRef<number>(0);

  const [started,setStarted]=useState(false);
  const [gameOver,setGameOver]=useState(false);
  const [score,setScore]=useState(0);
  const [hp,setHp]=useState(100);
  const [ammo,setAmmo]=useState(15);
  const [flash,setFlash]=useState(false);
  const [hitFlash,setHitFlash]=useState(false);
  const [showShop,setShowShop]=useState(false);
  const [money,setMoney]=useState(0);
  const [currentWeapon,setCurrentWeapon]=useState<WeaponDef>(WEAPONS[0]);
  const [ownedWeapons,setOwnedWeapons]=useState<string[]>(["pistol"]);

  const textures=useRef<{brick:HTMLCanvasElement;concrete:HTMLCanvasElement;floor:HTMLCanvasElement;ceil:HTMLCanvasElement}|null>(null);

  const S=useRef({
    player:{x:1.5,y:1.5,angle:0.3},
    keys:{} as Record<string,boolean>,
    enemies:[] as Enemy[],
    score:0,hp:100,ammo:15,money:0,
    gameOver:false, shootCooldown:0, gunRecoil:0, gunSway:0, gunSwayDir:1,
    bobPhase:0, hitFlash:0, weapon:WEAPONS[0], autoFiring:false,
  });

  const initEnemies=useCallback(()=>{
    S.current.enemies=[
      {x:5.5,y:2.5,hp:3,alive:true,shootCooldown:120,hitFlash:0,walkPhase:0},
      {x:11.5,y:6.5,hp:3,alive:true,shootCooldown:180,hitFlash:0,walkPhase:1},
      {x:6.5,y:11.5,hp:3,alive:true,shootCooldown:90,hitFlash:0,walkPhase:2},
      {x:2.5,y:8.5,hp:3,alive:true,shootCooldown:150,hitFlash:0,walkPhase:0.5},
      {x:10.5,y:10.5,hp:3,alive:true,shootCooldown:200,hitFlash:0,walkPhase:1.5},
      {x:7.5,y:6.5,hp:4,alive:true,shootCooldown:160,hitFlash:0,walkPhase:0.8},
    ];
  },[]);

  const resetGame=useCallback(()=>{
    const s=S.current;
    s.player={x:1.5,y:1.5,angle:0.3};
    s.score=0;s.hp=100;s.ammo=s.weapon.maxAmmo;s.money=0;
    s.gameOver=false;s.shootCooldown=0;s.gunRecoil=0;s.hitFlash=0;
    initEnemies();
    setScore(0);setHp(100);setAmmo(s.weapon.maxAmmo);setMoney(0);setGameOver(false);
    setFlash(false);setHitFlash(false);setShowShop(false);
  },[initEnemies]);

  useEffect(()=>{
    textures.current={brick:makeBrick(64),concrete:makeConcrete(64),floor:makeFloor(64),ceil:makeCeiling(64)};
  },[]);

  useEffect(()=>{
    if(!started)return;
    initEnemies();
    const s=S.current;
    s.ammo=s.weapon.maxAmmo; setAmmo(s.weapon.maxAmmo);
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext("2d")!;

    const requestLock=()=>{ if(!showShop) canvas.requestPointerLock?.(); };
    canvas.addEventListener("click",requestLock);
    const onMouseMove=(e:MouseEvent)=>{ s.player.angle+=e.movementX*ROT_SPEED; };
    const onKeyDown=(e:KeyboardEvent)=>{
      s.keys[e.code]=true;
      if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
      if(e.code==="KeyR"){s.ammo=s.weapon.maxAmmo;setAmmo(s.ammo);}
    };
    const onKeyUp=(e:KeyboardEvent)=>{ s.keys[e.code]=false; };

    function shoot(){
      if(s.gameOver||s.shootCooldown>0||s.ammo<=0||showShop)return;
      const w=s.weapon;
      const pellets=w.id==="shotgun"?6:1;
      s.ammo--;setAmmo(s.ammo);
      s.shootCooldown=w.fireRate;
      s.gunRecoil=w.id==="sniper"?22:w.id==="shotgun"?18:12;
      setFlash(true); setTimeout(()=>setFlash(false),w.id==="sniper"?60:80);
      for(let p=0;p<pellets;p++){
        const sp=(Math.random()-0.5)*2*w.spread;
        const ang=s.player.angle+sp;
        let rx=s.player.x,ry=s.player.y;
        const dx=Math.cos(ang),dy=Math.sin(ang);
        let hit=false;
        for(let i=0;i<MAX_DEPTH*25&&!hit;i++){
          rx+=dx*0.04;ry+=dy*0.04;
          if(mapAt(rx,ry)===1){hit=true;break;}
          for(const e of s.enemies){
            if(!e.alive)continue;
            const dd=Math.sqrt((e.x-rx)**2+(e.y-ry)**2);
            if(dd<0.35){
              e.hp-=w.damage;e.hitFlash=12;hit=true;
              if(e.hp<=0){
                e.alive=false;s.score++;
                s.money+=200+Math.floor(Math.random()*100);
                setScore(s.score);setMoney(s.money);
                if(s.enemies.every(en=>!en.alive))setTimeout(()=>initEnemies(),800);
              }
              break;
            }
          }
        }
      }
    }

    const onMouseDown=(e:MouseEvent)=>{ if(e.button===0&&!showShop){s.autoFiring=true;shoot();} };
    const onMouseUp=()=>{ s.autoFiring=false; };
    document.addEventListener("mousemove",onMouseMove);
    window.addEventListener("keydown",onKeyDown);
    window.addEventListener("keyup",onKeyUp);
    canvas.addEventListener("mousedown",onMouseDown);
    window.addEventListener("mouseup",onMouseUp);

    function castRay(angle:number){
      const p=s.player;
      let mx=Math.floor(p.x),my=Math.floor(p.y);
      const dx=Math.cos(angle),dy=Math.sin(angle);
      const ddx=Math.abs(1/dx),ddy=Math.abs(1/dy);
      let sx:number,sy:number,sdx:number,sdy:number;
      if(dx<0){sx=-1;sdx=(p.x-mx)*ddx;}else{sx=1;sdx=(mx+1-p.x)*ddx;}
      if(dy<0){sy=-1;sdy=(p.y-my)*ddy;}else{sy=1;sdy=(my+1-p.y)*ddy;}
      let side=0;
      for(let i=0;i<64;i++){
        if(sdx<sdy){sdx+=ddx;mx+=sx;side=0;}else{sdy+=ddy;my+=sy;side=1;}
        const cell=mapAt(mx,my);
        if(cell===1||cell===2){
          const dist=side===0?sdx-ddx:sdy-ddy;
          const wx=side===0?(p.y+dist*dy)%1:(p.x+dist*dx)%1;
          return{dist,side,wallX:wx<0?wx+1:wx,cell};
        }
      }
      return{dist:MAX_DEPTH,side:0,wallX:0,cell:1};
    }

    function projectEnemy(e:Enemy){
      const p=s.player;
      const dx=e.x-p.x,dy=e.y-p.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      let a=Math.atan2(dy,dx)-p.angle;
      while(a>Math.PI)a-=Math.PI*2;
      while(a<-Math.PI)a+=Math.PI*2;
      if(Math.abs(a)>FOV*0.6)return null;
      return{screenX:(0.5+a/FOV)*W,h:H/dist*0.95,dist,hit:e.hitFlash>0};
    }

    const zBuf=new Float32Array(W);

    function frame(){
      const tx=textures.current;
      if(s.gameOver){animRef.current=requestAnimationFrame(frame);return;}

      const keys=s.keys;
      const spd=PLAYER_SPEED;
      const cos=Math.cos(s.player.angle),sin=Math.sin(s.player.angle);
      let nx=s.player.x,ny=s.player.y;
      const moving=!!(keys["KeyW"]||keys["ArrowUp"]||keys["KeyS"]||keys["ArrowDown"]||keys["KeyA"]||keys["KeyD"]);
      if(keys["KeyW"]||keys["ArrowUp"]){nx+=cos*spd;ny+=sin*spd;}
      if(keys["KeyS"]||keys["ArrowDown"]){nx-=cos*spd;ny-=sin*spd;}
      if(keys["KeyA"]){nx+=sin*spd;ny-=cos*spd;}
      if(keys["KeyD"]){nx-=sin*spd;ny+=cos*spd;}
      if(keys["ArrowLeft"])s.player.angle-=0.035;
      if(keys["ArrowRight"])s.player.angle+=0.035;
      if(mapAt(nx,s.player.y)===0)s.player.x=nx;
      if(mapAt(s.player.x,ny)===0)s.player.y=ny;

      if(moving)s.bobPhase+=0.11;
      const bobY=moving?Math.sin(s.bobPhase)*7:0;
      const bobX=moving?Math.cos(s.bobPhase*0.5)*3:0;
      if(s.gunRecoil>0)s.gunRecoil-=1.5;
      if(s.shootCooldown>0)s.shootCooldown--;
      s.gunSway+=s.gunSwayDir*0.007;
      if(Math.abs(s.gunSway)>0.6)s.gunSwayDir*=-1;
      if(s.autoFiring&&s.weapon.auto&&s.shootCooldown===0&&s.ammo>0)shoot();

      // Enemy AI
      s.enemies.forEach(e=>{
        if(!e.alive)return;
        e.walkPhase+=0.05;
        const dx=s.player.x-e.x,dy=s.player.y-e.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>0.5){
          const enx=e.x+(dx/dist)*0.02,eny=e.y+(dy/dist)*0.02;
          if(mapAt(enx,e.y)===0)e.x=enx;
          if(mapAt(e.x,eny)===0)e.y=eny;
        }
        if(e.hitFlash>0)e.hitFlash--;
        e.shootCooldown--;
        if(e.shootCooldown<=0&&dist<8){
          e.shootCooldown=90+Math.random()*70;
          if(dist<6){
            s.hp-=Math.floor(6+Math.random()*6);s.hitFlash=15;
            setHp(Math.max(0,s.hp));setHitFlash(true);
            setTimeout(()=>setHitFlash(false),200);
            if(s.hp<=0){s.gameOver=true;setGameOver(true);}
          }
        }
      });

      // Sky
      const skyG=ctx.createLinearGradient(0,0,0,HALF_H+bobY);
      skyG.addColorStop(0,"#050208");skyG.addColorStop(1,"#1a0508");
      ctx.fillStyle=skyG;ctx.fillRect(0,0,W,HALF_H+bobY);
      // Floor
      if(tx){
        const fp=ctx.createPattern(tx.floor,"repeat");
        if(fp){ctx.fillStyle=fp;ctx.fillRect(0,HALF_H+bobY,W,H);}
        ctx.fillStyle="rgba(0,0,0,0.55)";ctx.fillRect(0,HALF_H+bobY,W,H);
      } else {
        ctx.fillStyle="#150606";ctx.fillRect(0,HALF_H+bobY,W,H);
      }
      // Ceiling
      if(tx){
        const cp=ctx.createPattern(tx.ceil,"repeat");
        if(cp){ctx.fillStyle=cp;ctx.fillRect(0,0,W,HALF_H+bobY);}
        ctx.fillStyle="rgba(0,0,0,0.72)";ctx.fillRect(0,0,W,HALF_H+bobY);
      }

      // Walls
      for(let ray=0;ray<NUM_RAYS;ray++){
        const rayAng=s.player.angle-FOV/2+(ray/NUM_RAYS)*FOV;
        const{dist,side,wallX,cell}=castRay(rayAng);
        zBuf[ray]=dist;
        const wallH=Math.min(H,H/dist);
        const top=HALF_H-wallH/2+bobY;
        if(tx){
          const src=cell===2?tx.concrete:tx.brick;
          const texX=Math.floor(wallX*64);
          const shade=Math.max(0.08,1-dist/MAX_DEPTH);
          const dark=side===1?0.62:1.0;
          ctx.drawImage(src,texX,0,1,64,ray,top,1,wallH);
          ctx.fillStyle=`rgba(0,0,0,${1-shade*dark})`;
          ctx.fillRect(ray,top,1,wallH);
        } else {
          const shade=Math.max(0,1-dist/MAX_DEPTH)*(side===1?0.65:1);
          ctx.fillStyle=`rgb(${Math.floor(170*shade)},${Math.floor(18*shade)},${Math.floor(18*shade)})`;
          ctx.fillRect(ray,top,1,wallH);
        }
      }

      // Enemies
      const alive=s.enemies.filter(e=>e.alive).sort((a,b)=>{
        const da=(a.x-s.player.x)**2+(a.y-s.player.y)**2;
        const db=(b.x-s.player.x)**2+(b.y-s.player.y)**2;
        return db-da;
      });

      alive.forEach(e=>{
        const proj=projectEnemy(e);
        if(!proj)return;
        const{screenX,h,dist:ed,hit}=proj;
        const ri=Math.floor(screenX);
        if(ri<0||ri>=W||zBuf[ri]<ed)return;
        const sh=Math.max(0.2,Math.min(1,1-ed/10));
        const cx=screenX,cy=HALF_H-h*0.5+bobY;
        const hr=h*0.14,bw=h*0.35,bh=h*0.35,lh=h*0.26,lw=h*0.12;
        const wo=Math.sin(e.walkPhase)*(h*0.04);
        const col=(r:number,g:number,b:number)=>`rgba(${r*sh|0},${g*sh|0},${b*sh|0},1)`;
        const hc=hit?"rgba(255,120,0,1)":undefined;
        // Legs
        ctx.fillStyle=hc||col(65,18,18);
        ctx.fillRect(cx-lw*1.1,cy+bh+hr*2+wo,lw,lh);
        ctx.fillRect(cx+lw*0.1,cy+bh+hr*2-wo,lw,lh);
        ctx.fillStyle=hc||col(38,12,8);
        ctx.fillRect(cx-lw*1.2,cy+bh+hr*2+lh+wo,lw*1.2,lh*0.18);
        ctx.fillRect(cx,cy+bh+hr*2+lh-wo,lw*1.2,lh*0.18);
        // Belt
        ctx.fillStyle=hc||col(48,28,8);
        ctx.fillRect(cx-bw/2-2,cy+hr*2+bh*0.88,bw+4,h*0.04);
        // Body
        const bg2=ctx.createLinearGradient(cx-bw/2,0,cx+bw/2,0);
        bg2.addColorStop(0,hc||col(85,28,28));bg2.addColorStop(0.5,hc||col(125,42,42));bg2.addColorStop(1,hc||col(85,28,28));
        ctx.fillStyle=bg2;ctx.fillRect(cx-bw/2,cy+hr*2,bw,bh);
        if(!hit){ctx.fillStyle=col(55,18,18);ctx.fillRect(cx-bw*0.25,cy+hr*2.1,bw*0.5,bh*0.68);}
        // Arms
        ctx.fillStyle=hc||col(75,25,25);
        ctx.fillRect(cx-bw/2-lw+wo,cy+hr*2.2,lw,bh*0.72);
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.2,lw,bh*0.72);
        ctx.fillStyle=hc||col(170,110,72);
        ctx.fillRect(cx-bw/2-lw+wo,cy+hr*2.2+bh*0.68,lw,lw);
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.2+bh*0.68,lw,lw);
        // Enemy gun
        ctx.fillStyle=hc||"#777";
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.55,lw*0.5,bh*0.32);
        ctx.fillRect(cx+bw/2-wo+lw*0.12,cy+hr*2.65,h*0.15,lw*0.26);
        // Neck
        ctx.fillStyle=hc||col(155,95,65);ctx.fillRect(cx-hr*0.5,cy+hr*1.78,hr,hr*0.5);
        // Head
        const hg2=ctx.createRadialGradient(cx-hr*0.3,cy+hr*0.7,0,cx,cy+hr,hr);
        hg2.addColorStop(0,hc||col(195,125,88));hg2.addColorStop(1,hc||col(135,75,48));
        ctx.fillStyle=hg2;ctx.beginPath();ctx.arc(cx,cy+hr,hr,0,Math.PI*2);ctx.fill();
        // Helmet
        ctx.fillStyle=hc||col(55,18,18);
        ctx.beginPath();ctx.ellipse(cx,cy+hr*0.5,hr*1.1,hr*0.7,0,Math.PI,-Math.PI*2,true);ctx.fill();
        // Visor
        ctx.fillStyle=hit?"#ff0":"rgba(255,45,0,0.75)";
        ctx.fillRect(cx-hr*0.58,cy+hr*0.68,hr*1.16,hr*0.33);
        // Eyes
        ctx.shadowColor=hit?"#ff0":"#f40";ctx.shadowBlur=7;
        ctx.fillStyle=hit?"#fff":"rgba(255,70,0,1)";
        ctx.fillRect(cx-hr*0.44,cy+hr*0.73,hr*0.24,hr*0.19);
        ctx.fillRect(cx+hr*0.2,cy+hr*0.73,hr*0.24,hr*0.19);
        ctx.shadowBlur=0;
        // HP bar
        if(ed<7){
          ctx.fillStyle="rgba(0,0,0,0.75)";ctx.fillRect(cx-h*0.3,cy-10,h*0.6,5);
          ctx.fillStyle="#ef4444";ctx.fillRect(cx-h*0.3,cy-10,h*0.6*(e.hp/3),5);
        }
      });

      // Gun
      drawWeapon(ctx,s.weapon,bobX,bobY,s.gunRecoil,s.gunSway,flash,s.ammo);

      // Crosshair
      const chx=W/2,chy=H/2;
      ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(chx-14,chy);ctx.lineTo(chx-5,chy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx+5,chy);ctx.lineTo(chx+14,chy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx,chy-14);ctx.lineTo(chx,chy-5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx,chy+5);ctx.lineTo(chx,chy+14);ctx.stroke();
      ctx.beginPath();ctx.arc(chx,chy,2,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.8)";ctx.fill();

      // Hit overlay
      if(s.hitFlash>0){
        s.hitFlash--;
        ctx.fillStyle=`rgba(200,0,0,${s.hitFlash/30*0.4})`;ctx.fillRect(0,0,W,H);
      }
      // Vignette
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.25,W/2,H/2,H*0.85);
      vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(1,"rgba(0,0,0,0.7)");
      ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);

      animRef.current=requestAnimationFrame(frame);
    }

    animRef.current=requestAnimationFrame(frame);
    return()=>{
      cancelAnimationFrame(animRef.current);
      document.removeEventListener("mousemove",onMouseMove);
      window.removeEventListener("keydown",onKeyDown);
      window.removeEventListener("keyup",onKeyUp);
      canvas.removeEventListener("click",requestLock);
      canvas.removeEventListener("mousedown",onMouseDown);
      window.removeEventListener("mouseup",onMouseUp);
    };
  },[started,initEnemies,flash,showShop]);

  const buyWeapon=(w:WeaponDef)=>{
    const owned=ownedWeapons.includes(w.id);
    if(!owned&&money<w.price)return;
    const nm=owned?money:money-w.price;
    S.current.money=nm;S.current.weapon=w;S.current.ammo=w.maxAmmo;
    setMoney(nm);setCurrentWeapon(w);setAmmo(w.maxAmmo);
    if(!owned)setOwnedWeapons(p=>[...p,w.id]);
    setShowShop(false);
    canvasRef.current?.requestPointerLock?.();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center select-none" style={{fontFamily:"Montserrat,sans-serif"}}>
      <div className="flex items-center justify-between w-full max-w-[800px] px-2 mb-2">
        <button onClick={()=>{document.exitPointerLock?.();navigate("/");}} className="text-neutral-600 hover:text-white text-xs uppercase tracking-widest transition-colors">← Выйти</button>
        <div className="text-red-600 font-black text-base uppercase tracking-widest">Strike Zone</div>
        <div className="flex gap-4 text-sm">
          <span className="text-yellow-400 font-bold">💰 {money}$</span>
          <span className="text-neutral-400">Очки: <span className="text-white font-bold">{score}</span></span>
        </div>
      </div>

      <div className="relative" style={{width:"100%",maxWidth:W}}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full block" style={{imageRendering:"pixelated"}} />

        {started&&!gameOver&&(
          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end pointer-events-none">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Здоровье</div>
              <div className="w-36 h-3 bg-neutral-900 border border-neutral-800">
                <div className="h-full transition-all" style={{width:`${Math.max(0,hp)}%`,background:hp>50?"#22c55e":hp>25?"#f59e0b":"#ef4444"}} />
              </div>
              <div className="text-white font-black text-lg mt-0.5">{Math.max(0,hp)}</div>
            </div>
            <div className="pointer-events-auto">
              <button onClick={()=>{document.exitPointerLock?.();setShowShop(true);}} className="bg-yellow-600 hover:bg-yellow-500 text-black font-black text-xs uppercase tracking-widest px-3 py-1.5 transition-all">
                🛒 Магазин [B]
              </button>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-500 uppercase mb-1">{currentWeapon.name}</div>
              <div className="text-white font-black text-2xl">{ammo}<span className="text-neutral-600 text-base"> / {currentWeapon.maxAmmo}</span></div>
              <div className="text-neutral-600 text-xs">[R] перезарядка</div>
            </div>
          </div>
        )}

        {hitFlash&&<div className="absolute inset-0 pointer-events-none border-4 border-red-600" style={{boxShadow:"inset 0 0 60px rgba(200,0,0,0.5)"}} />}

        {/* Shop */}
        {showShop&&(
          <div className="absolute inset-0 bg-black/93 flex flex-col items-center justify-center p-6 z-20">
            <div className="text-yellow-400 font-black text-2xl uppercase tracking-widest mb-1">Магазин оружия</div>
            <div className="text-neutral-500 text-sm mb-5">Баланс: <span className="text-yellow-400 font-bold">{money}$</span></div>
            <div className="grid grid-cols-5 gap-3 w-full mb-6">
              {WEAPONS.map(w=>{
                const owned=ownedWeapons.includes(w.id);
                const active=currentWeapon.id===w.id;
                const canBuy=owned||money>=w.price;
                return(
                  <button key={w.id} onClick={()=>buyWeapon(w)}
                    className={`flex flex-col items-center p-3 border transition-all ${active?"border-yellow-500 bg-yellow-900/30":owned?"border-green-700 bg-green-900/20":"border-neutral-800 bg-neutral-900"} ${canBuy?"hover:border-yellow-400 cursor-pointer":"opacity-40 cursor-not-allowed"}`}>
                    <div className="text-3xl mb-1">🔫</div>
                    <div className="text-white font-bold text-xs uppercase tracking-wide">{w.name}</div>
                    <div className="text-neutral-500 text-xs mt-1 text-center leading-tight">{w.desc}</div>
                    <div className="mt-2 text-xs font-bold">
                      {active?<span className="text-yellow-400">✓ Активно</span>:owned?<span className="text-green-400">Взять</span>:<span className="text-yellow-300">{w.price}$</span>}
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">{w.auto?"AUTO":"SEMI"} · {w.ammo}п · {w.damage}дмг</div>
                  </button>
                );
              })}
            </div>
            <button onClick={()=>{setShowShop(false);canvasRef.current?.requestPointerLock?.();}} className="bg-red-700 hover:bg-red-600 text-white font-black uppercase tracking-widest px-10 py-3 text-sm">
              Закрыть
            </button>
          </div>
        )}

        {!started&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/93">
            <div className="text-red-500 text-xs uppercase tracking-[0.4em] mb-3 font-semibold">Тактический шутер 3D</div>
            <h1 className="text-6xl font-black uppercase text-white mb-2" style={{textShadow:"0 0 40px #ff3b3b"}}>STRIKE ZONE</h1>
            <div className="text-neutral-500 text-sm mt-4 mb-1">WASD — движение &nbsp;|&nbsp; Мышь — обзор &nbsp;|&nbsp; ЛКМ — выстрел</div>
            <div className="text-neutral-600 text-xs mb-2">R — перезарядка &nbsp;|&nbsp; B — магазин оружия</div>
            <div className="text-neutral-700 text-xs mb-8">Убивай врагов → получай деньги → покупай новое оружие</div>
            <button onClick={()=>setStarted(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-12 py-4 text-xl transition-all">В БОЙ</button>
          </div>
        )}

        {gameOver&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
            <h2 className="text-6xl font-black uppercase text-red-500 mb-2" style={{textShadow:"0 0 30px #ff0000"}}>УБИТ</h2>
            <p className="text-white text-3xl font-bold mb-2">Счёт: {score}</p>
            <p className="text-yellow-400 font-bold mb-8">Заработано: {money}$</p>
            <button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-12 py-4 text-xl transition-all">Ещё раз</button>
          </div>
        )}
      </div>
    </div>
  );
}
