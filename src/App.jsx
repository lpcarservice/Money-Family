import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Wallet, TrendingUp, TrendingDown, CreditCard, ShieldCheck, Building2, Plus, Trash2, X, Settings, RefreshCw, CloudOff } from 'lucide-react';

const PALETTE = {
  paper: '#F3F7FD',      // พื้นหลังหน้า ฟ้าจางมาก
  paperAlt: '#EEF4FE',   // หัวตาราง
  surface: '#FFFFFF',
  ink: '#0F2043',        // ตัวหนังสือหลัก
  inkSoft: '#6B7C99',    // ตัวหนังสือรอง
  gold: '#2563EB',       // สีเน้น (ชื่อคีย์เดิม ค่าใหม่เป็นน้ำเงิน)
  goldSoft: '#DBEAFE',
  primaryDeep: '#15307A',
  green: '#0E9F6E',
  red: '#E02424',
  border: '#E2EAF7',
};

const SHADOW_CARD = '0 1px 2px rgba(15,32,67,0.05), 0 4px 16px rgba(15,32,67,0.06)';
const SHADOW_LIFT = '0 6px 20px rgba(37,99,235,0.35)';

const EXPENSE_CATS = ['อาหาร', '7-11', 'ที่อยู่อาศัย', 'เดินทาง', 'ผ่อนชำระ', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'ของใช้ส่วนตัว', 'unfiled', 'ปาร์ตี้', 'อื่นๆ'];
const INCOME_CATS = ['เงินเดือน', 'รายได้ธุรกิจ', 'เงินปันผล/ดอกเบี้ย', 'ค่าคอมมิชชั่น', 'อื่นๆ'];
const DEBT_TYPES = ['บัตรเครดิต', 'บัตรกดเงินสด', 'สินเชื่อบ้าน', 'สินเชื่อรถ', 'สินเชื่อธุรกิจ', 'กู้ยืมส่วนบุคคล', 'อื่นๆ'];
const ACCOUNTS = ['เงินสด', 'ธนาคารไทยพาณิชย์ (SCB)', 'ธนาคารกรุงไทย (KTB)', 'ธนาคารกสิกรไทย (KBank)', 'บัญชีธนาคารอื่น', 'พร้อมเพย์/โอน', 'บัตรเครดิต', 'บัตรกดเงินสด', 'e-Wallet', 'อื่นๆ'];
const INSURANCE_TYPES = ['ชีวิต', 'สุขภาพ', 'รถยนต์', 'บ้าน/อัคคีภัย', 'อุบัติเหตุ', 'อื่นๆ'];
const ASSET_TYPES = ['เงินฝาก/เงินสด', 'อสังหาริมทรัพย์', 'รถยนต์', 'หุ้น/กองทุน', 'ทองคำ', 'ธุรกิจ/หุ้นส่วน', 'อื่นๆ'];

const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const todayStr = () => new Date().toISOString().slice(0, 10);

// Apps Script ตอนเย็นเครื่อง (cold start) ใช้เวลาได้ถึง ~20 วิ
const REQUEST_TIMEOUT = 25000;

