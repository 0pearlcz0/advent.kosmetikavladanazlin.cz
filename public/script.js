// --- Konfigurace ---
const REWARDS_URL = 'rewards.txt';
const API_STATUS = '/api/status';
const API_CLAIM = '/api/claim';

// --- DOM ---
const calendarGrid = document.getElementById('calendar-grid');
const todayPill = document.getElementById('today-pill');
const doorPanel = document.getElementById('door-panel');
const closeDoorBtn = document.getElementById('close-door');
const doorTitle = document.getElementById('door-title');
const doorDesc = document.getElementById('door-desc');
const quotaBadge = document.getElementById('quota-badge');
const quotaInfo = document.getElementById('quota-info');
const emailForm = document.getElementById('email-form');
const couponArea = document.getElementById('coupon-area');
const couponCanvas = document.getElementById('coupon-canvas');
const downloadBtn = document.getElementById('download-coupon');
const printBtn = document.getElementById('print-coupon');
const toastEl = document.getElementById('toast');

let rewards = null;
let today = null;
let activeDay = null;
let activeCode = null;
let serverCounts = {}; // načtené counts.json ze serveru

// --- UI pomocné ---
function showToast(msg, type='') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;
  requestAnimationFrame(()=> {
    toastEl.classList.add('show');
    setTimeout(()=> toastEl.classList.remove('show'), 2600);
  });
}

function getToday() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth()+1, day: now.getDate() };
}

// --- Načtení konfigurace a stavu ze serveru ---
async function loadConfigAndStatus() {
  try {
    const r = await fetch(REWARDS_URL, {cache:'no-store'});
    if (!r.ok) throw new Error('Nelze načíst rewards');
    rewards = await r.json();
  } catch (e) {
    console.error('Chyba načtení rewards:', e);
    showToast('Nepodařilo se načíst konfiguraci odměn', 'error');
    rewards = { year: today.year, month: 12, days: {} };
  }

  try {
    const s = await fetch(API_STATUS, {cache:'no-store'});
    if (s.ok) {
      serverCounts = await s.json();
    } else {
      serverCounts = {};
    }
  } catch (e) {
    console.warn('Status API nedostupné, použiji lokální stav', e);
    serverCounts = {};
  }
}

// --- Vykreslení kalendáře (1–24) ---
function buildCalendar() {
  calendarGrid.innerHTML = '';
  for (let d=1; d<=24; d++) {
    const cell = document.createElement('button');
    cell.className = 'day locked';
    cell.type = 'button';

    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = d;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Prosinec';

    cell.appendChild(num);
    cell.appendChild(label);

    if (rewards && rewards.month === 12 && rewards.year === today.year) {
      if (d === today.day) {
        cell.classList.remove('locked');
        cell.classList.add('today');
        cell.title = 'Otevřít dnešní okénko';
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', ()=> openDoor(d));
      } else if (d < today.day) {
        cell.classList.remove('locked');
        cell.classList.add('past');
        cell.title = 'Minulý den (již uzavřen)';
      } else {
        cell.title = 'Ještě nepřišel';
      }
    } else {
      if (d === today.day) {
        cell.classList.remove('locked');
        cell.classList.add('today');
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', ()=> openDoor(d));
      } else if (d < today.day) {
        cell.classList.remove('locked');
        cell.classList.add('past');
      }
    }

    calendarGrid.appendChild(cell);
  }

  todayPill.textContent = `Dnešní den: ${String(today.day).padStart(2,'0')}. ${String(today.month).padStart(2,'0')}. ${today.year}`;
}

// --- Otevření okénka ---
function openDoor(day) {
  activeDay = day;
  const config = rewards.days && rewards.days[String(day)] ? rewards.days[String(day)] : null;
  doorTitle.textContent = `Den ${day} — ${config ? config.title : 'Překvapení'}`;
  doorDesc.textContent = config ? config.description : 'Dnešní dárek pro první tři!';
  updateQuotaUI();
  couponArea.hidden = true;
  emailForm.hidden = false;
  const emailInput = document.getElementById('email');
  if (emailInput) emailInput.value = '';
  doorPanel.hidden = false;
  doorPanel.setAttribute('aria-hidden','false');
  setTimeout(()=> { const input = document.getElementById('email'); if (input) input.focus(); }, 120);
}

function closeDoor() {
  doorPanel.hidden = true;
  doorPanel.setAttribute('aria-hidden','true');
  activeDay = null;
  activeCode = null;
  couponArea.hidden = true;
  emailForm.hidden = false;
}

closeDoorBtn.addEventListener('click', closeDoor);

