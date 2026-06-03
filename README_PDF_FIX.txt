FIX PDF CORTADO - RIP 2026

Archivos modificados:
- app.js
- styles.css

Qué se corrigió:
1. El exportador PDF ya no usa un clon de 1200px dentro de una página/captura de 720px.
2. El ancho del stage, la página PDF y html2canvas ahora se calculan de forma consistente.
3. html2canvas toma scrollWidth/scrollHeight reales después de renderizar y cargar fuentes.
4. Se evita cortar filas y bloques pequeños, sin forzar a que secciones grandes completas intenten caber en una sola página.

Para subir:
- Reemplaza app.js y styles.css en el proyecto.
- Si quieres ir a la fija, sube todo el contenido del ZIP manteniendo estos nombres de archivo.