const newId = () => 'ID' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`เซิร์ฟเวอร์ตอบกลับ ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('รอนานเกินไป เน็ตอาจช้าหรือ Apps Script ไม่ตอบ');
    if (e instanceof TypeError) throw new Error('ต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจ URL หรือสัญญาณเน็ต');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

// แอปถูกเสิร์ฟจาก Apps Script เอง → เรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ได้ตรงๆ ไม่ต้องมี URL ไม่ติด CORS
// ถ้ารันบนเครื่อง (npm run dev) จะไม่มี google.script → ถอยไปใช้ fetch กับ URL ที่วางไว้
const isEmbedded = () => typeof google !== 'undefined' && !!(google.script && google.script.run);

function gasCall(fnName, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('รอนานเกินไป เซิร์ฟเวอร์ไม่ตอบ')), REQUEST_TIMEOUT);
    google.script.run
      .withSuccessHandler(r => { clearTimeout(timer); resolve(r); })
      .withFailureHandler(e => { clearTimeout(timer); reject(new Error((e && e.message) || 'เซิร์ฟเวอร์ผิดพลาด')); })
      [fnName](...args);
  });
}

function useApi(baseUrl) {
  const embedded = isEmbedded();

  // ดึงทุกชีทในครั้งเดียว — ยิงพร้อมกัน 4 เส้นทำให้ Apps Script คิวตันบ่อย
  const fetchAll = useCallback(() => withRetry(() => (
    embedded ? gasCall('apiGetAll') : fetchJson(`${baseUrl}?action=all&t=${Date.now()}`)
  )), [baseUrl, embedded]);

  // retry ฝั่งเขียนปลอดภัย เพราะทุก request แนบ ID มาเอง แล้ว backend กันซ้ำให้
  const mutate = useCallback((sheet, body) => withRetry(() => {
    if (embedded) {
      return body.action === 'add'
        ? gasCall('apiAdd', sheet, body.data)
        : gasCall('apiDelete', sheet, body.id);
    }
    return fetchJson(baseUrl, { method: 'POST', body: JSON.stringify({ sheet, ...body }) });
  }, 2), [baseUrl, embedded]);

  return { fetchAll, mutate, embedded };
}

const CACHE_KEY = 'finance-cache-v1';
const QUEUE_KEY = 'finance-queue-v1';
const SHEETS = ['Transactions', 'Debts', 'Insurance', 'Assets'];
const EMPTY_DATA = { Transactions: [], Debts: [], Insurance: [], Assets: [] };

const readLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
};
const writeLS = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};

function Toast({ status, onRetry, onClose }) {
  if (!status) return null;
  const isErr = status.type === 'error';
  return (
    <div className="fixed top-3 left-3 right-3 z-[60] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm"
      style={{ background: isErr ? PALETTE.red : PALETTE.green, color: '#fff' }}>
      <span className="flex-1">{status.text}</span>
      {isErr && onRetry && <button onClick={onRetry} className="underline shrink-0">ลองใหม่</button>}
      <button onClick={onClose} className="shrink-0"><X size={16} color="#fff" /></button>
    </div>
  );
}

function SyncLine({ online, loading, pending, lastSync }) {
  let text, icon = null;
  if (!online) { text = 'ออฟไลน์ — บันทึกเก็บไว้ในเครื่องก่อน'; icon = <CloudOff size={11} />; }
  else if (pending) text = `กำลังส่ง ${pending} รายการ…`;
  else if (loading) text = 'กำลังซิงค์…';
  else if (lastSync) text = `อัปเดตล่าสุด ${new Date(lastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
  else text = 'ยังไม่ได้ซิงค์';
  return (
    <div className="text-[11px] mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white/85"
      style={{ background: 'rgba(255,255,255,0.14)' }}>
      {icon || <span className="w-1.5 h-1.5 rounded-full" style={{ background: pending || loading ? '#FCD34D' : '#6EE7B7' }} />}
      {text}
    </div>
  );
}

// กันกดปุ่มบันทึกรัวจนได้รายการซ้ำ และบอกผู้ใช้ว่ากำลังส่งอยู่
function useSubmit(onSave) {
  const [busy, setBusy] = useState(false);
  const submit = async (f) => {
    if (busy) return;
    setBusy(true);
    await onSave(f);
    setBusy(false);
  };
  return [busy, submit];
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: PALETTE.inkSoft }} className="text-xs tracking-wide">{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: PALETTE.surface,
  border: `1px solid ${PALETTE.border}`,
  color: PALETTE.ink,
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,32,67,0.45)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-7 max-h-[92vh] overflow-y-auto"
        style={{ background: PALETTE.paper }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: PALETTE.border }} />
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ color: PALETTE.ink }} className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-full active:scale-90 transition" style={{ background: PALETTE.paperAlt }}>
            <X size={17} color={PALETTE.inkSoft} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'ink', sub }) {
  const color = tone === 'green' ? PALETTE.green : tone === 'red' ? PALETTE.red : PALETTE.ink;
  const chip = tone === 'green' ? '#E6F6EF' : tone === 'red' ? '#FDECEC' : PALETTE.goldSoft;
  return (
    <div className="rounded-2xl p-4 flex-1 min-w-[145px]"
      style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, boxShadow: SHADOW_CARD }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="rounded-lg p-1.5 flex" style={{ background: chip }}>
          <Icon size={14} color={color} />
        </span>
        <span style={{ color: PALETTE.inkSoft }} className="text-xs">{label}</span>
      </div>
      <div style={{ color }} className="text-[1.6rem] leading-tight font-semibold tnum">
        {value < 0 && <span className="mr-0.5">−</span>}
        <span className="text-base font-normal opacity-60 mr-0.5">฿</span>{money(Math.abs(value))}
      </div>
      {sub && <div style={{ color: PALETTE.inkSoft }} className="text-xs mt-1">{sub}</div>}
    </div>
  );
}

