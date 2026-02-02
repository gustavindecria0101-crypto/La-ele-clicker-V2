/*
  Lá ele clicker
  - Click adds laEle points
  - Store items increase per click (CPC) and per second (CPS)
  - Badges for milestones
  - Prestige system: cash in total points for prestige tokens that boost future runs
  - Saves to localStorage
*/

const LS_KEY = 'laele_clicker_v1';
const LS_LEADER = 'laele_leaderboard_v1';
const LS_USERS = 'laele_users_v1';
let currentUser = null;
const el = id => document.getElementById(id);

// leaderboard helpers (simple object of username->{points, lastSeen})
function loadLeaderboard(){
  try{
    const raw = localStorage.getItem(LS_LEADER);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveLeaderboard(data){
  try{ localStorage.setItem(LS_LEADER, JSON.stringify(data)); }catch(e){}
}

let leaderboard = loadLeaderboard();

// auth storage helpers (username -> {password})
function loadUsers(){
  try{ const raw = localStorage.getItem(LS_USERS); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; }
}
function saveUsers(u){ try{ localStorage.setItem(LS_USERS, JSON.stringify(u)); }catch(e){} }

const authUI = {
  modal: el('authModal'),
  username: el('authUsername'),
  password: el('authPassword'),
  msg: el('authMsg'),
  submit: null,
  toggle: null,
  mode: 'login' // or 'register'
};

function stateKey(user){ return `${LS_KEY}__${user}`; }

const defaultState = {
  points: 0,
  totalEarned: 0,
  perClick: 1,
  perSec: 0,
  prestige: 0,
  items: {}, // id: count
  unlockedBadges: [],
  skinsOwned: [],    // array of skin ids user has unlocked
  equippedSkin: null, // id of equipped skin
  lastTick: Date.now()
};

let state = loadState();

const STORE_DEFS = [
  // early CPC
  { id: 'stick', name: 'Cajado (CPC)', basePrice: 10, cpc: 1, cps: 0 },
  { id: 'band', name: 'Cordão (CPC)', basePrice: 100, cpc: 5, cps: 0 },
  { id: 'ring', name: 'Anel (CPC)', basePrice: 450, cpc: 12, cps: 0 },
  { id: 'vest', name: 'Colete (CPC)', basePrice: 2200, cpc: 50, cps: 0 },

  // Manoel Gomes themed upgrades (CPC heavy, flavor items)
  { id: 'caneta_azul', name: 'Caneta Azul (CPC)', basePrice: 6500, cpc: 120, cps: 0, desc: 'A clássica caneta azul do Manoel' },
  { id: '1001_canetadas', name: '1001 Canetadas (CPC)', basePrice: 22000, cpc: 550, cps: 0, desc: 'Uma chuva de canetadas lendária' },
  { id: 'caneta_reversa', name: 'Caneta Reversa (CPC)', basePrice: 95000, cpc: 1800, cps: 0, desc: 'Caneta que devolve inspiração' },
  { id: 'caneta_roxa', name: 'Caneta Roxa (CPC)', basePrice: 420000, cpc: 7200, cps: 0, desc: 'Edição especial roxa' },

  // passive / music branch (ramo da música)
  { id: 'ramo_musica', name: 'Ramo da Música (CPS)', basePrice: 18000, cpc: 0, cps: 80, desc: 'Apoio musical para gerar pontos' },
  { id: 'estudio_indie', name: 'Estúdio Indie (CPS)', basePrice: 120000, cpc: 0, cps: 600 },
  { id: 'orquesta', name: 'Orquestra (CPS)', basePrice: 900000, cpc: 0, cps: 4200 },

  // mixed/advanced Manoel items
  { id: 'maestro', name: 'Maestro (CPC+CPS)', basePrice: 560000, cpc: 450, cps: 800, desc: 'Direção artística que aumenta tudo' },
  { id: 'fandom', name: 'Fandom Manoel (CPS)', basePrice: 2_200_000, cpc: 0, cps: 15000 },

  // original advanced upgrades (kept)
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
  { id: 'click100k', label: '100k pontos', condition: s => s.totalEarned >= 100000 },
  { id: 'click1m', label: '1M pontos', condition: s => s.totalEarned >= 1_000_000 },
  { id: 'money5m', label: 'R$ 5.000.000', condition: s => s.totalEarned >= 5_000_000 },
  { id: 'prestige1', label: 'Primeiro Prestige', condition: s => s.prestige >= 1 },
  { id: 'collector', label: 'Colecionador', condition: s => Object.values(s.items).reduce((a,b)=>a+b,0) >= 20 },
  { id: 'shopper', label: 'Comprador', condition: s => Object.values(s.items).reduce((a,b)=>a+b,0) >= 50 }
];

const clickSound = new Audio('/video-game-menu-click-sounds-2.wav');
clickSound.preload = 'auto';

// La-ele main click sound — plays only on click (no looping)
const laEleSound = new Audio('/La-ele.mp3');
laEleSound.preload = 'auto';
laEleSound.loop = false;

// Settings storage (volume)
const LS_SETTINGS = 'laele_settings_v1';
function loadSettings(){
  try{ const raw = localStorage.getItem(LS_SETTINGS); return raw ? JSON.parse(raw) : { music: 0.08, click: 0.36, laEle: 0.5 }; } catch(e){ return { music: 0.08, click: 0.36, laEle: 0.5 }; }
}
function saveSettings(s){ try{ localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }catch(e){} }
let settings = loadSettings();
 // apply per-channel volumes
 clickSound.volume = (typeof settings.click === 'number') ? settings.click : 0.36;
 if(typeof laEleSound !== 'undefined') laEleSound.volume = (typeof settings.laEle === 'number') ? settings.laEle : 0.5;

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
  if(!currentUser) return {...defaultState};
  try{
    const raw = localStorage.getItem(stateKey(currentUser));
    if(!raw) return {...defaultState};
    const parsed = JSON.parse(raw);
    return {...defaultState, ...parsed}; // fill missing keys
  }catch(e){
    return {...defaultState};
  }
}

function saveState(){
  if(!currentUser) return;
  state.lastTick = Date.now();
  localStorage.setItem(stateKey(currentUser), JSON.stringify(state));

  // update leaderboard entry for this user
  try{
    leaderboard[currentUser] = {
      points: Math.floor(state.points),
      totalEarned: Math.floor(state.totalEarned),
      prestige: state.prestige,
      lastSeen: Date.now()
    };
    // keep leaderboard sorted when rendering (save full map)
    saveLeaderboard(leaderboard);
  }catch(e){}
}

function format(n){
  if(n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if(n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if(n >= 1e3) return (n/1e3).toFixed(2)+'k';
  return Math.floor(n).toString();
}

function recalcFromItems(){
  // base click is 1, boosted by prestige and multiplicative items and equipped skin boost
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
  // skin boost: additive percentage of the computed perClick
  const skinBoost = state.skinBoost || 0; // e.g., 0.12 = +12%
  const computed = (baseCpc + addCpc) * mult;
  state.perClick = computed * (1 + skinBoost);
  state.perSec = cps * mult;
}

function render(){
  $points.textContent = format(state.points);
  $perClick.textContent = format(state.perClick);
  $perSec.textContent = format(state.perSec) + '/s';
  $prestige.textContent = `Prestige: ${state.prestige}`;
  renderStore();
  renderBadges();
  renderLeaderboard();
  renderServers && renderServers(); // render server UI if present
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
      // visual pulse
      const temp = document.createElement('div');
      temp.className = 'badge unlocked pulse';
      temp.textContent = badge.label;
      $badges.appendChild(temp);
      setTimeout(()=> { temp.classList.remove('pulse'); }, 900);
      continue;
    }
    const elb = document.createElement('div');
    elb.className = 'badge' + (unlocked ? ' unlocked' : '');
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

/* Leaderboard rendering and change user button */
const $leaderList = el('leaderList');
const $userBadge = el('userBadge');
const $changeUserBtn = el('changeUserBtn');

function renderLeaderboard(){
  // build sorted list from leaderboard object
  const arr = Object.entries(leaderboard).map(([name, info]) => ({name, points: info.points || 0, lastSeen: info.lastSeen || 0}));
  arr.sort((a,b)=> b.points - a.points);
  const top = arr.slice(0,5);
  $leaderList.innerHTML = '';

  const users = loadUsers();

  top.forEach((entry, idx) => {
    const div = document.createElement('div');
    div.className = 'entry' + (idx===0 ? ' top' : '');

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    const avatarImg = document.createElement('img');
    avatarImg.src = (users[entry.name] && users[entry.name].avatar) ? users[entry.name].avatar : '/OIP (3).webp';
    avatarImg.alt = entry.name;
    avatarImg.style.width = '28px';
    avatarImg.style.height = '28px';
    avatarImg.style.borderRadius = '8px';
    avatarImg.style.objectFit = 'cover';
    left.appendChild(avatarImg);

    const nameSpan = document.createElement('div');
    nameSpan.textContent = entry.name;
    nameSpan.style.fontWeight = idx === 0 ? '800' : '600';
    left.appendChild(nameSpan);

    div.appendChild(left);

    const right = document.createElement('div');
    right.textContent = format(entry.points);
    div.appendChild(right);
    $leaderList.appendChild(div);
  });
  // update top user badge
  const ua = document.getElementById('userAvatar');
  const un = document.getElementById('userNameShort');
  if(currentUser){
    const uobj = users[currentUser] || {};
    if(ua && uobj.avatar) ua.src = uobj.avatar;
    if(un) un.textContent = `@${currentUser}`;
  } else {
    if(un) un.textContent = '';
    if(ua) ua.src = '/noob.png';
  }
}

/* --- Server rooms (simple localStorage-backed "servers" for multiple players per room, max 7) --- */
const LS_ROOMS = 'laele_rooms_v1';
function loadRooms(){
  try{ const raw = localStorage.getItem(LS_ROOMS); return raw ? JSON.parse(raw) : {}; }catch(e){ return {}; }
}
function saveRooms(data){
  try{ localStorage.setItem(LS_ROOMS, JSON.stringify(data)); }catch(e){}
}

// create a room with owner and empty players list
function createRoom(name, owner){
  if(!name) name = `Server-${Math.floor(Math.random()*900)+100}`;
  const rooms = loadRooms();
  if(rooms[name]) return { ok:false, msg:'Nome já existe' };
  rooms[name] = { name, owner, players: owner ? [owner] : [], created: Date.now(), messages: [] };
  saveRooms(rooms);
  return { ok:true, room: rooms[name] };
}

function joinRoom(name, username){
  const rooms = loadRooms();
  const room = rooms[name];
  if(!room) return { ok:false, msg:'Servidor não existe' };
  if(room.players.includes(username)) return { ok:true, room };
  if(room.players.length >= 7) return { ok:false, msg:'Servidor cheio' };
  room.players.push(username);
  saveRooms(rooms);
  return { ok:true, room };
}

function leaveRoom(name, username){
  const rooms = loadRooms();
  const room = rooms[name];
  if(!room) return;
  room.players = room.players.filter(p => p !== username);
  // if room empty, remove it
  if(room.players.length === 0) delete rooms[name];
  // ensure owner exists or reassign
  if(room && room.players.length > 0 && room.owner && !room.players.includes(room.owner)) room.owner = room.players[0];
  saveRooms(rooms);
}

/* auto-create several rooms on first load to ensure visitors have options */
function ensureInitialRooms(){
  const rooms = loadRooms();
  if(Object.keys(rooms).length === 0){
    for(let i=0;i<6;i++){
      const n = `Auto-${1000 + i}`;
      rooms[n] = { name: n, owner: null, players: [], created: Date.now(), messages: [] };
    }
    saveRooms(rooms);
  }
}

/* pick or create a room for a visitor: prefer a non-full random room; create new if all full */
function assignVisitorToRoom(username){
  const rooms = loadRooms();
  const arr = Object.values(rooms);
  // shuffle
  for(let i = arr.length -1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]] = [arr[j],arr[i]]; }
  // try to find non-full room
  for(const r of arr){
    if((r.players?.length || 0) < 7){
      joinRoom(r.name, username);
      const users = loadUsers();
      users[username] = users[username] || {};
      users[username].currentRoom = r.name;
      saveUsers(users);
      return r.name;
    }
  }
  // none available -> create a new auto room
  const newName = `Auto-${Math.floor(Math.random()*9000)+1000}`;
  const res = createRoom(newName, username);
  // ensure owner recorded
  if(res.ok){
    const users = loadUsers();
    users[username] = users[username] || {};
    users[username].currentRoom = res.room.name;
    saveUsers(users);
    return res.room.name;
  }
  return null;
}

/* room messaging helpers: messages stored per-room in rooms[name].messages as {user, text, time} */
function roomSendMessage(roomName, user, text){
  if(!roomName || !text) return { ok:false };
  const rooms = loadRooms();
  const r = rooms[roomName];
  if(!r) return { ok:false, msg:'Room not found' };
  r.messages = r.messages || [];
  r.messages.push({ user, text, time: Date.now() });
  // cap messages to 200
  if(r.messages.length > 200) r.messages.splice(0, r.messages.length - 200);
  saveRooms(rooms);
  return { ok:true };
}
function roomGetMessages(roomName){
  const rooms = loadRooms();
  const r = rooms[roomName];
  return (r && r.messages) ? r.messages.slice(-100) : [];
}

/* render server list UI and wiring */
const $serverList = document.getElementById('serverList');
const $createServerBtn = document.getElementById('createServerBtn');
const $roomNameInput = document.getElementById('roomNameInput');

function renderServers(){
  if(!$serverList) return;
  $serverList.innerHTML = '';
  const rooms = loadRooms();
  const names = Object.keys(rooms).sort((a,b)=> rooms[a].players.length - rooms[b].players.length);
  if(names.length === 0){
    const empty = document.createElement('div');
    empty.style.fontSize = '12px';
    empty.style.color = 'var(--muted)';
    empty.textContent = 'Nenhum servidor ativo';
    $serverList.appendChild(empty);
    return;
  }
  for(const n of names){
    const r = rooms[n];
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.padding = '8px';
    item.style.borderRadius = '8px';
    item.style.background = 'rgba(255,255,255,0.02)';
    item.style.border = '1px solid rgba(31,182,255,0.04)';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '4px';
    const title = document.createElement('div');
    title.style.fontWeight = '800';
    title.textContent = r.name + (r.owner ? (r.owner === currentUser ? ' (Você)':'') : '');
    const sub = document.createElement('div');
    sub.style.fontSize = '12px';
    sub.style.color = 'var(--muted)';
    sub.textContent = `${(r.players?.length)||0}/7 players`;
    left.appendChild(title);
    left.appendChild(sub);
    item.appendChild(left);

    const btnWrap = document.createElement('div');
    if(currentUser && r.players && r.players.includes(currentUser)){
      const leaveBtn = document.createElement('button');
      leaveBtn.className = 'btn';
      leaveBtn.textContent = 'Sair';
      leaveBtn.addEventListener('click', ()=> {
        leaveRoom(r.name, currentUser);
        const users = loadUsers();
        if(users[currentUser]) delete users[currentUser].currentRoom;
        saveUsers(users);
        flash(`Saiu de ${r.name}`);
        renderServers();
        renderChat(); // clear chat
      });
      btnWrap.appendChild(leaveBtn);
    } else {
      const joinBtn = document.createElement('button');
      joinBtn.className = 'btn';
      joinBtn.textContent = (r.players && r.players.length >= 7) ? 'Cheio' : 'Entrar';
      if(!r.players || r.players.length >=7) joinBtn.disabled = true;
      joinBtn.addEventListener('click', ()=> {
        if(!currentUser){ flash('Entre para entrar em um servidor'); showAuthModal('login'); return; }
        const res = joinRoom(r.name, currentUser);
        if(!res.ok){ flash(res.msg || 'Erro'); return; }
        // upon join, optionally store current room on user object
        const users = loadUsers();
        users[currentUser] = users[currentUser] || {};
        users[currentUser].currentRoom = r.name;
        saveUsers(users);
        flash(`Entrou em ${r.name}`);
        renderServers();
        renderChat();
      });
      btnWrap.appendChild(joinBtn);
    }
    item.appendChild(btnWrap);
    $serverList.appendChild(item);
  }
}

/* friends UI wiring references */
const $friendInput = document.getElementById('friendInput');
const $addFriendBtn = document.getElementById('addFriendBtn');
const $friendList = document.getElementById('friendList');
const $chatMessages = document.getElementById('chatMessages');
const $chatInput = document.getElementById('chatInput');
const $sendChatBtn = document.getElementById('sendChatBtn');
const $currentRoomLabel = document.getElementById('currentRoomLabel');

// create room button wiring
if($createServerBtn){
  $createServerBtn.addEventListener('click', ()=>{
    if(!currentUser){ flash('Faça login para criar um servidor'); showAuthModal('login'); return; }
    const name = ($roomNameInput && $roomNameInput.value && $roomNameInput.value.trim()) || '';
    const res = createRoom(name || `Server-${Math.floor(Math.random()*900)+100}`, currentUser);
    if(!res.ok){ flash(res.msg || 'Erro'); return; }
    // record current room on user
    const users = loadUsers();
    users[currentUser] = users[currentUser] || {};
    users[currentUser].currentRoom = res.room.name;
    saveUsers(users);
    flash(`Servidor ${res.room.name} criado`);
    $roomNameInput.value = '';
    renderServers();
    renderChat();
  });
}

// friend storage helpers (stored on user object inside users map)
function getFriends(username){
  const users = loadUsers();
  return (users[username] && users[username].friends) ? users[username].friends : [];
}
function saveFriends(username, list){
  const users = loadUsers();
  users[username] = users[username] || {};
  users[username].friends = list;
  saveUsers(users);
}

function renderFriendList(){
  if(!$friendList) return;
  $friendList.innerHTML = '';
  if(!currentUser) return;
  const friends = getFriends(currentUser);
  for(const f of friends){
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.padding = '6px 8px';
    btn.textContent = f;
    btn.title = `Entrar no servidor do ${f}`;
    btn.addEventListener('click', ()=>{
      // try to join friend's server if exists
      const users = loadUsers();
      if(!users[f] || !users[f].currentRoom){
        flash(`${f} não está em um servidor agora.`);
        return;
      }
      const target = users[f].currentRoom;
      const rooms = loadRooms();
      if(!rooms[target]){ flash('Servidor do amigo não existe mais'); return;}
      if(rooms[target].players && rooms[target].players.length >=7){
        flash('O servidor do amigo está cheio');
        return;
      }
      if(!currentUser){ showAuthModal('login'); return; }
      const res = joinRoom(target, currentUser);
      if(!res.ok){ flash(res.msg || 'Erro'); return; }
      const u = loadUsers();
      u[currentUser] = u[currentUser] || {};
      u[currentUser].currentRoom = target;
      saveUsers(u);
      flash(`Entrou no servidor de ${f}`);
      renderServers();
      renderChat();
    });
    $friendList.appendChild(btn);
  }
}

if($addFriendBtn){
  $addFriendBtn.addEventListener('click', ()=>{
    if(!currentUser){ flash('Entre para adicionar amigos'); showAuthModal('login'); return; }
    const to = ($friendInput && $friendInput.value && $friendInput.value.trim());
    if(!to){ flash('Digite um username'); return; }
    const users = loadUsers();
    if(!users[to]){ flash('Usuário não encontrado'); return; }
    if(to === currentUser){ flash('Você não pode adicionar a si mesmo'); return; }
    const friends = getFriends(currentUser);
    if(friends.includes(to)){ flash('Já é amigo'); return; }
    friends.push(to);
    saveFriends(currentUser, friends);
    renderFriendList();
    flash(`${to} adicionado aos amigos`);
    $friendInput.value = '';
  });
}

// chat send handler
if($sendChatBtn){
  $sendChatBtn.addEventListener('click', ()=>{
    if(!currentUser){ flash('Entre para enviar mensagens'); showAuthModal('login'); return; }
    const users = loadUsers();
    const roomName = users[currentUser] && users[currentUser].currentRoom;
    if(!roomName){ flash('Você não está em um servidor'); return; }
    const text = ($chatInput && $chatInput.value && $chatInput.value.trim());
    if(!text) return;
    const res = roomSendMessage(roomName, currentUser, text);
    if(res.ok){
      $chatInput.value = '';
      renderChat();
    } else {
      flash('Erro ao enviar mensagem');
    }
  });
}

// helper to render chat for current user's room
function renderChat(){
  if(!$chatMessages) return;
  $chatMessages.innerHTML = '';
  if(!currentUser){ $currentRoomLabel.textContent = ''; return; }
  const users = loadUsers();
  const roomName = users[currentUser] && users[currentUser].currentRoom;
  if(!roomName){ $currentRoomLabel.textContent = ''; $chatMessages.innerHTML = '<div style="opacity:0.6">Entre em um servidor para ver o chat.</div>'; return; }
  $currentRoomLabel.textContent = roomName;
  const msgs = roomGetMessages(roomName);
  for(const m of msgs){
    const d = document.createElement('div');
    d.style.marginBottom = '6px';
    const time = new Date(m.time);
    const hh = time.getHours().toString().padStart(2,'0');
    const mm = time.getMinutes().toString().padStart(2,'0');
    d.innerHTML = `<strong style="color:var(--accent)">@${m.user}</strong> <span style="opacity:0.5;font-size:11px;margin-left:6px">${hh}:${mm}</span><div style="margin-top:4px">${escapeHtml(m.text)}</div>`;
    $chatMessages.appendChild(d);
  }
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

// small escape helper for chat
function escapeHtml(str){ return (''+str).replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ensure initial rooms exist and auto-assign anonymous visitors to a room on first load
ensureInitialRooms();

/* ensure we refresh server list whenever localStorage rooms change (other tabs) */
window.addEventListener('storage', (e)=>{
  if(e.key === LS_ROOMS) {
    renderServers();
    renderChat();
  }
});

/* initial server render and auto-assign visitor if logged */
setTimeout(()=>{ 
  renderServers(); 
  // if we have a user (or create a guest), try auto-assign to a room
  // If no user logged, create a temporary guest id in localStorage so messages/rooms track them
  if(!currentUser){
    // attempt cookie check (existing logic may have set cookie), otherwise create ephemeral guest id saved in sessionStorage
    let guest = sessionStorage.getItem('laele_guest');
    if(!guest){
      guest = `Guest${Math.floor(Math.random()*90000)+1000}`;
      sessionStorage.setItem('laele_guest', guest);
      // create a minimal user record so friend / avatar logic can still reference it
      const users = loadUsers();
      users[guest] = users[guest] || { password: '', avatar: '/OIP (3).webp' };
      saveUsers(users);
    }
    // auto-join a non-full room as the visitor (we won't set currentUser globally to guest to avoid mixing; instead store guest in session)
    // but if user then logs in, the site's login flow will assign them properly
    assignVisitorToRoom(guest);
  } else {
    // if logged in but without recorded room, assign
    const users = loadUsers();
    if(currentUser && (!users[currentUser] || !users[currentUser].currentRoom)){
      assignVisitorToRoom(currentUser);
    }
  }
  renderServers();
  renderFriendList && renderFriendList();
  renderChat && renderChat();
}, 350);

/* change user opens auth modal (login/register) */
$changeUserBtn.addEventListener('click', ()=>{
  showAuthModal('login');
});
// clicking top user badge allows quick avatar change (for logged user)
document.getElementById('userBadge').addEventListener('click', async ()=>{
  if(!currentUser) { showAuthModal('login'); return; }
  const users = loadUsers();
  const choice = confirm('Deseja trocar o avatar para Noob? (Cancelar mantém atual) — OK = Noob');
  if(choice){
    users[currentUser] = users[currentUser] || {};
    users[currentUser].avatar = '/noob.png';
    saveUsers(users);
    renderLeaderboard();
    flash('Avatar atualizado');
  }
});

/* click handling */
$clickerBtn.addEventListener('click', (ev) => {
  // play click sound (reset time so repeated quick clicks overlap cleanly)
  try { 
    clickSound.currentTime = 0; 
    clickSound.play(); 
  } catch (e) { /* noop */ }
  try {
    // play La-ele main click audio (reset so rapid clicks overlap cleanly)
    if(typeof laEleSound !== 'undefined') {
      laEleSound.currentTime = 0;
      laEleSound.play();
    }
  } catch (e) { /* noop */ }

  // small press animation
  $clickerBtn.classList.add('clicked');
  setTimeout(()=> $clickerBtn.classList.remove('clicked'), 100);

  // spawn blue particles from clicker center
  createClickParticles(ev);

  state.points += state.perClick;
  state.totalEarned += state.perClick;
  recalcFromItems();
  saveState();
  render();
});

/* Particle burst on click: creates several ephemeral blue particles that fly outward and fade */
function createClickParticles(ev){
  const rect = $clickerBtn.getBoundingClientRect();
  // center of clicker
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const count = 14;
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'click-particle';
    // randomize size and direction
    const size = 6 + Math.random()*10;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${cx - size/2}px`;
    p.style.top = `${cy - size/2}px`;
    // random angle and distance
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random()*90;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - (Math.random()*10); // slight upward bias
    // random rotation
    const rot = (Math.random()*360).toFixed(1);
    // attach to body
    document.body.appendChild(p);
    // trigger animation via transform + opacity
    requestAnimationFrame(()=> {
      p.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${0.9 + Math.random()*0.6})`;
      p.style.opacity = '0';
    });
    // remove after animation
    setTimeout(()=> p.remove(), 650 + Math.random()*300);
  }
}

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
  // check for 5M milestone to award skin + badge
  try{
    if(state.totalEarned >= 5_000_000 && !state.skinsOwned.includes('viciado')){
      state.skinsOwned.push('viciado');
      // award badge if not present
      if(!state.unlockedBadges.includes('money5m')) state.unlockedBadges.push('money5m');
      // auto-equip the viciado skin
      state.equippedSkin = 'viciado';
      if(currentUser){
        const users = loadUsers();
        users[currentUser] = users[currentUser] || {};
        users[currentUser].avatar = '/OIP (3).webp';
        users[currentUser].skinSelection = 'viciado';
        saveUsers(users);
      }
      flash('Parabéns! Skin "Viciado!!" desbloqueada!');
      applyEquippedSkin && applyEquippedSkin();
    }
  }catch(e){}
  state.lastTick = now;
  recalcFromItems();
  render();
  saveState();
}

