/* global window, document */
(function () {
  'use strict';

  const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';
  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase();
    if (['admin', 'administrator', 'administrador'].includes(role)) return 'admin';
    if (['teacher', 'docente', 'profesor'].includes(role)) return 'teacher';
    if (['student', 'estudiante'].includes(role)) return 'student';
    return role;
  }

  function isActiveProfile(profile) {
    const status = String(profile?.status || profile?.accessStatus || '').trim().toLowerCase();
    return profile?.active !== false && !['disabled', 'inactive', 'blocked', 'suspended'].includes(status);
  }

  function setGateMessage(message) {
    const msg = document.getElementById('ripAuthMsg');
    if (msg) msg.textContent = message || '';
  }

  function renderLogin(auth, authApi, message = '') {
    const existing = document.getElementById('ripAuthGate');
    if (existing) {
      setGateMessage(message);
      return;
    }

    const gate = document.createElement('div');
    gate.id = 'ripAuthGate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f7f8fb;display:flex;align-items:center;justify-content:center;padding:20px;';
    gate.innerHTML = `
      <form id="ripAuthForm" style="width:min(420px,100%);background:white;border:1px solid #d9deea;border-radius:10px;padding:22px;box-shadow:0 16px 40px rgba(20,30,60,.14);font-family:system-ui,sans-serif;">
        <h2 style="margin:0 0 6px;color:#1A3B6E;">RIP 2026</h2>
        <p style="margin:0 0 18px;color:#687086;">Ingresa con una cuenta activa de administración o docencia.</p>
        <button type="submit" style="width:100%;padding:12px;border:1px solid #cfd6e6;border-radius:8px;background:white;color:#1f2937;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;">
          <span style="font-size:18px;line-height:1;">G</span>
          Entrar con Google
        </button>
        <div id="ripAuthMsg" style="min-height:22px;margin-top:12px;color:#a33434;font-size:13px;"></div>
      </form>
    `;
    document.body.appendChild(gate);
    setGateMessage(message);

    gate.querySelector('#ripAuthForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setGateMessage('Ingresando...');
      try {
        const provider = new authApi.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await authApi.signInWithPopup(auth, provider);
      } catch (error) {
        setGateMessage(error?.message || 'No se pudo iniciar sesión.');
      }
    });
  }

  async function loadAccessProfile(db, fsApi, user) {
    const emailNormalized = normalizeEmail(user?.email);
    if (!emailNormalized) return null;

    const snapshot = await fsApi.getDoc(fsApi.doc(db, 'users', emailNormalized));
    if (!snapshot.exists()) return null;

    const profile = snapshot.data() || {};
    const role = normalizeRole(profile.role || profile.rol);
    if (!['admin', 'teacher'].includes(role) || !isActiveProfile(profile)) {
      return null;
    }

    return {
      ...profile,
      id: snapshot.id,
      email: emailNormalized,
      emailNormalized,
      role
    };
  }

  window.RIPFirebase = {
    ready: (async () => {
      const appMod = await import(CDN + 'firebase-app.js');
      const authMod = await import(CDN + 'firebase-auth.js');
      const fsMod = await import(CDN + 'firebase-firestore.js');
      const app = appMod.initializeApp(window.RIP_FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);

      const session = await new Promise((resolve) => {
        let settled = false;
        authMod.onAuthStateChanged(auth, async (user) => {
          if (settled) return;
          if (!user) {
            renderLogin(auth, authMod);
            return;
          }

          try {
            const accessProfile = await loadAccessProfile(db, fsMod, user);
            if (!accessProfile) {
              await authMod.signOut(auth).catch(() => {});
              renderLogin(auth, authMod, 'Esta cuenta no tiene un perfil activo de administración o docencia.');
              return;
            }

            settled = true;
            document.getElementById('ripAuthGate')?.remove();
            resolve({ user, accessProfile });
          } catch (error) {
            await authMod.signOut(auth).catch(() => {});
            renderLogin(auth, authMod, 'No se pudo validar el perfil de acceso. Intenta nuevamente.');
            console.error('[RIP Auth] No se pudo validar users/{emailNormalized}.', error);
          }
        });
      });

      return {
        app,
        auth,
        db,
        user: session.user,
        accessProfile: session.accessProfile,
        role: session.accessProfile.role,
        fs: fsMod,
        authApi: authMod
      };
    })()
  };
})();
