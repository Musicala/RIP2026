/* global window */
(function () {
  'use strict';

  window.RIP_FIREBASE_ALLOWED_EMAILS = [
    'catalina.medina.leal@gmail.com',
    'alekcaballeromusic@gmail.com',
    'imusicala@gmail.com',
    'adminmusicala@gmail.com',
    'musicalaasesor@gmail.com'
  ];

  window.RIP_FIREBASE_CONFIG = window.RIP_FIREBASE_CONFIG || {
    apiKey: 'AIzaSyCaCizVkfWdx97LROV7PYQbFXLPMpxynBg',
    authDomain: 'rip-musicala.firebaseapp.com',
    projectId: 'rip-musicala',
    storageBucket: 'rip-musicala.firebasestorage.app',
    messagingSenderId: '401885071105',
    appId: '1:401885071105:web:6bb9b6867d7d81fdec3d00'
  };

  window.MUSICALA_STUDENTS_FIREBASE_CONFIG = window.MUSICALA_STUDENTS_FIREBASE_CONFIG || {
    apiKey: 'AIzaSyA12_rlUjYM2z4aFG4bf43Wf0tSNTxC0Vg',
    authDomain: 'estudiantes-musicala.firebaseapp.com',
    projectId: 'estudiantes-musicala',
    storageBucket: 'estudiantes-musicala.firebasestorage.app',
    messagingSenderId: '342934326940',
    appId: '1:342934326940:web:a75cc4634569c5a4a82759'
  };
  window.MUSICALA_STUDENTS_COLLECTIONS = window.MUSICALA_STUDENTS_COLLECTIONS || [
    'students', 'Students',
    'estudiantes', 'Estudiantes',
    'alumnos', 'Alumnos',
    'usuarios', 'Usuarios',
    'clientes', 'Clientes',
    'contactos', 'Contactos',
    'estudiantesActivos', 'EstudiantesActivos',
    'activeStudents', 'ActiveStudents',
    'estudiantesMusicala', 'EstudiantesMusicala',
    'baseDatos', 'BaseDatos',
    'baseDeDatos', 'BaseDeDatos',
    'registros', 'Registros',
    'personas', 'Personas'
  ];
  window.RIP_PRICES_TSV_URL = window.RIP_PRICES_TSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRw8VZmjjgmjRSeriTc2ITE1VtuwDtxCMntos5N8kljm0svs5nMe-nb07vJSx2L6vRo9iT_S7CCIEZe/pub?gid=1700804701&single=true&output=tsv';
})();