setInterval(tick, 1000);
recalcFromItems();

// cookie helpers to remember logged user
function setCookie(name, value, days=30){
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function eraseCookie(name){ document.cookie = name + '=; Max-Age=0; path=/'; }

// show auth modal on load, attempt cookie auto-login
window.addEventListener('load', ()=> {
  const remembered = getCookie('laele_user');
  const users = loadUsers();
  if(remembered && users[remembered]){
    // auto-login
    finishLogin(remembered);
  } else {
    showAuthModal('login');
  }

  // settings UI wiring
  const settingsModal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsClose = document.getElementById('settingsClose');

  // background music (Melodia.mp3) controlled by music slider
  // expose bgMusic globally so slider handlers always reference the playing audio
  window.bgMusic = new Audio('/Melodia.mp3');
  window.bgMusic.loop = true;
  window.bgMusic.preload = 'auto';
  // apply stored music volume (settings.music) or default (reduced)
  window.bgMusic.volume = (typeof settings.music === 'number') ? settings.music : 0.08;
  // attempt to play quietly if user interaction allows (will silently fail if autoplay blocked)
  try { window.bgMusic.play().catch(()=>{}); } catch(e){}

  // bind sliders in settings modal (IDs exist in HTML: musicSlider, clickSlider, laeleSlider)
  const musicSlider = document.getElementById('musicSlider');
  const musicLabel = document.getElementById('musicLabel');
  const clickSlider = document.getElementById('clickSlider');
  const clickLabel = document.getElementById('clickLabel');
  const laeleSlider = document.getElementById('laeleSlider');
  const laeleLabel = document.getElementById('laeleLabel');

  // initialize slider values and labels from settings
  if(musicSlider && musicLabel){
    musicSlider.value = Math.round(((typeof settings.music === 'number') ? settings.music : 0.12) * 100);
    musicLabel.textContent = `${musicSlider.value}%`;
    musicSlider.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      musicLabel.textContent = `${Math.round(v*100)}%`;
      settings.music = v;
      try { bgMusic.volume = v; } catch(e){}
      saveSettings(settings);
    });
  }

  if(clickSlider && clickLabel){
    clickSlider.value = Math.round(((typeof settings.click === 'number') ? settings.click : 0.36) * 100);
    clickLabel.textContent = `${clickSlider.value}%`;
    clickSlider.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      clickLabel.textContent = `${Math.round(v*100)}%`;
      settings.click = v;
      try { clickSound.volume = v; } catch(e){}
      saveSettings(settings);
    });
  }

  if(laeleSlider && laeleLabel){
    laeleSlider.value = Math.round(((typeof settings.laEle === 'number') ? settings.laEle : 0.36) * 100);
    laeleLabel.textContent = `${laeleSlider.value}%`;
    laeleSlider.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      laeleLabel.textContent = `${Math.round(v*100)}%`;
      settings.laEle = v;
      try { if(typeof laEleSound !== 'undefined') laEleSound.volume = v; } catch(e){}
      saveSettings(settings);
    });
  }

  settingsBtn.addEventListener('click', ()=> {
    settingsModal.setAttribute('aria-hidden','false');
  });
  settingsClose.addEventListener('click', ()=> {
    settingsModal.setAttribute('aria-hidden','true');
  });

  // Skins UI wiring
  const skinsModal = document.getElementById('skinsModal');
  const skinsBtn = document.getElementById('skinsBtn');
  const skinsClose = document.getElementById('skinsClose');
  const saveSkinBtn = document.getElementById('saveSkinBtn');
  const skinList = document.getElementById('skinList');

  // define available skins
  const SKINS = [
    { id: 'default', name: 'Padrão', src: '/OIP (3).webp', boost: 0 }, // default no boost
    { id: 'noob', name: 'Noob', src: '/noob.png', boost: 0.02 }, // small 2% boost
    { id: 'man_classico', name: 'Manoel Clássico', src: '/OIP (2).webp', boost: 0.12, unlock: s => s.prestige >= 1, desc: 'Concedido no primeiro Prestige' },
    { id: 'viciado', name: 'Viciado!!', src: '/OIP (3).webp', boost: 0.2, unlock: s => s.totalEarned >= 5_000_000, desc: 'Concedido ao alcançar 5.000.000' }
  ];

  // render skin list based on unlocks and owned
  function renderSkinsList(){
    skinList.innerHTML = '';
    const users = loadUsers();
    const current = currentUser ? (users[currentUser] && users[currentUser].skinSelection) : null;
    for(const sk of SKINS){
      const unlocked = !sk.unlock || sk.unlock(state) || (state.skinsOwned && state.skinsOwned.includes(sk.id));
      const btn = document.createElement('button');
      btn.className = 'avatar-choice';
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.padding = '6px';
      btn.style.minWidth = '84px';
      btn.dataset.skin = sk.id;
      btn.innerHTML = `<img src="${sk.src}" alt="${sk.name}" style="width:56px;height:56px;border-radius:10px;object-fit:cover"/><div style="font-size:12px;margin-top:6px">${sk.name}</div>`;
      if(!unlocked) { btn.style.opacity = '0.35'; btn.disabled = true; btn.title = 'Trave: ' + (sk.desc || 'Desbloqueie'); }
      if(current === sk.id || state.equippedSkin === sk.id) btn.setAttribute('aria-selected','true');
      btn.addEventListener('click', ()=>{
        // visual selection
        skinList.querySelectorAll('.avatar-choice').forEach(x => x.removeAttribute('aria-selected'));
        btn.setAttribute('aria-selected','true');
        // temp selection stored on button dataset
        skinList.dataset.selected = sk.id;
      });
      skinList.appendChild(btn);
    }
  }

  // open skins modal
  skinsBtn.addEventListener('click', ()=>{
    // auto-grant unlocks if conditions met (so skins appear as owned)
    for(const sk of SKINS){
      if(sk.unlock && sk.unlock(state)){
        if(!state.skinsOwned.includes(sk.id)) state.skinsOwned.push(sk.id);
      }
    }
    renderSkinsList();
    skinsModal.setAttribute('aria-hidden','false');
  });

  skinsClose.addEventListener('click', ()=> {
    skinsModal.setAttribute('aria-hidden','true');
  });

  // save skin selection for current user
  saveSkinBtn.addEventListener('click', ()=>{
    const sel = skinList.dataset.selected || state.equippedSkin || 'default';
    state.equippedSkin = sel;
    if(currentUser){
      const users = loadUsers();
      users[currentUser] = users[currentUser] || {};
      users[currentUser].skinSelection = sel;
      // also persist avatar area image to reflect selection
      if(SKINS.find(s=>s.id===sel)) users[currentUser].avatar = SKINS.find(s=>s.id===sel).src;
      saveUsers(users);
    }
    // apply skin to clicker icon immediately
    applyEquippedSkin();
    saveState();
    render();
    flash('Skin salva');
    skinsModal.setAttribute('aria-hidden','true');
  });

  // apply state equipped skin to clicker icon and adjust perClick
  function applyEquippedSkin(){
    const icon = document.getElementById('icon');
    const sid = state.equippedSkin || (currentUser ? (loadUsers()[currentUser] && loadUsers()[currentUser].skinSelection) : null) || 'default';
    const sk = SKINS.find(s=>s.id===sid) || SKINS[0];
    if(icon && sk) icon.src = sk.src;
    // store boost as special state field (not persisted outside state)
    state.skinBoost = sk ? (sk.boost || 0) : 0;
    recalcFromItems(); // recalc will incorporate skin boost (we'll apply in recalc)
  }

  // initial apply if saved
  applyEquippedSkin();
});

