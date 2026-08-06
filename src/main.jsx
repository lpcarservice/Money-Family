import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ติดตั้งเป็นแอปบนหน้าจอโฮมได้ และเปิดได้แม้ไม่มีเน็ต
// (ตอน npm run dev ไม่ต้องลง จะได้ไม่ค้าง cache เวลาแก้โค้ด)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