// --- Aktualizace kvóty podle serverCounts ---
function updateQuotaUI() {
  if (activeDay == null) return;
  const config = rewards.days && rewards.days[String(activeDay)] ? rewards.days[String(activeDay)] : null;
  const dayCount = serverCounts[String(activeDay)]?.count || 0;
  const limit = config?.dailyLimit || 3;
  const remaining = Math.max(limit - dayCount, 0);
  quotaBadge.textContent = `Zbývá: ${remaining}`;
  quotaInfo.textContent = `Denní limit: ${limit}`;
}

// --- Odeslání požadavku na server pro přidělení kódu ---
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('email');
  const email = String(emailInput.value || '').trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    showToast('Zadej platný e‑mail', 'error');
    return;
  }
  if (activeDay == null) {
    showToast('Nejprve otevři dnešní okénko', 'error');
    return;
  }

  try {
    const res = await fetch(API_CLAIM, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ day: activeDay, email })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Chyba při nároku', 'error');
      await refreshServerStatus();
      updateQuotaUI();
      return;
    }

    activeCode = data.code;
    showToast('Gratulujeme! Kód byl přidělen.', 'success');

    await refreshServerStatus();
    updateQuotaUI();

    await renderCouponCanvas({
      day: activeDay,
      title: data.title,
      description: data.description,
      code: data.code
    });

    emailForm.hidden = true;
    couponArea.hidden = false;
  } catch (err) {
    console.error('Claim error', err);
    showToast('Server nedostupný', 'error');
  }
});

// --- Refresh serverCounts ---
async function refreshServerStatus() {
  try {
    const s = await fetch(API_STATUS, {cache:'no-store'});
    if (s.ok) serverCounts = await s.json();
  } catch (e) {
    console.warn('Nelze načíst status', e);
  }
}

// --- Vykreslení kuponu (canvas) ---
async function renderCouponCanvas({ day, title, description, code }) {
  const ctx = couponCanvas.getContext('2d');
  const w = couponCanvas.width;
  const h = couponCanvas.height;

  const grad = ctx.createLinearGradient(0,0,w,h);
  grad.addColorStop(0, '#111639');
  grad.addColorStop(1, '#0a0e25');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);

  for (let i=0;i<80;i++){
    const x = Math.random()*w;
    const y = Math.random()*h;
    const r = Math.random()*1.6+0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(229,199,122,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18,18,w-36,h-36);

  ctx.fillStyle = '#e5c77a';
  ctx.font = '700 44px Playfair Display, serif';
  ctx.fillText('Vánoční kosmetický poukaz', 40, 96);

  ctx.fillStyle = '#9aa4b2';
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillText(`Den ${day} — ${title}`, 40, 140);

  wrapText(ctx, description, 40, 180, w-80, 26, '#e8ecf1', '400 20px Inter, sans-serif');

  const codeY = 320;
  roundRect(ctx, 40, codeY-60, w-80, 120, 16, true, true, 'rgba(63,209,183,0.5)');
  ctx.fillStyle = '#3fd1b7';
  ctx.font = '700 44px Inter, sans-serif';
  ctx.fillText(code, 60, codeY);

  ctx.fillStyle = '#9aa4b2';
  ctx.font = '400 16px Inter, sans-serif';
  ctx.fillText('Ukaž kód při nákupu online nebo v prodejně. Platí pouze dnes pro prvních 3 uživatele.', 40, h-60);

  ctx.fillStyle = '#ff8aa0';
  ctx.font = '700 18px Inter, sans-serif';
  ctx.fillText('© Vánoční kosmetika', w-260, h-30);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, strokeColor) {
  if (typeof r === 'number') r = {tl:r,tr:r,br:r,bl:r};
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  if (fill) ctx.fill();
  if (stroke) { ctx.strokeStyle = strokeColor || ctx.strokeStyle; ctx.stroke(); }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (let n=0; n<words.length; n++){
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n>0){
      ctx.fillText(line, x, yy);
      line = words[n] + ' ';
      yy += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, yy);
}

// --- Stahování a tisk kuponu ---
downloadBtn.addEventListener('click', () => {
  if (!activeDay) return;
  const link = document.createElement('a');
  link.download = `poukaz-den-${activeDay}.png`;
  link.href = couponCanvas.toDataURL('image/png');
  link.click();
});

printBtn.addEventListener('click', () => {
  const dataUrl = couponCanvas.toDataURL('image/png');
  const win = window.open('');
  win.document.write(`<img src="${dataUrl}" style="width:100%; max-width:900px; display:block; margin:0 auto;">`);
  win.document.close();
  win.focus();
  win.print();
  setTimeout(()=>win.close(), 500);
});

// --- Inicializace ---
(async function init(){
  today = getToday();
  await loadConfigAndStatus();
  buildCalendar();
})();