// numericFrom = คอลัมน์ตั้งแต่ลำดับนี้ไปเป็นตัวเลข ให้ชิดขวาให้ตรงกับค่าในตาราง
function Table({ columns, rows, onDelete, renderRow, numericFrom = 99 }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl py-14 px-6 text-center"
        style={{ background: PALETTE.surface, border: `1px dashed ${PALETTE.border}` }}>
        <div className="mx-auto mb-3 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: PALETTE.goldSoft }}>
          <Plus size={20} color={PALETTE.gold} />
        </div>
        <div style={{ color: PALETTE.ink }} className="text-sm font-medium">ยังไม่มีรายการ</div>
        <div style={{ color: PALETTE.inkSoft }} className="text-xs mt-1">กดปุ่ม + มุมขวาล่างเพื่อเริ่มบันทึก</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, boxShadow: SHADOW_CARD }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: PALETTE.paperAlt }}>
              {columns.map((c, i) => (
                <th key={c} style={{ color: PALETTE.inkSoft }}
                  className={`font-medium px-3 py-2.5 text-[11px] whitespace-nowrap ${i >= numericFrom ? 'text-right' : 'text-left'}`}>{c}</th>
              ))}
              <th className="w-9"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.ID || i} title={row._pending ? 'ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์' : undefined}
                style={{ borderTop: `1px solid ${PALETTE.border}`, opacity: row._pending ? 0.45 : 1 }}>
                {renderRow(row)}
                <td className="px-2 text-right">
                  <button onClick={() => onDelete(row.ID)} aria-label="ลบรายการ"
                    className="p-1.5 rounded-lg active:scale-90 transition">
                    <Trash2 size={14} color={PALETTE.inkSoft} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinanceApp() {
  const [baseUrl, setBaseUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  // เริ่มจากข้อมูลที่ค้างไว้ในเครื่อง → เปิดแอปมาเห็นเลข ไม่ต้องรอเซิร์ฟเวอร์
  const [data, setData] = useState(() => readLS(CACHE_KEY, EMPTY_DATA));
  const [queue, setQueue] = useState(() => readLS(QUEUE_KEY, []));
  const [status, setStatus] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lastSync, setLastSync] = useState(null);
  const { fetchAll, mutate, embedded } = useApi(baseUrl);

  const queueRef = useRef(queue);
  const flushing = useRef(false);
  const everLoaded = useRef(false);

  useEffect(() => { queueRef.current = queue; writeLS(QUEUE_KEY, queue); }, [queue]);
  useEffect(() => { writeLS(CACHE_KEY, data); }, [data]);

  // ข้อความสำเร็จหายเอง ส่วน error ค้างไว้ให้กดลองใหม่
  useEffect(() => {
    if (status?.type !== 'ok') return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => {
    if (embedded) { setConfigLoaded(true); return; }
    try {
      const saved = localStorage.getItem('apps-script-url');
      if (saved) { setBaseUrl(saved); setUrlInput(saved); }
    } catch (e) {}
    setConfigLoaded(true);
  }, [embedded]);

  const ready = embedded || !!baseUrl;

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await fetchAll();
      if (!r || r.success === false) throw new Error(r?.error || 'ไม่ทราบสาเหตุ');
      const d = r.data || {};
      setData({
        Transactions: d.Transactions || [],
        Debts: d.Debts || [],
        Insurance: d.Insurance || [],
        Assets: d.Assets || [],
      });
      everLoaded.current = true;
      setLastSync(Date.now());
      setStatus(s => (s?.type === 'error' ? null : s));
    } catch (e) {
      // ถ้ายังมี cache ให้ดูอยู่ ไม่ต้องตกใจผู้ใช้ — แถบสถานะบนหัวบอกอยู่แล้วว่าซิงค์ไม่ผ่าน
      if (!everLoaded.current) setStatus({ type: 'error', text: `โหลดข้อมูลไม่สำเร็จ: ${e.message}` });
    }
    setLoading(false);
  }, [ready, fetchAll]);

  // ส่งของในคิวทีละชิ้นตามลำดับ ล้มเมื่อไหร่หยุดไว้ก่อน เดี๋ยวรอบหน้ามาต่อ
  const flush = useCallback(async () => {
    if (flushing.current || !ready || !queueRef.current.length) return;
    flushing.current = true;
    try {
      while (queueRef.current.length) {
        const op = queueRef.current[0];
        const body = op.action === 'add'
          ? { action: 'add', data: op.data }
          : { action: 'delete', id: op.id };
        const r = await mutate(op.sheet, body);
        if (!r || r.success === false) throw new Error(r?.error || 'ส่งข้อมูลไม่สำเร็จ');
        queueRef.current = queueRef.current.filter(o => o.opId !== op.opId);
        setQueue(q => q.filter(o => o.opId !== op.opId));
      }
      await refresh();
    } catch (e) {
      setStatus({
        type: 'error',
        text: `ยังส่งขึ้นเซิร์ฟเวอร์ไม่ได้ (ค้าง ${queueRef.current.length} รายการ) — ข้อมูลอยู่ในเครื่องแล้ว จะลองส่งใหม่ให้เอง`,
      });
    } finally {
      flushing.current = false;
    }
  }, [ready, mutate, refresh]);

  useEffect(() => { if (ready) { refresh(); flush(); } }, [ready]);
  useEffect(() => { if (queue.length) flush(); }, [queue.length, flush]);

  // กลับมาที่แอปเมื่อไหร่ดึงของใหม่ทันที + เช็คทุก 60 วิ → อีกคนบันทึกแล้วเราเห็นเอง
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      flush();
      refresh();
    };
    const id = setInterval(tick, 60000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [ready, flush, refresh]);

  const saveUrl = () => {
    const clean = urlInput.trim();
    try { localStorage.setItem('apps-script-url', clean); } catch (e) {}
    setBaseUrl(clean);
  };

  // สิ่งที่แสดงบนจอ = ข้อมูลจากเซิร์ฟเวอร์ + ของที่ยังรอส่ง - ของที่สั่งลบไว้
  const view = useMemo(() => {
    const out = {};
    SHEETS.forEach(s => {
      const pendingDel = new Set(queue.filter(o => o.sheet === s && o.action === 'delete').map(o => o.id));
      const added = queue.filter(o => o.sheet === s && o.action === 'add').map(o => ({ ...o.data, _pending: true }));
      out[s] = [...(data[s] || []), ...added].filter(r => !pendingDel.has(r.ID));
    });
    return out;
  }, [data, queue]);

  const addRow = (sheet, payload) => {
    // เข้าคิวแล้วถือว่าเสร็จทันที ผู้ใช้ไม่ต้องรอ Apps Script ตื่น
    setQueue(q => [...q, { opId: newId(), sheet, action: 'add', data: { ...payload, ID: newId() } }]);
    setModal(null);
    setStatus({ type: 'ok', text: 'บันทึกแล้ว' });
    return true;
  };

  const deleteRow = (sheet, id) => {
    if (!window.confirm('ลบรายการนี้?')) return;
    const pendingAdd = queue.find(o => o.sheet === sheet && o.action === 'add' && o.data.ID === id);
    // ยังไม่ทันส่งขึ้นไป ก็แค่ถอนออกจากคิว ไม่ต้องรบกวนเซิร์ฟเวอร์
    if (pendingAdd) {
      setQueue(q => q.filter(o => o.opId !== pendingAdd.opId));
      return;
    }
    setQueue(q => [...q, { opId: newId(), sheet, action: 'delete', id }]);
  };

  const summary = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = view.Transactions.filter(t => String(t.Date).slice(0, 7) === ym);
    const income = thisMonth.filter(t => t.Type === 'รายรับ').reduce((s, t) => s + Number(t.Amount || 0), 0);
    const expense = thisMonth.filter(t => t.Type === 'รายจ่าย').reduce((s, t) => s + Number(t.Amount || 0), 0);
    const debtRemaining = view.Debts.reduce((s, d) => s + Number(d.RemainingAmount || 0), 0);
    const assetTotal = view.Assets.reduce((s, a) => s + Number(a.CurrentValue || 0), 0);
    const annualPremium = view.Insurance.reduce((s, p) => {
      const mult = { 'รายเดือน': 12, 'รายไตรมาส': 4, 'รายปี': 1, 'ครั้งเดียว': 0 }[p.PaymentFrequency] ?? 1;
      return s + Number(p.PremiumAmount || 0) * mult;
    }, 0);
    return { income, expense, net: income - expense, debtRemaining, assetTotal, annualPremium, netWorth: assetTotal - debtRemaining };
  }, [view]);

  if (!configLoaded) return null;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: `linear-gradient(160deg, ${PALETTE.gold} 0%, ${PALETTE.primaryDeep} 100%)` }}>
        <div className="w-full max-w-sm rounded-3xl p-7" style={{ background: PALETTE.surface, boxShadow: '0 20px 50px rgba(15,32,67,0.25)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: PALETTE.goldSoft }}>
            <Wallet size={22} color={PALETTE.gold} />
          </div>
          <h1 style={{ color: PALETTE.ink }} className="text-xl font-semibold mb-1.5">สมุดบัญชีส่วนตัว</h1>
          <p style={{ color: PALETTE.inkSoft }} className="text-sm mb-5 leading-relaxed">
            วาง Web App URL จาก Google Apps Script ที่ deploy ไว้กับ Google Sheets ของคุณ
          </p>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full rounded-xl px-3.5 py-3 text-sm mb-3" style={inputStyle} />
          <button onClick={saveUrl} disabled={!urlInput.trim()}
            className="w-full rounded-xl py-3 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition"
            style={{ background: PALETTE.gold }}>
            เชื่อมต่อ
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'ภาพรวม', icon: Wallet },
    { id: 'transactions', label: 'รายรับ-จ่าย', icon: TrendingUp },
    { id: 'debts', label: 'หนี้สิน', icon: CreditCard },
    { id: 'insurance', label: 'กรมธรรม์', icon: ShieldCheck },
    { id: 'assets', label: 'ทรัพย์สิน', icon: Building2 },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: PALETTE.paper, fontFamily: 'system-ui, sans-serif' }}>
      <Toast status={status} onRetry={() => { refresh(); flush(); }} onClose={() => setStatus(null)} />

      <header className="safe-top px-5 pb-8 rounded-b-3xl"
        style={{ background: `linear-gradient(160deg, ${PALETTE.gold} 0%, ${PALETTE.primaryDeep} 100%)` }}>
        <div className="flex items-start justify-between">
          <div className="text-white/70 text-[11px] tracking-[0.2em] uppercase pt-1">สมุดบัญชีส่วนตัว</div>
          <div className="flex gap-2">
            <button onClick={() => { refresh(); flush(); }} aria-label="รีเฟรช"
              className="p-2 rounded-full active:scale-95 transition" style={{ background: 'rgba(255,255,255,0.16)' }}>
              <RefreshCw size={16} color="#fff" className={loading ? 'animate-spin' : ''} />
            </button>
            {!embedded && (
              <button onClick={() => { try { localStorage.removeItem('apps-script-url'); } catch (e) {} setBaseUrl(''); }}
                aria-label="ตั้งค่า" className="p-2 rounded-full active:scale-95 transition" style={{ background: 'rgba(255,255,255,0.16)' }}>
                <Settings size={16} color="#fff" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-white/70 text-xs mb-1">มูลค่าสุทธิ</div>
          <div className="text-white text-[2.6rem] leading-none font-semibold tnum">
            {summary.netWorth < 0 && <span className="mr-0.5">−</span>}
            <span className="text-2xl font-normal align-top mr-1 text-white/80">฿</span>{money(Math.abs(summary.netWorth))}
          </div>
          <SyncLine online={online} loading={loading} pending={queue.length} lastSync={lastSync} />
        </div>
      </header>

      <main className="px-5 py-5">
        {tab === 'dashboard' && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 flex-wrap">
              <StatCard icon={TrendingUp} label="รายรับเดือนนี้" value={summary.income} tone="green" />
              <StatCard icon={TrendingDown} label="รายจ่ายเดือนนี้" value={summary.expense} tone="red" />
            </div>
            <div className="flex gap-3 flex-wrap">
              <StatCard icon={CreditCard} label="หนี้คงเหลือรวม" value={summary.debtRemaining} tone="red" />
              <StatCard icon={Building2} label="มูลค่าทรัพย์สินรวม" value={summary.assetTotal} tone="green" />
            </div>
            <StatCard icon={ShieldCheck} label="เบี้ยประกันรวมต่อปี" value={summary.annualPremium} sub={`${view.Insurance.length} กรมธรรม์`} />
          </div>
        )}

        {tab === 'transactions' && (
          <Table columns={['วันที่', 'ประเภท', 'หมวด', 'จำนวน']} rows={view.Transactions} numericFrom={3}
            onDelete={id => deleteRow('Transactions', id)}
            renderRow={(r) => (
              <>
                <td className="px-3 py-3 whitespace-nowrap tnum" style={{ color: PALETTE.inkSoft }}>{String(r.Date || '').slice(5, 10)}</td>
                <td className="px-3 py-3">
                  <span className="text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap"
                    style={{ background: r.Type === 'รายรับ' ? '#E6F6EF' : '#FDECEC', color: r.Type === 'รายรับ' ? PALETTE.green : PALETTE.red }}>
                    {r.Type}
                  </span>
                </td>
                <td className="px-3 py-3" style={{ color: PALETTE.ink }}>{r.Category}</td>
                <td className="px-3 py-3 text-right font-medium tnum whitespace-nowrap"
                  style={{ color: r.Type === 'รายรับ' ? PALETTE.green : PALETTE.red }}>
                  {r.Type === 'รายรับ' ? '+' : '−'}฿{money(r.Amount)}
                </td>
              </>
            )} />
        )}

        {tab === 'debts' && (
          <Table columns={['ชื่อหนี้', 'ประเภท', 'คงเหลือ', 'ผ่อน/เดือน']} rows={view.Debts} numericFrom={2}
            onDelete={id => deleteRow('Debts', id)}
            renderRow={(r) => (
              <>
                <td className="px-3 py-3 font-medium" style={{ color: PALETTE.ink }}>{r.Name}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>{r.Type}</td>
                <td className="px-3 py-3 text-right font-medium tnum whitespace-nowrap" style={{ color: PALETTE.red }}>฿{money(r.RemainingAmount)}</td>
                <td className="px-3 py-3 text-right tnum whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>฿{money(r.MonthlyPayment)}</td>
              </>
            )} />
        )}

        {tab === 'insurance' && (
          <Table columns={['กรมธรรม์', 'ประเภท', 'เบี้ย', 'ต่ออายุ']} rows={view.Insurance} numericFrom={2}
            onDelete={id => deleteRow('Insurance', id)}
            renderRow={(r) => (
              <>
                <td className="px-3 py-3 font-medium" style={{ color: PALETTE.ink }}>{r.PolicyName}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>{r.Type}</td>
                <td className="px-3 py-3 text-right font-medium tnum whitespace-nowrap" style={{ color: PALETTE.ink }}>฿{money(r.PremiumAmount)}</td>
                <td className="px-3 py-3 text-right text-xs tnum whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>{String(r.RenewalDate || '').slice(0, 10)}</td>
              </>
            )} />
        )}

        {tab === 'assets' && (
          <Table columns={['ทรัพย์สิน', 'ประเภท', 'มูลค่าปัจจุบัน']} rows={view.Assets} numericFrom={2}
            onDelete={id => deleteRow('Assets', id)}
            renderRow={(r) => (
              <>
                <td className="px-3 py-3 font-medium" style={{ color: PALETTE.ink }}>{r.Name}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>{r.Type}</td>
                <td className="px-3 py-3 text-right font-medium tnum whitespace-nowrap" style={{ color: PALETTE.green }}>฿{money(r.CurrentValue)}</td>
              </>
            )} />
        )}
      </main>

      {tab !== 'dashboard' && (
        <button onClick={() => setModal(tab)} aria-label="เพิ่มรายการ"
          className="fixed bottom-24 right-5 rounded-2xl p-4 active:scale-95 transition"
          style={{ background: PALETTE.gold, boxShadow: SHADOW_LIFT }}>
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </button>
      )}

      <nav className="fixed bottom-0 left-0 right-0 safe-bottom flex justify-around pt-2 px-1"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${PALETTE.border}` }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex flex-col items-center gap-1 px-2 pb-1 pt-1.5 rounded-xl transition min-w-[58px]"
              style={{ background: active ? PALETTE.goldSoft : 'transparent' }}>
              <t.icon size={18} color={active ? PALETTE.gold : PALETTE.inkSoft} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ color: active ? PALETTE.gold : PALETTE.inkSoft }}
                className={`text-[10px] ${active ? 'font-semibold' : ''}`}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {modal === 'transactions' && <TransactionForm onSave={p => addRow('Transactions', p)} onClose={() => setModal(null)} />}
      {modal === 'debts' && <DebtForm onSave={p => addRow('Debts', p)} onClose={() => setModal(null)} />}
      {modal === 'insurance' && <InsuranceForm onSave={p => addRow('Insurance', p)} onClose={() => setModal(null)} />}
      {modal === 'assets' && <AssetForm onSave={p => addRow('Assets', p)} onClose={() => setModal(null)} />}
    </div>
  );
}

function TransactionForm({ onSave, onClose }) {
  const [f, setF] = useState({ Date: todayStr(), Type: 'รายจ่าย', Category: EXPENSE_CATS[0], Amount: '', Account: ACCOUNTS[0], Note: '' });
  const [busy, submit] = useSubmit(onSave);
  const cats = f.Type === 'รายรับ' ? INCOME_CATS : EXPENSE_CATS;
  return (
    <Modal title="บันทึกรายรับ-รายจ่าย" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {['รายจ่าย', 'รายรับ'].map(t => (
            <button key={t} onClick={() => setF({ ...f, Type: t, Category: t === 'รายรับ' ? INCOME_CATS[0] : EXPENSE_CATS[0] })}
              className="flex-1 rounded-lg py-2 text-sm" style={{ background: f.Type === t ? PALETTE.ink : '#fff', color: f.Type === t ? '#fff' : PALETTE.ink, border: `1px solid ${PALETTE.border}` }}>
              {t}
            </button>
          ))}
        </div>
        <Field label="วันที่"><input type="date" value={f.Date} onChange={e => setF({ ...f, Date: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="หมวดหมู่">
          <select value={f.Category} onChange={e => setF({ ...f, Category: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle}>
            {cats.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="จำนวนเงิน (บาท)"><input type="number" value={f.Amount} onChange={e => setF({ ...f, Amount: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="บัญชี/ช่องทาง">
          <select value={f.Account} onChange={e => setF({ ...f, Account: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle}>
            {ACCOUNTS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="โน้ต (ถ้ามี)"><input value={f.Note} onChange={e => setF({ ...f, Note: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <button onClick={() => submit(f)} disabled={busy || !f.Amount} className="mt-3 rounded-xl py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition" style={{ background: PALETTE.gold }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </Modal>
  );
}

function DebtForm({ onSave, onClose }) {
  const [f, setF] = useState({ Name: '', Type: DEBT_TYPES[0], PrincipalAmount: '', RemainingAmount: '', InterestRate: '', MonthlyPayment: '', DueDate: '', StartDate: todayStr(), Status: 'ผ่อนอยู่', Note: '' });
  const [busy, submit] = useSubmit(onSave);
  return (
    <Modal title="เพิ่มรายการหนี้สิน" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="ชื่อหนี้/เจ้าหนี้"><input value={f.Name} onChange={e => setF({ ...f, Name: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="ประเภท">
          <select value={f.Type} onChange={e => setF({ ...f, Type: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle}>
            {DEBT_TYPES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <div className="flex gap-2">
          <Field label="ยอดเงินต้น"><input type="number" value={f.PrincipalAmount} onChange={e => setF({ ...f, PrincipalAmount: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
          <Field label="คงเหลือ"><input type="number" value={f.RemainingAmount} onChange={e => setF({ ...f, RemainingAmount: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
        </div>
        <div className="flex gap-2">
          <Field label="ดอกเบี้ย (%/ปี)"><input type="number" value={f.InterestRate} onChange={e => setF({ ...f, InterestRate: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
          <Field label="ผ่อน/เดือน"><input type="number" value={f.MonthlyPayment} onChange={e => setF({ ...f, MonthlyPayment: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
        </div>
        <Field label="วันครบกำหนดชำระ"><input type="date" value={f.DueDate} onChange={e => setF({ ...f, DueDate: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="สถานะ">
          <select value={f.Status} onChange={e => setF({ ...f, Status: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle}>
            {['ผ่อนอยู่', 'ปิดแล้ว', 'ค้างชำระ'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <button onClick={() => submit(f)} disabled={busy || !f.Name} className="mt-3 rounded-xl py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition" style={{ background: PALETTE.gold }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </Modal>
  );
}

function InsuranceForm({ onSave, onClose }) {
  const [f, setF] = useState({ PolicyName: '', Type: INSURANCE_TYPES[0], Company: '', PolicyNumber: '', PremiumAmount: '', PaymentFrequency: 'รายปี', StartDate: todayStr(), RenewalDate: '', CoverageAmount: '', Beneficiary: '', Status: 'มีผลบังคับ', Note: '' });
  const [busy, submit] = useSubmit(onSave);
  return (
    <Modal title="เพิ่มกรมธรรม์" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="ชื่อกรมธรรม์"><input value={f.PolicyName} onChange={e => setF({ ...f, PolicyName: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <div className="flex gap-2">
          <Field label="ประเภท">
            <select value={f.Type} onChange={e => setF({ ...f, Type: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle}>
              {INSURANCE_TYPES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="บริษัท"><input value={f.Company} onChange={e => setF({ ...f, Company: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
        </div>
        <Field label="เลขกรมธรรม์"><input value={f.PolicyNumber} onChange={e => setF({ ...f, PolicyNumber: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <div className="flex gap-2">
          <Field label="เบี้ยประกัน"><input type="number" value={f.PremiumAmount} onChange={e => setF({ ...f, PremiumAmount: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
          <Field label="ความถี่การจ่าย">
            <select value={f.PaymentFrequency} onChange={e => setF({ ...f, PaymentFrequency: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle}>
              {['รายเดือน', 'รายไตรมาส', 'รายปี', 'ครั้งเดียว'].map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="วันครบกำหนดต่ออายุ"><input type="date" value={f.RenewalDate} onChange={e => setF({ ...f, RenewalDate: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="ทุนประกัน"><input type="number" value={f.CoverageAmount} onChange={e => setF({ ...f, CoverageAmount: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="ผู้รับผลประโยชน์"><input value={f.Beneficiary} onChange={e => setF({ ...f, Beneficiary: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <button onClick={() => submit(f)} disabled={busy || !f.PolicyName} className="mt-3 rounded-xl py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition" style={{ background: PALETTE.gold }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </Modal>
  );
}

function AssetForm({ onSave, onClose }) {
  const [f, setF] = useState({ Name: '', Type: ASSET_TYPES[0], PurchaseValue: '', CurrentValue: '', PurchaseDate: todayStr(), Note: '' });
  const [busy, submit] = useSubmit(onSave);
  return (
    <Modal title="เพิ่มทรัพย์สิน" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="ชื่อทรัพย์สิน"><input value={f.Name} onChange={e => setF({ ...f, Name: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="ประเภท">
          <select value={f.Type} onChange={e => setF({ ...f, Type: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle}>
            {ASSET_TYPES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <div className="flex gap-2">
          <Field label="มูลค่าตอนซื้อ"><input type="number" value={f.PurchaseValue} onChange={e => setF({ ...f, PurchaseValue: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
          <Field label="มูลค่าปัจจุบัน"><input type="number" value={f.CurrentValue} onChange={e => setF({ ...f, CurrentValue: e.target.value })} className="rounded-xl px-3.5 py-2.5 w-full" style={inputStyle} /></Field>
        </div>
        <Field label="วันที่ได้มา"><input type="date" value={f.PurchaseDate} onChange={e => setF({ ...f, PurchaseDate: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <Field label="โน้ต"><input value={f.Note} onChange={e => setF({ ...f, Note: e.target.value })} className="rounded-xl px-3.5 py-2.5" style={inputStyle} /></Field>
        <button onClick={() => submit(f)} disabled={busy || !f.Name} className="mt-3 rounded-xl py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition" style={{ background: PALETTE.gold }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </Modal>
  );
}