/* --- AUTH UI wiring --- */
function showAuthModal(mode = 'login'){
  authUI.modal = el('authModal');
  authUI.username = el('authUsername');
  authUI.password = el('authPassword');
  authUI.msg = el('authMsg');
  authUI.submit = document.getElementById('authSubmit');
  authUI.toggle = document.getElementById('authToggle');

  // avatar choices and save-login checkbox
  const avatarChoices = document.querySelectorAll('.avatar-choice');
  authUI.avatar = '/noob.png'; // default

  // set selection helper
  function selectAvatarButton(btn){
    avatarChoices.forEach(b=>b.removeAttribute('aria-selected'));
    if(btn){
      btn.setAttribute('aria-selected','true');
      authUI.avatar = btn.getAttribute('data-avatar');
    }
  }

  avatarChoices.forEach(btn => {
    btn.removeAttribute('aria-selected');
    btn.addEventListener('click', () => {
      selectAvatarButton(btn);
    });
  });

  // mark default; if current user exists, prefer their saved avatar
  const defBtn = document.querySelector('.avatar-choice[data-avatar="/noob.png"]');
  if(currentUser){
    const users = loadUsers();
    const uobj = users[currentUser] || {};
    const preferred = uobj.avatar || '/noob.png';
    const prefBtn = document.querySelector(`.avatar-choice[data-avatar="${preferred}"]`);
    if(prefBtn) selectAvatarButton(prefBtn); else if(defBtn) selectAvatarButton(defBtn);
  } else {
    if(defBtn) selectAvatarButton(defBtn);
  }

  // Save Avatar button (visible only when editing while logged in)
  const saveAvatarBtn = document.getElementById('saveAvatarBtn');
  if(saveAvatarBtn){
    if(currentUser){
      saveAvatarBtn.style.display = 'inline-flex';
    } else {
      saveAvatarBtn.style.display = 'none';
    }
    saveAvatarBtn.onclick = () => {
      if(!currentUser){
        flash('Nenhum usuário logado para salvar o avatar.');
        return;
      }
      const users = loadUsers();
      users[currentUser] = users[currentUser] || {};
      users[currentUser].avatar = authUI.avatar || '/noob.png';
      saveUsers(users);
      renderLeaderboard();
      flash('Avatar salvo');
      // keep modal open so user can continue; optionally close if desired:
      // authUI.modal.setAttribute('aria-hidden','true');
    };
  }

  authUI.mode = mode;
  authUI.toggle.textContent = mode === 'login' ? 'Modo: Login' : 'Modo: Registrar';
  authUI.msg.textContent = '';
  authUI.username.value = '';
  authUI.password.value = '';
  // ensure save checkbox default unchecked
  const saveChk = document.getElementById('saveLoginChk');
  if(saveChk) saveChk.checked = true;
  authUI.modal.setAttribute('aria-hidden', 'false');

  authUI.toggle.onclick = () => {
    authUI.mode = authUI.mode === 'login' ? 'register' : 'login';
    authUI.toggle.textContent = authUI.mode === 'login' ? 'Modo: Login' : 'Modo: Registrar';
    authUI.msg.textContent = '';
  };

  // wire auth close button so users can exit the modal without logging in
  const authClose = document.getElementById('authCloseBtn');
  if(authClose){
    authClose.onclick = () => {
      authUI.modal.setAttribute('aria-hidden', 'true');
      authUI.msg.textContent = '';
    };
  }

  authUI.submit.onclick = () => {
    const u = (authUI.username.value || '').trim();
    const p = (authUI.password.value || '').trim();
    if(!u || !p){ authUI.msg.textContent = 'Digite username e senha.'; return; }
    const users = loadUsers();
    const saveLogin = document.getElementById('saveLoginChk')?.checked;
    const chosenAvatar = authUI.avatar || '/noob.png';

    if(authUI.mode === 'register'){
      if(users[u]) {
        // username taken: offer quick available variations
        const suggestions = [];
        for(let i=1;i<=6;i++){
          const cand = `${u}${Math.floor(Math.random()*900)+100 + i}`; // u + random 3-digit + small increment
          if(!users[cand] && suggestions.length < 3) suggestions.push(cand);
        }
        // fallback numeric suggestions if none unique generated
        let counter = 1;
        while(suggestions.length < 3){
          const cand = `${u}${counter}`;
          if(!users[cand]) suggestions.push(cand);
          counter++;
        }
        authUI.msg.innerHTML = 'Username já existe. Tente uma variação: ' + suggestions.map(s => `<button class="suggest-btn" data-name="${s}" style="margin:4px;padding:6px 8px;border-radius:8px;border:none;background:rgba(31,182,255,0.08);color:var(--muted);font-weight:800">${s}</button>`).join('');
        // delegate click to suggestions
        authUI.msg.querySelectorAll('.suggest-btn').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            authUI.username.value = btn.getAttribute('data-name');
            authUI.msg.textContent = 'Username preenchido com sugestão. Complete a senha e confirme.';
          });
        });
        return;
      }
      users[u] = { password: p, avatar: chosenAvatar };
      saveUsers(users);
      authUI.msg.textContent = 'Conta criada. Entrando...';
      setTimeout(()=> finishLogin(u, saveLogin), 600);
    } else {
      if(!users[u] || users[u].password !== p){ authUI.msg.textContent = 'Credenciais incorretas.'; return; }
      // ensure avatar present
      if(!users[u].avatar) users[u].avatar = chosenAvatar;
      saveUsers(users);
      authUI.msg.textContent = 'Entrando...';
      setTimeout(()=> finishLogin(u, saveLogin), 300);
    }
  };
}

