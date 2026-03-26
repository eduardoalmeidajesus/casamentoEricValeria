/**
 * CASAMENTO — ÉRIC & VALERIA
 * script.js
 */

/* ── CONFIGURAÇÕES ──────────────────────────────────────── */
// ⚡ Altere a chave Pix aqui
var PIX_KEY = 'casamento@ericvaleria.com.br';

// ⚡ Altere o número do WhatsApp aqui (apenas dígitos, com DDI)
var WHATSAPP_NUMBER = '554599725915';

// Data do casamento: 12 set 2026 às 16h (mês em JS começa em 0, setembro = 8)
var WEDDING_DATE = new Date(2026, 8, 12, 16, 0, 0);


/* ── NAVBAR ─────────────────────────────────────────────── */
(function initNavbar() {
  var navbar   = document.getElementById('navbar');
  var toggle   = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');

  window.addEventListener('scroll', function () {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  if (window.scrollY > 60) navbar.classList.add('scrolled');

  toggle.addEventListener('click', function () {
    navLinks.classList.toggle('open');
    navbar.classList.add('scrolled');
  });

  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { navLinks.classList.remove('open'); });
  });
})();


/* ── CONTAGEM REGRESSIVA ────────────────────────────────── */
(function initCountdown() {
  var elDias     = document.getElementById('dias');
  var elHoras    = document.getElementById('horas');
  var elMinutos  = document.getElementById('minutos');
  var elSegundos = document.getElementById('segundos');

  function pad(n) {
    return String(Math.max(0, Math.floor(n))).padStart(2, '0');
  }

  function update() {
    var diff = WEDDING_DATE.getTime() - Date.now();
    if (diff <= 0) {
      elDias.textContent = elHoras.textContent = elMinutos.textContent = elSegundos.textContent = '00';
      return;
    }
    var s = diff / 1000;
    elDias.textContent     = pad(s / 86400);
    elHoras.textContent    = pad((s % 86400) / 3600);
    elMinutos.textContent  = pad((s % 3600) / 60);
    elSegundos.textContent = pad(s % 60);
  }

  update();
  setInterval(update, 1000);
})();


/* ── REVEAL AO SCROLL ───────────────────────────────────── */
(function initReveal() {
  var elements = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    elements.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  elements.forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 0.08 + 's';
    observer.observe(el);
  });
})();


/* ── MODAL PIX + LOCALSTORAGE ───────────────────────────── */
var cardAtivo = null;

function abrirModal(btn) {
  var card = btn.closest('.gift-card');
  if (!card || card.classList.contains('gifted')) return;
  document.getElementById('modalGiftName').textContent  = card.dataset.name;
  document.getElementById('modalGiftPrice').textContent = formatarMoeda(parseFloat(card.dataset.price));
  document.getElementById('pixKey').textContent         = PIX_KEY;
  document.getElementById('copyText').textContent       = 'Copiar';
  cardAtivo = card;
  document.getElementById('pixModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function fecharModal() {
  document.getElementById('pixModal').classList.remove('active');
  document.body.style.overflow = '';
  cardAtivo = null;
}

document.getElementById('pixModal').addEventListener('click', function (e) {
  if (e.target === this) fecharModal();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') fecharModal();
});

function copiarPix() {
  var key = document.getElementById('pixKey').textContent;
  var copyTextEl = document.getElementById('copyText');

  function onCopied() {
    copyTextEl.textContent = 'Copiado!';
    setTimeout(function () { copyTextEl.textContent = 'Copiar'; }, 2000);
    mostrarToast('📋 Chave Pix copiada!');
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(key).then(onCopied).catch(function () {
      fallbackCopy(key, onCopied);
    });
  } else {
    fallbackCopy(key, onCopied);
  }
}

function fallbackCopy(text, callback) {
  var inp = document.createElement('input');
  inp.value = text;
  inp.style.position = 'fixed';
  inp.style.opacity = '0';
  document.body.appendChild(inp);
  inp.focus();
  inp.select();
  try { document.execCommand('copy'); callback(); } catch (e) { /* silent */ }
  document.body.removeChild(inp);
}

function confirmarPresente() {
  if (!cardAtivo) return;
  var id   = cardAtivo.dataset.id;
  var name = cardAtivo.dataset.name;
  var presentados = carregarPresentados();
  presentados[id] = { name: name, timestamp: new Date().toISOString() };
  try { localStorage.setItem('presentados', JSON.stringify(presentados)); } catch (e) { /* sem localStorage */ }
  marcarComoPresente(cardAtivo);
  fecharModal();
  mostrarToast('🎁 Obrigado! "' + name + '" foi presenteado com amor!');
}

function marcarComoPresente(card) {
  card.classList.add('gifted');
  var btn = card.querySelector('.btn-presentear');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✔ Presenteado';
  }
}

function carregarPresentados() {
  try { return JSON.parse(localStorage.getItem('presentados')) || {}; }
  catch (e) { return {}; }
}

// Restaura estado ao carregar
(function () {
  var presentados = carregarPresentados();
  document.querySelectorAll('.gift-card').forEach(function (card) {
    if (presentados[card.dataset.id]) marcarComoPresente(card);
  });
})();

function formatarMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}


/* ── RSVP — CONFIRMAÇÃO VIA WHATSAPP ────────────────────── */
(function initRsvp() {
  var btnMenos   = document.getElementById('btn-menos');
  var btnMais    = document.getElementById('btn-mais');
  var inputPessoas = document.getElementById('rsvp-pessoas');
  var btnConfirmar = document.getElementById('btn-confirmar-presenca');

  // Controles numéricos
  btnMenos.addEventListener('click', function () {
    var val = parseInt(inputPessoas.value, 10);
    if (val > 1) inputPessoas.value = val - 1;
  });

  btnMais.addEventListener('click', function () {
    var val = parseInt(inputPessoas.value, 10);
    if (val < 20) inputPessoas.value = val + 1;
  });

  // Enviar para WhatsApp
  btnConfirmar.addEventListener('click', function () {
    var nome    = document.getElementById('rsvp-nome').value.trim();
    var pessoas = parseInt(inputPessoas.value, 10);

    if (!nome) {
      mostrarToast('⚠️ Por favor, informe seu nome.', 3000);
      document.getElementById('rsvp-nome').focus();
      return;
    }

    var mensagem = 'Olá! Aqui é ' + nome + '. Confirmo minha presença no casamento de Éric & Valeria. Seremos em ' + pessoas + (pessoas === 1 ? ' pessoa.' : ' pessoas.');
    var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(mensagem);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
})();


/* ── TOAST ──────────────────────────────────────────────── */
var toastTimer = null;

function mostrarToast(msg, duration) {
  duration = duration || 3500;
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toast.classList.remove('show');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { toast.classList.add('show'); });
  });
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, duration);
}


/* ── SMOOTH SCROLL ──────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (e) {
    var target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  });
});
