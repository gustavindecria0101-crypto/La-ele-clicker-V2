/*
  Lá ele clicker
  - Click adds laEle points
  - Store items increase per click (CPC) and per second (CPS)
  - Badges for milestones
  - Prestige system: cash in total points for prestige tokens that boost future runs
  - Saves to localStorage
*/

const LS_KEY = 'laele_clicker_v1';
const el = id => document.getElementById(id);

const defaultState = {
  points: 0,
  totalEarned: 0,
  perClick: 1,
  perSec: 0,
  prestige: 0,
  items: {}, // id: count
  unlockedBadges: [],
  lastTick: Date.now()
};

let state = loadState();

const STORE_DEFS = [
  // early CPC
  { id: 'stick', name: 'Cajado (CPC)', basePrice: 10, cpc: 1, cps: 0 },
  { id: 'band', name: 'Cordão (CPC)', basePrice: 100, cpc: 5, cps: 0 },
  { id: 'ring', name: 'Anel (CPC)', basePrice: 450, cpc: 12, cps: 0 },
  { id: 'vest', name: 'Colete (CPC)', basePrice: 2200, cpc: 50, cps: 0 },

  // passive CPS
  { id: 'fan', name: 'Fã (CPS)', basePrice: 250, cpc: 0, cps: 1 },
  { id: 'group', name: 'Grupo (CPS)', basePrice: 2000, cpc: 0, cps: 10 },
  { id: 'show', name: 'Show (CPS)', basePrice: 15000, cpc: 0, cps: 100 },

  // advanced upgrades (mix)
  { id: 'promo', name: 'Promoção (CPC+CPS)', basePrice: 60000, cpc: 25, cps: 25 },
  { id: 'manager', name: 'Gerente (CPS)', basePrice: 240000, cpc: 0, cps: 500 },
  { id: 'studio', name: 'Estúdio (CPS)', basePrice: 1_000_000, cpc: 0, cps: 3000 },

  // multipliers / prestige-synergy items
  { id: 'boost', name: 'Boost (multiplicador)', basePrice: 5_000_000, cpc: 0, cps: 0, mult: 1.05 } // handled later if present
];

const BADGES = [
  { id: 'click100', label: '100 pontos', condition: s => s.totalEarned >= 100 },
  { id: 'click1k', label: '1k pontos', condition: s => s.totalEarned >= 1000 },
  { id: 'click10k', label: '10k pontos', condition: s => s.totalEarned >= 10000 },
  { id: 'prestige1', label: 'Primeiro Prestige', condition: s => s.prestige >= 1 },
  { id: 'collector', label: 'Colecionador', condition: s => Object.values(s.items).reduce((a,b)=>a+b,0) >= 20 }
];

const clickSound = new Audio('/video-game-menu-click-sounds-2.wav');
clickSound.volume = 0.36;
clickSound.preload = 'auto';

const $points = el('points');
const $perClick = el('perClick');
const $perSec = el('perSec');
const $store = el('store');
const $badges = el('badges');
const $prestige = el('prestige');
const $clickerBtn = el('clickerBtn');
const $prestigeBtn = el('prestigeBtn');
const $resetBtn = el('resetBtn');

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return {...defaultState};
    const parsed = JSON.parse(raw);
    return {...defaultState, ...parsed}; // fill missing keys
  }catch(e){
    return {...defaultState};
  }
}

function saveState(){
  state.lastTick = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function format(n){
  if(n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if(n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if(n >= 1e3) return (n/1e3).toFixed(2)+'k';
  return Math.floor(n).toString();
}

function recalcFromItems(){
  // base click is 1, boosted by prestige and multiplicative items
  let baseCpc = 1 + state.prestige * 0.2; // small prestige boost
  let addCpc = 0;
  let cps = 0;
  let mult = 1;
  for(const def of STORE_DEFS){
    const count = state.items[def.id] || 0;
    addCpc += (def.cpc || 0) * count;
    cps += (def.cps || 0) * count;
    if(def.mult && count > 0){
      // apply multiplicative stacks (e.g., each 'boost' increases x%)
      mult *= Math.pow(def.mult, count);
    }
  }
  state.perClick = (baseCpc + addCpc) * mult;
  state.perSec = cps * mult;
}

function render(){
  $points.textContent = format(state.points);
  $perClick.textContent = format(state.perClick);
  $perSec.textContent = format(state.perSec) + '/s';
  $prestige.textContent = `Prestige: ${state.prestige}`;
  renderStore();
  renderBadges();
}

function storePrice(def){
  const count = state.items[def.id] || 0;
  // exponential pricing
  return Math.ceil(def.basePrice * Math.pow(1.15, count));
}

function renderStore(){
  $store.innerHTML = '';
  for(const def of STORE_DEFS){
    const price = storePrice(def);
    const count = state.items[def.id] || 0;
    const effects = `${def.cpc?`+${def.cpc} CPC` : ''} ${def.cps?`+${def.cps} CPS` : ''} ${def.mult?`×${def.mult}x` : ''}`.trim();
    const node = document.createElement('div');
    node.className = 'item';
    node.innerHTML = `
      <div class="meta">
        <div style="font-weight:800;color:var(--accent)">${def.name}</div>
        <div style="font-size:12px;color:#6b7b87">${effects}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="price">${format(price)}</div>
        <button data-id="${def.id}" class="btn buy" ${state.points < price ? 'disabled' : ''}>Buy • ${count}</button>
      </div>
    `;
    $store.appendChild(node);
  }

  // attach listeners
  $store.querySelectorAll('.buy').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-id');
      const def = STORE_DEFS.find(d=>d.id===id);
      const price = storePrice(def);
      if(state.points >= price){
        state.points -= price;
        state.items[id] = (state.items[id] || 0) + 1;

        // if item has multiplicative effect, apply as simple permanent multiplier stored on item count
        if(def.mult){
          // store mult as metadata by repeating count; apply later in recalcFromItems
        }

        recalcFromItems();
        saveState();
        render();
      }
    });
  });
}

