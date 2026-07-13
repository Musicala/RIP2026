/* global window */
(function () {
  'use strict';

  window.RIP_FIREBASE_CONFIG = window.RIP_FIREBASE_CONFIG || {
    apiKey: 'AIzaSyCaCizVkfWdx97LROV7PYQbFXLPMpxynBg',
    authDomain: 'rip-musicala.firebaseapp.com',
    projectId: 'rip-musicala',
    storageBucket: 'rip-musicala.firebasestorage.app',
    messagingSenderId: '401885071105',
    appId: '1:401885071105:web:6bb9b6867d7d81fdec3d00'
  };

  // Los feeds públicos quedan cerrados en producción. Los datos operativos
  // se leen únicamente desde Firestore bajo Authentication + Rules.
  window.RIP_PUBLIC_FEEDS_ENABLED = false;
  window.RIP_PRICES_TSV_URL = '';

  // Accesos externos siempre apuntan a Firebase Hosting, nunca a GitHub Pages.
  window.RIP_STUDENT_HUB_URL = window.RIP_STUDENT_HUB_URL || 'https://musicala-estudianteshub.web.app/';

  /*
    Modo estricto de identidad: RIP rechaza cualquier escritura operativa sin
    un studentId canónico ya presente en el directorio sincronizado `students`.
    El navegador nunca crea identidades ni documentos alternativos por nombre.
  */
  window.RIP_REQUIRE_STUDENT_ID = true;
})();
