import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const W = 800, H = 500;
const HALF_H = H / 2;
const FOV = Math.PI / 3;
const NUM_RAYS = W;
const MAX_DEPTH = 22;
const PLAYER_SPEED = 0.06;
const ROT_SPEED = 0.0028;

const MAP_W = 16, MAP_H = 16;
const MAP: number[] = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,0,1,1,0,0,2,0,0,2,0,0,1,1,0,1,
  1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1,
  1,0,0,0,2,0,0,0,0,0,0,2,0,0,0,1,
  1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,
  1,0,2,0,0,1,0,0,0,0,1,0,0,2,0,1,
  1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
  1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,
  1,0,2,0,0,1,0,0,0,0,1,0,0,2,0,1,
  1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,
  1,0,0,0,2,0,0,0,0,0,0,2,0,0,0,1,
  1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1,
  1,0,1,1,0,0,2,0,0,2,0,0,1,1,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
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
  { id:"pistol",  name:"Пистолет", price:0,    damage:25,  fireRate:18, ammo:15, maxAmmo:15, spread:0.01, auto:false, color:"#aaa", desc:"Стандартный" },
  { id:"smg",     name:"SMG",      price:800,  damage:18,  fireRate:6,  ammo:25, maxAmmo:25, spread:0.04, auto:true,  color:"#5af", desc:"Пистолет-пулемёт" },
  { id:"rifle",   name:"Автомат",  price:1500, damage:35,  fireRate:8,  ammo:30, maxAmmo:30, spread:0.02, auto:true,  color:"#fa5", desc:"Штурмовая винтовка" },
  { id:"shotgun", name:"Дробовик", price:1200, damage:22,  fireRate:28, ammo:8,  maxAmmo:8,  spread:0.15, auto:false, color:"#f85", desc:"Мощный в упор" },
  { id:"sniper",  name:"Снайпер",  price:2000, damage:120, fireRate:40, ammo:5,  maxAmmo:5,  spread:0,    auto:false, color:"#5fa", desc:"Убивает с одного" },
];

// Bot states
type BotState = "patrol"|"chase"|"shoot"|"strafe"|"retreat";

interface BloodParticle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number;
}

interface DamageLabel {
  worldX: number; worldY: number; value: number; life: number; headshot: boolean;
}

interface Enemy {
  x: number; y: number; hp: number; maxHp: number; alive: boolean;
  shootCooldown: number; hitFlash: number; walkPhase: number;
  state: BotState; stateTimer: number;
  strafeDir: number; patrolAngle: number;
  id: number;
}

