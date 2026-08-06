# สมุดบัญชีส่วนตัว — Finance Tracker

แอปบันทึกรายรับ-รายจ่าย หนี้สิน กรมธรรม์ ทรัพย์สิน ใช้ร่วมกัน 2 คน

| ส่วน | อยู่ที่ไหน |
|---|---|
| โค้ด | GitHub repo |
| หน้าเว็บ | GitHub Pages (build ให้อัตโนมัติทุกครั้งที่ push) |
| ข้อมูล | Google Sheets ผ่าน Apps Script Web App |

**Stack:** React + Vite + Tailwind · Google Apps Script · GitHub Actions

---

## ติดตั้งครั้งแรก

### 1. Google Sheet + Apps Script (ฝั่งข้อมูล)

1. เปิด https://sheets.new ตั้งชื่อไฟล์ตามใจ
2. **ส่วนขยาย (Extensions) → Apps Script**
3. ลบโค้ดเดิมทั้งหมด ก๊อปจาก [`Code.gs`](Code.gs) วางแทน → **Ctrl+S**
4. เลือก `setupSheets` ใน dropdown → **▶ Run** → อนุญาตสิทธิ์
   (เจอหน้าจอ "Google hasn't verified this app" → **Advanced** → **Go to ... (unsafe)** → **Allow**)
5. เช็คว่า Sheet มีแท็บ `Transactions` `Debts` `Insurance` `Assets` ครบ
6. **Deploy → New deployment** → ⚙ → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** ← ต้องเป็นค่านี้ เพราะหน้าเว็บอยู่คนละโดเมน
   - **Deploy**
7. ก๊อป Web App URL (ลงท้าย `/exec`) เก็บไว้

> 🔒 **URL นี้คือกุญแจของข้อมูลทั้งหมด** ใครมีก็อ่านและแก้ข้อมูลการเงินได้
> ห้าม commit ลง Git และห้ามโพสต์สาธารณะ — ส่งให้กันทาง chat ส่วนตัวเท่านั้น

### 2. GitHub (ฝั่งโค้ดและหน้าเว็บ)

1. สร้าง repo ใหม่ที่ https://github.com/new — **ยังไม่ต้องติ๊ก** Add README/`.gitignore`
2. ในโฟลเดอร์นี้ รันตามลำดับ (แทน `<user>` และ `<repo>` เป็นของจริง):

```bash
git remote add origin https://github.com/<user>/<repo>.git && git branch -M main && git push -u origin main
```

3. ที่หน้า repo → **Settings → Pages → Source** เลือก **GitHub Actions**
4. แท็บ **Actions** จะเห็น workflow ทำงาน รอ ~1-2 นาที
5. เสร็จแล้วได้ URL `https://<user>.github.io/<repo>/`

### 3. เชื่อมสองส่วนเข้าด้วยกัน

เปิด URL ของ GitHub Pages → วาง Web App URL จากขั้นที่ 1 → **เชื่อมต่อ**
ทำแบบนี้ครั้งเดียวต่อเครื่อง (จำไว้ใน localStorage) — อีกคนก็ทำเหมือนกันบนเครื่องตัวเอง

**ติดตั้งเป็นแอปบนมือถือ**
- iPhone (Safari): ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"
- Android (Chrome): เมนู ⋮ → "ติดตั้งแอป"

เปิดแล้วเต็มจอ ไม่มีแถบเบราว์เซอร์ และเปิดได้แม้ไม่มีเน็ต

---

## แอปทำงานยังไงตอนเน็ตไม่ดี

- เปิดแอป → เห็นข้อมูลจากที่เก็บไว้ในเครื่องทันที ไม่ต้องรอเซิร์ฟเวอร์
- กดบันทึก → ขึ้นในตารางเลย (แถวจางๆ = ยังไม่ได้ส่ง) แล้วส่งขึ้น Sheets ให้เองเบื้องหลัง
- เน็ตหลุด / ปิดแอป → ของที่ค้างยังอยู่ พอกลับมามีเน็ตจะส่งต่อเอง
- อีกคนบันทึก → ดึงข้อมูลใหม่อัตโนมัติทุก 60 วิ และทุกครั้งที่สลับกลับมาที่แอป
- แถบใต้ยอดเงินบอกสถานะเสมอ: `อัปเดตล่าสุด HH:mm` / `กำลังส่ง N รายการ…` / `ออฟไลน์`

ครั้งแรกของวัน Apps Script ต้องตื่นก่อน (10-20 วิ) แต่ไม่กระทบการใช้งาน เพราะแอปไม่รอเซิร์ฟเวอร์

---

## แก้โค้ดแล้วอัปเดตยังไง

```bash
git add -A && git commit -m "อธิบายสิ่งที่แก้" && git push
```

GitHub Actions จะ build แล้วอัปหน้าเว็บให้เอง ~1-2 นาที **ไม่ต้อง build เองบนเครื่อง**

ถ้าแก้ `Code.gs` ต้องไปทำที่ Apps Script ด้วย:
ก๊อปวางทับ → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**
(ต้องใช้ Manage deployments ไม่ใช่ New deployment ไม่งั้น URL จะเปลี่ยน)

### รันทดสอบบนเครื่อง

```bash
npm install
npm run dev
```

### ⚠️ ถ้า build บนเครื่องนี้ (Windows + Google Drive) แล้วพัง

โฟลเดอร์นี้อยู่บน Google Drive ซึ่ง `npm install` จะล้ม (EPERM/EBADF) และ Windows App Control
ยังบล็อกไฟล์ native ของ rollup ด้วย — build ในโฟลเดอร์ local แทน:

```bash
mkdir -p /c/Users/chana/finance-tracker-build && cd /c/Users/chana/finance-tracker-build && cp -r "/g/My Drive/00_Pui_Executive_Only/finance-tracker-app"/{src,public,scripts,index.html,package.json,package-lock.json,vite.config.js,tailwind.config.js,postcss.config.js} . && npm install --no-audit --no-fund && npm approve-scripts esbuild && npm rebuild esbuild && npm install --save-dev rollup@npm:@rollup/wasm-node@^4.18.0 && npm run dev
```

**แต่ปกติไม่ต้องทำเลย** — ให้ GitHub Actions build ให้ (บน Linux ไม่เจอปัญหาทั้งสองข้อ)

---

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/App.jsx` | ตัวแอปทั้งหมด |
| `Code.gs` | โค้ดฝั่ง Apps Script (ต้องก๊อปไปวางเอง ไม่ได้ deploy อัตโนมัติ) |
| `.github/workflows/deploy.yml` | build + ขึ้น GitHub Pages อัตโนมัติ |
| `public/sw.js` | service worker ให้เปิดออฟไลน์ได้ |
| `scripts/make-icons.mjs` | สร้างไอคอนแอป (`npm run icons`) |
| `scripts/bundle-appsscript.mjs` | รวมเป็น HTML ไฟล์เดียว (ทางเลือกสำรอง ไม่ใช้กับ GitHub Pages) |

---

## โครงสร้างข้อมูลใน Sheets

| ชีท | ใช้เก็บ |
|---|---|
| Transactions | รายการรายรับ-รายจ่ายรายวัน |
| Debts | หนี้สินและยอดผ่อนคงเหลือ |
| Insurance | กรมธรรม์ประกัน เบี้ย วันต่ออายุ |
| Assets | ทรัพย์สินและมูลค่าปัจจุบัน |

แก้ข้อมูลตรงใน Google Sheets ได้เลย เดี๋ยวแอปดึงมาเอง
(ห้ามแก้คอลัมน์ `ID` เพราะแอปใช้อ้างอิงตอนลบ)