function finishLogin(username, remember = true){
  currentUser = username;
  // remember user in a cookie for auto-login if requested
  try { 
    if(remember) setCookie('laele_user', username, 30); 
    else eraseCookie('laele_user');
  } catch(e){}
  el('authModal').setAttribute('aria-hidden', 'true');

  // refresh users map and ensure avatar exists
  const users = loadUsers();
  if(users && users[username] && users[username].avatar){
    // show avatar in top area
    const ua = document.getElementById('userAvatar');
    if(ua) ua.src = users[username].avatar;
  }

  // load leaderboard map fresh
  leaderboard = loadLeaderboard();
  // load or create saved state
  state = loadState();
  recalcFromItems();

  // ensure the logged user is assigned to a server automatically if they don't have one
  try {
    const uobj = users[username] || {};
    if(!uobj.currentRoom){
      const assigned = assignVisitorToRoom(username);
      if(assigned) {
        users[username] = users[username] || {};
        users[username].currentRoom = assigned;
        saveUsers(users);
      }
    }
  } catch(e){ /* noop */ }

  render();
  saveState();
  // refresh friend list and chat for new login
  renderFriendList && renderFriendList();
  renderChat && renderChat();
  flash(`Bem-vindo, @${currentUser}`);
}

/* --- end auth --- */

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

  // grant special skin on first prestige
  if(!state.skinsOwned.includes('man_classico')){
    state.skinsOwned.push('man_classico');
    state.equippedSkin = 'man_classico';
    // also set user's avatar to that skin if logged in
    if(currentUser){
      const users = loadUsers();
      users[currentUser] = users[currentUser] || {};
      users[currentUser].avatar = '/OIP (2).webp';
      users[currentUser].skinSelection = 'man_classico';
      saveUsers(users);
    }
    flash('Você ganhou a skin Manoel Clássico!');
  }

  saveState();
  recalcFromItems();
  applyEquippedSkin && applyEquippedSkin();
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

