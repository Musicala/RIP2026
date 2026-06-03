/* global window, document */
(function () {
  'use strict';

  const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';
  const allowed = () => window.RIP_FIREBASE_ALLOWED_EMAILS || [];

  function renderLogin(auth, authApi) {
    if (document.getElementById('ripAuthGate')) return;
    const gate = document.createElement('div');
    gate.id = 'ripAuthGate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f7f8fb;display:flex;align-items:center;justify-content:center;padding:20px;';
    gate.innerHTML = `
      <form id="ripAuthForm" style="width:min(420px,100%);background:white;border:1px solid #d9deea;border-radius:10px;padding:22px;box-shadow:0 16px 40px rgba(20,30,60,.14);font-family:system-ui,sans-serif;">
        <h2 style="margin:0 0 6px;color:#1A3B6E;">RIP 2026</h2>
        <p style="margin:0 0 18px;color:#687086;">Ingresa con una cuenta de Google autorizada para Musicala.</p>
        <button type="submit" style="width:100%;padding:12px;border:1px solid #cfd6e6;border-radius:8px;background:white;color:#1f2937;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;">
          <span style="font-size:18px;line-height:1;">G</span>
          Entrar con Google
        </button>
        <div id="ripAuthMsg" style="min-height:22px;margin-top:12px;color:#a33434;font-size:13px;"></div>
      </form>
    `;
    document.body.appendChild(gate);
    gate.querySelector('#ripAuthForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = gate.querySelector('#ripAuthMsg');
      msg.textContent = 'Ingresando...';
      try {
        const provider = new authApi.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await authApi.signInWithPopup(auth, provider);
        msg.textContent = '';
      } catch (err) {
        msg.textContent = err?.message || 'No se pudo iniciar sesion.';
      }
    });
  }

  window.RIPFirebase = {
    ready: (async () => {
      const appMod = await import(CDN + 'firebase-app.js');
      const authMod = await import(CDN + 'firebase-auth.js');
      const fsMod = await import(CDN + 'firebase-firestore.js');
      const app = appMod.initializeApp(window.RIP_FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);

      const user = await new Promise((resolve) => {
        authMod.onAuthStateChanged(auth, (u) => {
          const gate = document.getElementById('ripAuthGate');
          if (u && allowed().includes(String(u.email || '').toLowerCase())) {
            if (gate) gate.remove();
            resolve(u);
          } else {
            if (u) authMod.signOut(auth).catch(() => {});
            renderLogin(auth, authMod);
          }
        });
      });

      return { app, auth, db, user, fs: fsMod, authApi: authMod };
    })()
  };
})();