// ── Textures ─────────────────────────────────────────────────────
function makeBrick(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#250c05"; ctx.fillRect(0,0,size,size);
  const bw=size/4, bh=size/3;
  for(let row=0;row<5;row++){
    const off=(row%2)*(bw/2);
    for(let col=-1;col<6;col++){
      const x=col*bw+off, y=row*bh;
      const rv=75+Math.random()*45|0, gv=22+Math.random()*18|0;
      ctx.fillStyle=`rgb(${rv},${gv},${gv*0.35|0})`; ctx.fillRect(x+1,y+1,bw-2,bh-2);
      // Highlight top
      ctx.fillStyle="rgba(255,180,100,0.09)"; ctx.fillRect(x+2,y+2,bw-4,2);
      // Shadow bottom
      ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillRect(x+1,y+bh-3,bw-2,2);
      // Mortar
      ctx.strokeStyle="#100503"; ctx.lineWidth=1.5;
      ctx.strokeRect(x+0.5,y+0.5,bw-1,bh-1);
    }
  }
  // Grunge overlay
  for(let i=0;i<80;i++){
    ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.22})`;
    ctx.fillRect(Math.random()*size,Math.random()*size,1+Math.random()*3,1+Math.random()*3);
  }
  return c;
}

function makeConcrete(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#1c0a0a"; ctx.fillRect(0,0,size,size);
  for(let i=0;i<250;i++){
    const v=12+Math.random()*22;
    ctx.fillStyle=`rgba(${v*1.6|0},${v*0.55|0},${v*0.4|0},0.5)`;
    ctx.fillRect(Math.random()*size,Math.random()*size,1+Math.random()*4,1+Math.random()*4);
  }
  ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=0.8;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(Math.random()*size,Math.random()*size);ctx.lineTo(Math.random()*size,Math.random()*size);ctx.stroke();}
  return c;
}

function makeFloor(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#0f0404"; ctx.fillRect(0,0,size,size);
  const tw=size/2;
  for(let r=0;r<2;r++) for(let col=0;col<2;col++){
    const v=(r+col)%2===0?24:18;
    ctx.fillStyle=`rgb(${v+6},${v*0.4|0},${v*0.35|0})`;
    ctx.fillRect(col*tw+1,r*tw+1,tw-2,tw-2);
  }
  ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(tw,0);ctx.lineTo(tw,size);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,tw);ctx.lineTo(size,tw);ctx.stroke();
  return c;
}

function makeCeiling(size=64): HTMLCanvasElement {
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#060202"; ctx.fillRect(0,0,size,size);
  for(let i=0;i<120;i++){const v=8+Math.random()*12;ctx.fillStyle=`rgba(${v*1.4|0},${v*0.35|0},${v*0.25|0},0.4)`;ctx.fillRect(Math.random()*size,Math.random()*size,2,2);}
  ctx.strokeStyle="rgba(40,8,5,0.4)"; ctx.lineWidth=0.8;
  for(let x=0;x<size;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size);ctx.stroke();}
  for(let y=0;y<size;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}
  return c;
}

// ── Weapon draw ───────────────────────────────────────────────────
function drawWeapon(ctx:CanvasRenderingContext2D,w:WeaponDef,bobX:number,bobY:number,recoil:number,sway:number,flash:boolean,ammo:number){
  const gx=W/2+82+bobX+sway*6;
  const gy=H-152+Math.max(0,recoil)*4+Math.abs(bobY)*0.4;
  ctx.save(); ctx.translate(gx,gy);

  if(w.id==="pistol"){
    ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(-4,36,100,10);
    const hg=ctx.createLinearGradient(5,14,40,60); hg.addColorStop(0,"#3e3e3e"); hg.addColorStop(0.5,"#565656"); hg.addColorStop(1,"#1c1c1c");
    ctx.fillStyle=hg; ctx.beginPath(); ctx.moveTo(10,18); ctx.lineTo(38,18); ctx.lineTo(42,65); ctx.lineTo(8,65); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
    for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(12,28+i*5);ctx.lineTo(36,28+i*5);ctx.stroke();}
    ctx.strokeStyle="#3a3a3a"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(26,30,13,0,Math.PI); ctx.stroke();
    ctx.strokeStyle="#777"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(26,18); ctx.lineTo(26,30); ctx.stroke();
    const sg=ctx.createLinearGradient(0,0,0,18); sg.addColorStop(0,"#6a6a6a"); sg.addColorStop(0.5,"#aaa"); sg.addColorStop(1,"#505050");
    ctx.fillStyle=sg; ctx.fillRect(-4,3,106,18);
    ctx.fillStyle="rgba(0,0,0,0.28)"; for(let i=0;i<6;i++) ctx.fillRect(60+i*5,4,2,16);
    const bg=ctx.createLinearGradient(0,8,0,16); bg.addColorStop(0,"#999"); bg.addColorStop(1,"#444");
    ctx.fillStyle=bg; ctx.fillRect(-4,8,118,10);
    ctx.fillStyle="#111"; ctx.fillRect(112,5,9,16);
    ctx.fillStyle="#1a1a1a"; ctx.beginPath(); ctx.arc(116,13,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#222"; ctx.fillRect(56,0,12,5); ctx.fillStyle="#ff0"; ctx.fillRect(60,1,4,3);
    ctx.fillStyle="#222"; ctx.fillRect(10,0,8,5); ctx.fillStyle="#0f0"; ctx.fillRect(13,1,3,3);
    ctx.fillStyle="#333"; ctx.fillRect(16,28,13,30); ctx.fillStyle="#555"; ctx.fillRect(17,29,5,26);
  } else if(w.id==="smg"){
    ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(-28,44,155,10);
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
  } else if(w.id==="rifle"){
    ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(-38,46,178,10);
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
  } else if(w.id==="shotgun"){
    ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(-48,46,170,10);
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
  } else if(w.id==="sniper"){
    ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(-58,46,215,10);
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
    const mx=w.id==="pistol"?116:w.id==="smg"?116:w.id==="rifle"?140:w.id==="shotgun"?108:160;
    ctx.shadowColor="#ffcc00"; ctx.shadowBlur=50;
    ctx.fillStyle="rgba(255,200,0,0.95)";
    for(let i=0;i<7;i++){ctx.save();ctx.translate(mx,13);ctx.rotate(i*Math.PI/3.5);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(3,16);ctx.lineTo(-3,16);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.beginPath();ctx.arc(mx,13,9,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
    ctx.beginPath();ctx.arc(mx,13,4,0,Math.PI*2);ctx.fillStyle="#ffff80";ctx.fill();
    ctx.shadowBlur=0;
  }
  // Ammo dots
  const maxDots=Math.min(w.maxAmmo,20);
  const ratio=ammo/w.maxAmmo;
  for(let i=0;i<maxDots;i++){
    const filled=i<Math.round(ratio*maxDots);
    ctx.fillStyle=filled?(ratio>0.5?"#4ade80":"#fbbf24"):"#2a2a2a";
    ctx.beginPath();ctx.arc(-4+i*8,80,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

// ── Mini-map ──────────────────────────────────────────────────────
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  player: {x:number;y:number;angle:number},
  enemies: Enemy[]
){
  const mx=W-95, my=H-95, ms=80, cs=ms/MAP_W;
  // Background
  ctx.fillStyle="rgba(0,0,0,0.72)"; ctx.fillRect(mx-2,my-2,ms+4,ms+4);
  ctx.strokeStyle="rgba(255,50,50,0.4)"; ctx.lineWidth=1; ctx.strokeRect(mx-2,my-2,ms+4,ms+4);
  // Cells
  for(let gy=0;gy<MAP_H;gy++) for(let gx2=0;gx2<MAP_W;gx2++){
    const v=MAP[gy*MAP_W+gx2];
    if(v===1) ctx.fillStyle="rgba(180,50,30,0.85)";
    else if(v===2) ctx.fillStyle="rgba(120,35,20,0.7)";
    else ctx.fillStyle="rgba(20,8,5,0.4)";
    ctx.fillRect(mx+gx2*cs,my+gy*cs,cs,cs);
  }
  // Grid lines
  ctx.strokeStyle="rgba(80,20,10,0.3)"; ctx.lineWidth=0.3;
  for(let i=0;i<=MAP_W;i++){ctx.beginPath();ctx.moveTo(mx+i*cs,my);ctx.lineTo(mx+i*cs,my+ms);ctx.stroke();}
  for(let i=0;i<=MAP_H;i++){ctx.beginPath();ctx.moveTo(mx,my+i*cs);ctx.lineTo(mx+ms,my+i*cs);ctx.stroke();}
  // Enemies
  enemies.filter(e=>e.alive).forEach(e=>{
    ctx.fillStyle="rgba(255,60,0,0.9)";
    ctx.beginPath();ctx.arc(mx+e.x*cs,my+e.y*cs,2.5,0,Math.PI*2);ctx.fill();
  });
  // Player dot + FOV cone
  const px=mx+player.x*cs, py=my+player.y*cs;
  ctx.strokeStyle="rgba(100,200,255,0.35)"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(px,py);
  ctx.lineTo(px+Math.cos(player.angle-FOV/2)*12,py+Math.sin(player.angle-FOV/2)*12);
  ctx.lineTo(px+Math.cos(player.angle+FOV/2)*12,py+Math.sin(player.angle+FOV/2)*12);
  ctx.closePath();ctx.stroke();
  ctx.fillStyle="rgba(100,200,255,0.1)";ctx.fill();
  ctx.fillStyle="#fff"; ctx.shadowColor="#5af"; ctx.shadowBlur=5;
  ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  // Label
  ctx.fillStyle="rgba(200,100,100,0.8)";ctx.font="7px monospace";ctx.fillText("MAP",mx+1,my+7);
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
  const [headshotMsg,setHeadshotMsg]=useState("");

  const textures=useRef<{brick:HTMLCanvasElement;concrete:HTMLCanvasElement;floor:HTMLCanvasElement;ceil:HTMLCanvasElement}|null>(null);

  const S=useRef({
    player:{x:1.5,y:1.5,angle:0.3},
    keys:{} as Record<string,boolean>,
    enemies:[] as Enemy[],
    blood:[] as BloodParticle[],
    labels:[] as DamageLabel[],
    score:0, hp:100, ammo:15, money:0,
    gameOver:false, shootCooldown:0, gunRecoil:0, gunSway:0, gunSwayDir:1,
    bobPhase:0, hitFlash:0, weapon:WEAPONS[0], autoFiring:false,
    frame:0,
  });

  const initEnemies=useCallback(()=>{
    S.current.enemies=[
      {x:5.5,y:2.5,hp:100,maxHp:100,alive:true,shootCooldown:120,hitFlash:0,walkPhase:0,state:"patrol",stateTimer:0,strafeDir:1,patrolAngle:0,id:0},
      {x:13.5,y:7.5,hp:100,maxHp:100,alive:true,shootCooldown:180,hitFlash:0,walkPhase:1,state:"patrol",stateTimer:0,strafeDir:-1,patrolAngle:1.5,id:1},
      {x:7.5,y:13.5,hp:100,maxHp:100,alive:true,shootCooldown:90,hitFlash:0,walkPhase:2,state:"patrol",stateTimer:0,strafeDir:1,patrolAngle:3,id:2},
      {x:2.5,y:9.5,hp:100,maxHp:100,alive:true,shootCooldown:150,hitFlash:0,walkPhase:0.5,state:"patrol",stateTimer:0,strafeDir:-1,patrolAngle:4.5,id:3},
      {x:11.5,y:11.5,hp:100,maxHp:100,alive:true,shootCooldown:200,hitFlash:0,walkPhase:1.5,state:"patrol",stateTimer:0,strafeDir:1,patrolAngle:2,id:4},
      {x:8.5,y:5.5,hp:100,maxHp:100,alive:true,shootCooldown:140,hitFlash:0,walkPhase:0.8,state:"patrol",stateTimer:0,strafeDir:-1,patrolAngle:0.8,id:5},
      {x:3.5,y:3.5,hp:100,maxHp:100,alive:true,shootCooldown:160,hitFlash:0,walkPhase:2.5,state:"patrol",stateTimer:0,strafeDir:1,patrolAngle:2.5,id:6},
    ];
  },[]);

  const resetGame=useCallback(()=>{
    const s=S.current;
    s.player={x:1.5,y:1.5,angle:0.3};
    s.score=0;s.hp=100;s.ammo=s.weapon.maxAmmo;s.money=0;
    s.gameOver=false;s.shootCooldown=0;s.gunRecoil=0;s.hitFlash=0;
    s.blood=[];s.labels=[];
    initEnemies();
    setScore(0);setHp(100);setAmmo(s.weapon.maxAmmo);setMoney(0);setGameOver(false);
    setFlash(false);setHitFlash(false);setShowShop(false);setHeadshotMsg("");
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

    function spawnBlood(x:number,y:number,count=18){
      for(let i=0;i<count;i++){
        const ang=Math.random()*Math.PI*2;
        const spd=0.02+Math.random()*0.06;
        s.blood.push({
          x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,
          life:40+Math.random()*30,maxLife:70,
          size:0.04+Math.random()*0.08,
        });
      }
    }

    function shoot(){
      if(s.gameOver||s.shootCooldown>0||s.ammo<=0||showShop)return;
      const w=s.weapon;
      const pellets=w.id==="shotgun"?7:1;
      s.ammo--;setAmmo(s.ammo);
      s.shootCooldown=w.fireRate;
      s.gunRecoil=w.id==="sniper"?24:w.id==="shotgun"?20:12;
      setFlash(true); setTimeout(()=>setFlash(false),w.id==="sniper"?55:75);

      for(let p=0;p<pellets;p++){
        const sp=(Math.random()-0.5)*2*w.spread;
        const ang=s.player.angle+sp;
        let rx=s.player.x,ry=s.player.y;
        const dx=Math.cos(ang),dy=Math.sin(ang);
        let hit=false;
        for(let i=0;i<MAX_DEPTH*30&&!hit;i++){
          rx+=dx*0.035;ry+=dy*0.035;
          if(mapAt(rx,ry)===1){hit=true;break;}
          for(const e of s.enemies){
            if(!e.alive)continue;
            const dd=Math.sqrt((e.x-rx)**2+(e.y-ry)**2);

            // Hitbox zones: head (top), body (middle), legs (bottom)
            // We project enemy height to determine zone
            const dist2=Math.sqrt((e.x-s.player.x)**2+(e.y-s.player.y)**2);
            const h=H/dist2*0.95;
            const cy=HALF_H-h*0.5;
            const headTop=cy, headBot=cy+h*0.3;
            const bodyBot=cy+h*0.7;

            if(dd<0.38){
              // Determine hit zone by checking ray height
              // Approximate: use distance to get expected screen Y
              const rayFrac=(rx-s.player.x)/(dx||0.0001);
              const screenY=HALF_H; // center aim
              let mult=1.0;
              let isHead=false;
              if(screenY>=headTop&&screenY<headBot){ mult=2.5; isHead=true; }
              else if(screenY>=headBot&&screenY<bodyBot){ mult=1.0; }
              else { mult=0.6; }

              const dmg=Math.round(w.damage*mult);
              e.hp-=dmg;
              e.hitFlash=15;
              hit=true;
              spawnBlood(e.x,e.y,isHead?30:18);

              // Damage label
              s.labels.push({worldX:e.x,worldY:e.y,value:dmg,life:60,headshot:isHead});
              if(isHead){setHeadshotMsg("ХЕДШОТ!");setTimeout(()=>setHeadshotMsg(""),1000);}

              if(e.hp<=0){
                e.alive=false;s.score++;
                s.money+=isHead?350:220;
                setScore(s.score);setMoney(s.money);
                if(s.enemies.every(en=>!en.alive))setTimeout(()=>initEnemies(),1000);
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
      for(let i=0;i<80;i++){
        if(sdx<sdy){sdx+=ddx;mx+=sx;side=0;}else{sdy+=ddy;my+=sy;side=1;}
        const cell=mapAt(mx,my);
        if(cell>=1){
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
      if(Math.abs(a)>FOV*0.62)return null;
      return{screenX:(0.5+a/FOV)*W,h:H/dist*0.95,dist,hit:e.hitFlash>0};
    }

    const zBuf=new Float32Array(W);

    function frame(){
      const tx=textures.current;
      s.frame++;
      if(s.gameOver){animRef.current=requestAnimationFrame(frame);return;}

      // Movement
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

      // ── Bot AI ──────────────────────────────────────────────────
      s.enemies.forEach(e=>{
        if(!e.alive)return;
        e.walkPhase+=0.05;
        if(e.hitFlash>0)e.hitFlash--;
        const pdx=s.player.x-e.x,pdy=s.player.y-e.y;
        const dist=Math.sqrt(pdx*pdx+pdy*pdy);
        e.stateTimer--;

        // State transitions
        if(dist<8 && e.state==="patrol"){ e.state="chase"; e.stateTimer=120; }
        if(dist<4 && e.state==="chase"){ e.state="shoot"; e.stateTimer=80; }
        if(dist<5 && e.state==="shoot" && e.stateTimer<0){ e.state="strafe"; e.stateTimer=40+Math.random()*40|0; }
        if(e.state==="strafe" && e.stateTimer<0){ e.state=dist<6?"shoot":"chase"; e.stateTimer=60; }
        if(e.hp<30 && dist<5 && e.state!=="retreat"){ e.state="retreat"; e.stateTimer=80; }
        if(e.state==="retreat" && e.stateTimer<0){ e.state="patrol"; e.stateTimer=100; }
        if(dist>10){ e.state="patrol"; }

        const esmove=0.018;
        if(e.state==="patrol"){
          e.patrolAngle+=0.012;
          const tnx=e.x+Math.cos(e.patrolAngle)*esmove;
          const tny=e.y+Math.sin(e.patrolAngle)*esmove;
          if(mapAt(tnx,e.y)===0)e.x=tnx; else e.patrolAngle+=0.5;
          if(mapAt(e.x,tny)===0)e.y=tny;
        } else if(e.state==="chase"){
          const enx=e.x+(pdx/dist)*esmove*1.2;
          const eny=e.y+(pdy/dist)*esmove*1.2;
          if(mapAt(enx,e.y)===0)e.x=enx;
          if(mapAt(e.x,eny)===0)e.y=eny;
        } else if(e.state==="strafe"){
          const perpx=-pdy/dist*e.strafeDir;
          const perpy=pdx/dist*e.strafeDir;
          const snx=e.x+perpx*esmove*1.1;
          const sny=e.y+perpy*esmove*1.1;
          if(mapAt(snx,e.y)===0)e.x=snx; else e.strafeDir*=-1;
          if(mapAt(e.x,sny)===0)e.y=sny;
        } else if(e.state==="retreat"){
          const rnx=e.x-(pdx/dist)*esmove*1.3;
          const rny=e.y-(pdy/dist)*esmove*1.3;
          if(mapAt(rnx,e.y)===0)e.x=rnx;
          if(mapAt(e.x,rny)===0)e.y=rny;
        }

        // Shoot at player
        e.shootCooldown--;
        if(e.shootCooldown<=0&&dist<9&&(e.state==="shoot"||e.state==="strafe")){
          e.shootCooldown=70+Math.random()*60|0;
          if(dist<7){
            const dmg=8+Math.random()*8|0;
            s.hp-=dmg;s.hitFlash=15;
            setHp(Math.max(0,s.hp));setHitFlash(true);
            setTimeout(()=>setHitFlash(false),200);
            if(s.hp<=0){s.gameOver=true;setGameOver(true);}
          }
        }
      });

      // Blood particles
      s.blood=s.blood.filter(b=>b.life>0);
      s.blood.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.vy+=0.001;b.life--;b.vx*=0.96;b.vy*=0.96;});
      // Labels
      s.labels=s.labels.filter(l=>l.life>0);
      s.labels.forEach(l=>l.life--);

      // ── DRAW ─────────────────────────────────────────────────────
      // Sky
      const skyG=ctx.createLinearGradient(0,0,0,HALF_H+bobY);
      skyG.addColorStop(0,"#040106");skyG.addColorStop(1,"#180406");
      ctx.fillStyle=skyG;ctx.fillRect(0,0,W,HALF_H+bobY);

      // Floor
      if(tx){
        const fp=ctx.createPattern(tx.floor,"repeat"); if(fp){ctx.fillStyle=fp;ctx.fillRect(0,HALF_H+bobY,W,H);}
        ctx.fillStyle="rgba(0,0,0,0.52)";ctx.fillRect(0,HALF_H+bobY,W,H);
      } else { ctx.fillStyle="#100303";ctx.fillRect(0,HALF_H+bobY,W,H); }
      // Ceiling
      if(tx){
        const cp=ctx.createPattern(tx.ceil,"repeat"); if(cp){ctx.fillStyle=cp;ctx.fillRect(0,0,W,HALF_H+bobY);}
        ctx.fillStyle="rgba(0,0,0,0.74)";ctx.fillRect(0,0,W,HALF_H+bobY);
      }

      // Walls with ambient light
      for(let ray=0;ray<NUM_RAYS;ray++){
        const rayAng=s.player.angle-FOV/2+(ray/NUM_RAYS)*FOV;
        const{dist,side,wallX,cell}=castRay(rayAng);
        zBuf[ray]=dist;
        const wallH=Math.min(H,H/dist);
        const top=HALF_H-wallH/2+bobY;
        if(tx){
          const src=cell===2?tx.concrete:tx.brick;
          const texX=Math.floor(wallX*64)&63;
          const shade=Math.max(0.06,1-dist/MAX_DEPTH);
          const dark=side===1?0.58:1.0;
          // Edge lighting: brighter near center of wall
          const edgeLight=0.85+Math.abs(wallX-0.5)*0.3;
          ctx.drawImage(src,texX,0,1,64,ray,top,1,wallH);
          ctx.fillStyle=`rgba(0,0,0,${Math.max(0,1-shade*dark*edgeLight)})`;
          ctx.fillRect(ray,top,1,wallH);
        } else {
          const shade=Math.max(0,1-dist/MAX_DEPTH)*(side===1?0.58:1);
          ctx.fillStyle=`rgb(${170*shade|0},${15*shade|0},${15*shade|0})`;
          ctx.fillRect(ray,top,1,wallH);
        }
      }

      // ── Enemies ──────────────────────────────────────────────────
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
        const sh=Math.max(0.18,Math.min(1,1-ed/12));
        const cx=screenX,cy=HALF_H-h*0.5+bobY;
        const hr=h*0.14,bw=h*0.35,bh=h*0.35,lh=h*0.26,lw=h*0.12;
        const wo=Math.sin(e.walkPhase)*(h*0.04);
        const col=(r:number,g:number,b:number)=>`rgba(${r*sh|0},${g*sh|0},${b*sh|0},1)`;
        const hc=hit?"rgba(255,130,0,1)":undefined;

        // Legs
        ctx.fillStyle=hc||col(62,16,16);
        ctx.fillRect(cx-lw*1.1,cy+bh+hr*2+wo,lw,lh);
        ctx.fillRect(cx+lw*0.1,cy+bh+hr*2-wo,lw,lh);
        ctx.fillStyle=hc||col(36,10,8);
        ctx.fillRect(cx-lw*1.2,cy+bh+hr*2+lh+wo,lw*1.2,lh*0.18);
        ctx.fillRect(cx,cy+bh+hr*2+lh-wo,lw*1.2,lh*0.18);
        // Belt
        ctx.fillStyle=hc||col(48,26,8);ctx.fillRect(cx-bw/2-2,cy+hr*2+bh*0.88,bw+4,h*0.04);
        // Body shaded
        const bodyG=ctx.createLinearGradient(cx-bw/2,0,cx+bw/2,0);
        bodyG.addColorStop(0,hc||col(80,26,26));bodyG.addColorStop(0.5,hc||col(122,40,40));bodyG.addColorStop(1,hc||col(80,26,26));
        ctx.fillStyle=bodyG;ctx.fillRect(cx-bw/2,cy+hr*2,bw,bh);
        if(!hit){ctx.fillStyle=col(50,16,16);ctx.fillRect(cx-bw*0.25,cy+hr*2.1,bw*0.5,bh*0.68);}
        // Arms
        ctx.fillStyle=hc||col(70,22,22);
        ctx.fillRect(cx-bw/2-lw+wo,cy+hr*2.2,lw,bh*0.72);
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.2,lw,bh*0.72);
        ctx.fillStyle=hc||col(165,105,65);
        ctx.fillRect(cx-bw/2-lw+wo,cy+hr*2.2+bh*0.68,lw,lw);
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.2+bh*0.68,lw,lw);
        // Gun
        ctx.fillStyle=hc||"#777";
        ctx.fillRect(cx+bw/2-wo,cy+hr*2.55,lw*0.5,bh*0.32);
        ctx.fillRect(cx+bw/2-wo+lw*0.12,cy+hr*2.65,h*0.14,lw*0.25);
        // Neck
        ctx.fillStyle=hc||col(150,90,60);ctx.fillRect(cx-hr*0.5,cy+hr*1.78,hr,hr*0.5);
        // Head with shading
        const hg=ctx.createRadialGradient(cx-hr*0.3,cy+hr*0.7,0,cx,cy+hr,hr);
        hg.addColorStop(0,hc||col(190,120,82));hg.addColorStop(1,hc||col(130,70,44));
        ctx.fillStyle=hg;ctx.beginPath();ctx.arc(cx,cy+hr,hr,0,Math.PI*2);ctx.fill();
        // Helmet
        ctx.fillStyle=hc||col(52,16,16);
        ctx.beginPath();ctx.ellipse(cx,cy+hr*0.5,hr*1.1,hr*0.72,0,Math.PI,-Math.PI*2,true);ctx.fill();
        // Visor
        ctx.fillStyle=hit?"rgba(255,220,0,0.9)":"rgba(255,42,0,0.78)";
        ctx.fillRect(cx-hr*0.56,cy+hr*0.66,hr*1.12,hr*0.32);
        // Eyes
        ctx.shadowColor=hit?"#ff0":"#f30";ctx.shadowBlur=8;
        ctx.fillStyle=hit?"#fff":"rgba(255,60,0,1)";
        ctx.fillRect(cx-hr*0.43,cy+hr*0.72,hr*0.22,hr*0.17);
        ctx.fillRect(cx+hr*0.21,cy+hr*0.72,hr*0.22,hr*0.17);
        ctx.shadowBlur=0;
        // HP bar
        if(ed<8){
          ctx.fillStyle="rgba(0,0,0,0.75)";ctx.fillRect(cx-h*0.32,cy-12,h*0.64,6);
          const hpRatio=e.hp/e.maxHp;
          ctx.fillStyle=hpRatio>0.5?"#22c55e":hpRatio>0.25?"#f59e0b":"#ef4444";
          ctx.fillRect(cx-h*0.32,cy-12,h*0.64*hpRatio,6);
          if(ed<5){
            ctx.fillStyle="rgba(255,255,255,0.5)";ctx.font=`${Math.max(8,h*0.12)|0}px monospace`;
            ctx.textAlign="center";ctx.fillText(`${Math.max(0,e.hp)}`,cx,cy-14);ctx.textAlign="left";
          }
        }
      });

      // ── Blood particles projected ─────────────────────────────────
      s.blood.forEach(b=>{
        const dx=b.x-s.player.x, dy=b.y-s.player.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        let a=Math.atan2(dy,dx)-s.player.angle;
        while(a>Math.PI)a-=Math.PI*2;
        while(a<-Math.PI)a+=Math.PI*2;
        if(Math.abs(a)>FOV*0.65)return;
        const ri=Math.floor((0.5+a/FOV)*W);
        if(ri<0||ri>=W||zBuf[ri]<dist)return;
        const screenX=(0.5+a/FOV)*W;
        const screenY=HALF_H+bobY;
        const size=Math.max(1,(H/dist)*b.size);
        const alpha=Math.min(1,b.life/b.maxLife)*0.85;
        const r=180+Math.random()*30|0;
        ctx.fillStyle=`rgba(${r},0,0,${alpha})`;
        ctx.beginPath();ctx.arc(screenX,screenY,size,0,Math.PI*2);ctx.fill();
      });

      // ── Damage labels projected ────────────────────────────────────
      s.labels.forEach(l=>{
        const dx=l.worldX-s.player.x, dy=l.worldY-s.player.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        let a=Math.atan2(dy,dx)-s.player.angle;
        while(a>Math.PI)a-=Math.PI*2;
        while(a<-Math.PI)a+=Math.PI*2;
        if(Math.abs(a)>FOV*0.6)return;
        const screenX=(0.5+a/FOV)*W;
        const floatY=HALF_H+bobY-(l.headshot?h*0.1:0)-(60-l.life)*0.8;
        const h2=H/dist*0.95;
        const sy=HALF_H-h2*0.5+bobY-(60-l.life)*0.5;
        const alpha=Math.min(1,l.life/30);
        ctx.globalAlpha=alpha;
        ctx.font=l.headshot?`bold ${Math.max(12,H/dist*0.18)|0}px monospace`:`bold ${Math.max(9,H/dist*0.13)|0}px monospace`;
        ctx.fillStyle=l.headshot?"#ffcc00":"#ffffff";
        ctx.textAlign="center";
        if(l.headshot){
          ctx.shadowColor="#ff0";ctx.shadowBlur=8;
          ctx.fillText(`💀 ${l.value}`,screenX,sy);
          ctx.shadowBlur=0;
        } else {
          ctx.fillText(`-${l.value}`,screenX,sy);
        }
        ctx.textAlign="left";ctx.globalAlpha=1;
      });

      // ── Gun ────────────────────────────────────────────────────────
      drawWeapon(ctx,s.weapon,bobX,bobY,s.gunRecoil,s.gunSway,flash,s.ammo);

      // ── Crosshair ─────────────────────────────────────────────────
      const chx=W/2,chy=H/2;
      ctx.strokeStyle="rgba(255,255,255,0.88)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(chx-14,chy);ctx.lineTo(chx-5,chy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx+5,chy);ctx.lineTo(chx+14,chy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx,chy-14);ctx.lineTo(chx,chy-5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chx,chy+5);ctx.lineTo(chx,chy+14);ctx.stroke();
      ctx.beginPath();ctx.arc(chx,chy,2,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.8)";ctx.fill();

      // ── Hit flash ─────────────────────────────────────────────────
      if(s.hitFlash>0){
        s.hitFlash--;
        ctx.fillStyle=`rgba(200,0,0,${s.hitFlash/30*0.42})`;ctx.fillRect(0,0,W,H);
      }

      // ── Vignette ──────────────────────────────────────────────────
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.22,W/2,H/2,H*0.82);
      vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(1,"rgba(0,0,0,0.72)");
      ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);

      // ── Minimap ───────────────────────────────────────────────────
      drawMinimap(ctx,s.player,s.enemies);

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

        {/* Headshot notification */}
        {headshotMsg&&(
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
            <div className="text-yellow-400 font-black text-2xl uppercase tracking-widest animate-bounce" style={{textShadow:"0 0 20px #ff0"}}>
              {headshotMsg}
            </div>
          </div>
        )}

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
                🛒 Магазин
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
            <div className="text-neutral-600 text-xs mb-4 text-center">Хедшот = x2.5 урона · Ноги = x0.6 урона</div>
            <button onClick={()=>{setShowShop(false);canvasRef.current?.requestPointerLock?.();}} className="bg-red-700 hover:bg-red-600 text-white font-black uppercase tracking-widest px-10 py-3 text-sm">
              Закрыть
            </button>
          </div>
        )}

        {!started&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/93">
            <div className="text-red-500 text-xs uppercase tracking-[0.4em] mb-3 font-semibold">Тактический шутер 3D</div>
            <h1 className="text-6xl font-black uppercase text-white mb-2" style={{textShadow:"0 0 40px #ff3b3b"}}>STRIKE ZONE</h1>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mt-4 mb-2 text-center">
              <span className="text-neutral-500">WASD — движение</span><span className="text-neutral-500">Мышь — обзор</span>
              <span className="text-neutral-500">ЛКМ — выстрел</span><span className="text-neutral-500">R — перезарядка</span>
            </div>
            <div className="text-neutral-600 text-xs mb-1">Хедшот x2.5 урона &nbsp;|&nbsp; Кровь при попадании &nbsp;|&nbsp; Карта на экране</div>
            <div className="text-neutral-700 text-xs mb-8">Умные боты · Магазин оружия · Зарабатывай деньги</div>
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