// Custom scroll implementation: control the #app translateY inside #scrollWrapper
const scrollWrapper = document.getElementById('scrollWrapper');
const scrollContent = document.getElementById('app');
let scrollOffset = 0;
function maxScroll(){
  if(!scrollWrapper || !scrollContent) return 0;
  return Math.max(0, scrollContent.scrollHeight - scrollWrapper.clientHeight);
}
function clamp(v){ return Math.max(0, Math.min(maxScroll(), v)); }
function applyScroll(){
  scrollOffset = clamp(scrollOffset);
  scrollContent.style.transform = `translateY(${-scrollOffset}px)`;
}
function scrollByOffset(delta){
  scrollOffset = clamp(scrollOffset + delta);
  // smooth transition
  scrollContent.style.transition = 'transform 280ms cubic-bezier(.2,.9,.3,1)';
  applyScroll();
  setTimeout(()=> { scrollContent.style.transition = ''; }, 300);
}

// arrow buttons
const scrollUpBtn = document.getElementById('scrollUp');
const scrollDownBtn = document.getElementById('scrollDown');
if(scrollUpBtn) scrollUpBtn.addEventListener('click', ()=> scrollByOffset(-120));
if(scrollDownBtn) scrollDownBtn.addEventListener('click', ()=> scrollByOffset(120));