function renderBadges(){
  $badges.innerHTML = '';
  for(const badge of BADGES){
    const unlocked = state.unlockedBadges.includes(badge.id) || badge.condition(state);
    if(unlocked && !state.unlockedBadges.includes(badge.id)){
      state.unlockedBadges.push(badge.id);
      // small feedback - badge earned
      flash(`${badge.label} badge!`);
    }
    const elb = document.createElement('div');
    elb.className = 'badge';
    elb.textContent = badge.label;
    elb.style.opacity = unlocked ? '1' : '0.35';
    $badges.appendChild(elb);
  }
  saveState();
}

function flash(text){
  const f = document.createElement('div');
  f.textContent = text;
  f.style.position = 'fixed';
  f.style.left = '50%';
  f.style.transform = 'translateX(-50%) translateY(6px)';
  f.style.bottom = '18px';
  f.style.background = 'linear-gradient(90deg, rgba(15,76,255,.95), rgba(6,38,120,.95))';
  f.style.color = 'white';
  f.style.padding = '10px 14px';
  f.style.borderRadius = '12px';
  f.style.zIndex = 9999;
  f.style.fontSize = '13px';
  f.style.transition = 'opacity .45s ease, transform .45s ease';
  f.style.opacity = '0';
  document.body.appendChild(f);
  requestAnimationFrame(()=>{
    f.style.opacity = '1';
    f.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(()=>{
    f.style.opacity = '0';
    f.style.transform = 'translateX(-50%) translateY(8px)';
  },1600);
  setTimeout(()=>f.remove(),2200);
}

// click handling
$clickerBtn.addEventListener('click', () => {
  // play click sound (reset time so repeated quick clicks overlap cleanly)
  try { clickSound.currentTime = 0; clickSound.play(); } catch (e) { /* noop */ }
  state.points += state.perClick;
  state.totalEarned += state.perClick;
  recalcFromItems();
  saveState();
  render();
});

// passive CPS ticker
function tick(){
  const now = Date.now();
  const dt = (now - (state.lastTick || now)) / 1000;
  if(dt <= 0) { state.lastTick = now; return; }
  const gain = state.perSec * dt;
  if(gain > 0){
    state.points += gain;
    state.totalEarned += gain;
  }
  state.lastTick = now;
  recalcFromItems();
  render();
  saveState();
}

setInterval(tick, 1000);
recalcFromItems();
render();

// prestige: convert totalEarned into prestige tokens: floor(totalEarned / 10000)
// require at least 10k total to prestige
$prestigeBtn.addEventListener('click', () => {
  const available = Math.floor(state.totalEarned / 10000) - state.prestige;
  if(available <= 0){
    flash('Need more total points to prestige (10k per token)');
    return;
  }
  const toGain = available;
  // confirmation lightweight
  if(!confirm(`Prestige and gain ${toGain} prestige token(s)? This will reset points, items and badges but grants permanent boost.`)) return;
  state.prestige += toGain;
  // reset core progress but keep prestige and unlocked badges removed (start fresh)
  state.points = 0;
  state.totalEarned = 0;
  state.items = {};
  state.unlockedBadges = [];
  state.perClick = 1 + state.prestige * 0.2;
  state.perSec = 0;
  saveState();
  render();
  flash(`Gained ${toGain} prestige token(s)!`);
});

$resetBtn.addEventListener('click', () => {
  if(!confirm('Reset all progress? This cannot be undone.')) return;
  state = {...defaultState};
  saveState();
  recalcFromItems();
  render();
  flash('Reset complete');
});

// auto-save every 5s
setInterval(saveState, 5000);

// gentle haptics on touch devices (try)
$clickerBtn.addEventListener('touchstart', ()=>{ try{ navigator.vibrate && navigator.vibrate(20);}catch(e){} });

// On load: small animation
setTimeout(()=>{ $clickerBtn.animate([{transform:'scale(0.98)'},{transform:'scale(1)'}], {duration:420,easing:'cubic-bezier(.2,.9,.3,1)'}); },200);