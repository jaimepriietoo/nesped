/* =========================================================================
   Intelligence Designed To Evolve — comportamiento
   ========================================================================= */

(function () {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ── Contadores de las métricas ─────────────────────────────────────
     Cada cifra sube de 0 a su objetivo con easeOutCubic. Se dispara una
     sola vez, cuando el bloque asoma: IntersectionObserver lo resuelve
     fuera del hilo principal, sin escuchar el scroll. */

  const valores = Array.from(document.querySelectorAll(".stat-value"));

  function formatea(n, decimales, sufijo) {
    return n.toFixed(decimales) + sufijo;
  }

  function cuenta(el, indice) {
    const objetivo = parseFloat(el.dataset.target || "0");
    const decimales = parseInt(el.dataset.decimals || "0", 10);
    const sufijo = el.dataset.suffix || "";

    // Con movimiento reducido no hay animación: se pinta el valor final.
    if (reduceMotion) {
      el.textContent = formatea(objetivo, decimales, sufijo);
      return;
    }

    const duracion = 1500 + indice * 80;
    const retraso = 480 + indice * 90;

    window.setTimeout(function () {
      const inicio = performance.now();

      function paso(ahora) {
        const p = Math.min(1, (ahora - inicio) / duracion);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = formatea(objetivo * e, decimales, sufijo);
        if (p < 1) requestAnimationFrame(paso);
      }

      requestAnimationFrame(paso);
    }, retraso);
  }

  const stats = document.querySelector(".stats");

  if (stats && valores.length) {
    const io = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          valores.forEach(cuenta);
          io.disconnect(); // una sola vez
        });
      },
      { threshold: 0.25 }
    );

    io.observe(stats);
  }

  /* ── Menú móvil ─────────────────────────────────────────────────── */

  const burger = document.querySelector(".burger");
  const menu = document.getElementById("mobile-menu");
  const overlay = document.querySelector(".menu-overlay");

  if (burger && menu && overlay) {
    function abrir() {
      burger.setAttribute("aria-expanded", "true");
      burger.setAttribute("aria-label", "Cerrar menú");
      menu.hidden = false;
      overlay.hidden = false;
      document.body.classList.add("menu-open");
    }

    function cerrar() {
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "Abrir menú");
      menu.hidden = true;
      overlay.hidden = true;
      document.body.classList.remove("menu-open");
    }

    function abierto() {
      return burger.getAttribute("aria-expanded") === "true";
    }

    burger.addEventListener("click", function () {
      if (abierto()) cerrar();
      else abrir();
    });

    overlay.addEventListener("click", cerrar);

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) cerrar();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && abierto()) cerrar();
    });

    // Al pasar a escritorio el menú deja de tener sentido: se cierra para
    // no dejar el body bloqueado con overflow hidden.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 720 && abierto()) cerrar();
    });
  }
})();