// touch swipe for mobile
let touchStartY = null;
let touchLastY = null;
let touchAccum = 0;
document.addEventListener('touchstart', (e)=>{
  if(e.touches && e.touches.length === 1){
    touchStartY = e.touches[0].clientY;
    touchLastY = touchStartY;
    touchAccum = 0;
  }
}, {passive:true});

document.addEventListener('touchmove', (e)=>{
  if(!touchStartY || !e.touches || e.touches.length !== 1) return;
  const y = e.touches[0].clientY;
  const dy = touchLastY - y; // positive when swiping up (we want to scroll down)
  touchLastY = y;
  touchAccum += dy;
  // apply immediate small scroll for responsive feel
  scrollByOffset(dy);
  // prevent native page scroll
  e.preventDefault();
}, {passive:false});

document.addEventListener('touchend', ()=>{
  touchStartY = null;
  touchLastY = null;
  touchAccum = 0;
});

// mouse wheel support for trackpads/mice but still controlling custom scroll
document.addEventListener('wheel', (e)=>{
  // if modifier keys pressed, let browser handle it
  if(e.ctrlKey || e.metaKey) return;
  // use deltaY to scroll
  scrollByOffset(e.deltaY);
  e.preventDefault();
}, {passive:false});

// ensure layout recalcs on resize
window.addEventListener('resize', ()=> {
  // clamp offset if content height shrank
  scrollOffset = clamp(scrollOffset);
  applyScroll();
});

// initial apply and small animation
applyScroll();
setTimeout(()=>{ $clickerBtn.animate([{transform:'scale(0.98)'},{transform:'scale(1)'}], {duration:420,easing:'cubic-bezier(.2,.9,.3,1)'}); },200);