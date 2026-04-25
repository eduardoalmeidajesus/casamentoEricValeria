var PIX_KEY = "skravonskiericanderson@gmail.com";
var PIX_CITY = "CASCAVEL";
var PIX_MERCHANT = "ERIC E VALERIA";
var WHATSAPP_NUMBER = "554599725915";
var WEDDING_DATE = new Date(2026, 8, 12, 16, 0, 0);

var state = {
  gifts: [],
  activeGift: null,
  visibleGiftCount: 8,
  filters: {
    search: "",
    sort: "featured"
  }
};

var els = {};

document.addEventListener("DOMContentLoaded", function () {
  bindElements();
  initNavbar();
  initMobileQuickActions();
  initResponsiveState();
  initCountdown();
  initReveal();
  initSmoothScroll();
  initRsvp();
  initModal();
  initGiftFilters();
  loadGifts();
});

function bindElements() {
  els.navbar = document.getElementById("navbar");
  els.mobileQuickActions = document.querySelector(".mobile-quick-actions");
  els.footer = document.querySelector(".footer");
  els.navToggle = document.getElementById("navToggle");
  els.navLinks = document.getElementById("navLinks");
  els.giftsGrid = document.getElementById("giftsGrid");
  els.giftLoadMoreWrap = document.getElementById("giftLoadMoreWrap");
  els.giftLoadMore = document.getElementById("giftLoadMore");
  els.giftEmptyState = document.getElementById("giftEmptyState");
  els.giftSearch = document.getElementById("giftSearch");
  els.giftSort = document.getElementById("giftSort");
  els.totalGifts = document.getElementById("totalGifts");
  els.modal = document.getElementById("giftModal");
  els.modalClose = document.getElementById("modalClose");
  els.modalGiftName = document.getElementById("modalGiftName");
  els.modalGiftPrice = document.getElementById("modalGiftPrice");
  els.pixKey = document.getElementById("pixKey");
  els.pixQrImage = document.getElementById("pixQrImage");
  els.pixQrCaption = document.getElementById("pixQrCaption");
  els.pixPayload = document.getElementById("pixPayload");
  els.copyPix = document.getElementById("copyPix");
  els.copyPixPayload = document.getElementById("copyPixPayload");
  els.giftForm = document.getElementById("giftForm");
  els.toast = document.getElementById("toast");
}

function initMobileQuickActions() {
  if (!els.mobileQuickActions || !els.footer) return;
  var ticking = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateQuickActions() {
    ticking = false;

    if (window.innerWidth > 720) {
      els.mobileQuickActions.style.opacity = "";
      els.mobileQuickActions.style.transform = "";
      els.mobileQuickActions.style.visibility = "";
      els.mobileQuickActions.style.pointerEvents = "";
      return;
    }

    var footerTop = els.footer.getBoundingClientRect().top;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var startFadeDistance = 180;
    var endFadeDistance = 40;
    var distance = footerTop - viewportHeight;
    var progress = clamp((distance - endFadeDistance) / (startFadeDistance - endFadeDistance), 0, 1);
    var translateY = (1 - progress) * 26;
    var scale = 0.97 + (progress * 0.03);

    els.mobileQuickActions.style.opacity = String(progress);
    els.mobileQuickActions.style.transform = "translateY(" + translateY.toFixed(2) + "px) scale(" + scale.toFixed(3) + ")";
    els.mobileQuickActions.style.visibility = progress <= 0.02 ? "hidden" : "visible";
    els.mobileQuickActions.style.pointerEvents = progress <= 0.08 ? "none" : "auto";
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateQuickActions);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate();
}

function initResponsiveState() {
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (state.visibleGiftCount < getGiftPageSize()) {
        state.visibleGiftCount = getGiftPageSize();
      }
      renderGifts();
    }, 120);
  });
}

function initNavbar() {
  function syncNav() {
    els.navbar.classList.toggle("scrolled", window.scrollY > 40);
  }

  window.addEventListener("scroll", syncNav, { passive: true });
  syncNav();

  els.navToggle.addEventListener("click", function () {
    var open = !els.navLinks.classList.contains("open");
    els.navLinks.classList.toggle("open", open);
    els.navbar.classList.toggle("menu-open", open);
    els.navToggle.setAttribute("aria-expanded", String(open));
  });

  els.navLinks.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      els.navLinks.classList.remove("open");
      els.navbar.classList.remove("menu-open");
      els.navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initCountdown() {
  var nodes = ["dias", "horas", "minutos", "segundos"].map(function (id) {
    return document.getElementById(id);
  });

  function pad(value) {
    return String(Math.max(0, Math.floor(value))).padStart(2, "0");
  }

  function tick() {
    var diff = WEDDING_DATE.getTime() - Date.now();
    var seconds = Math.max(0, diff / 1000);
    nodes[0].textContent = pad(seconds / 86400);
    nodes[1].textContent = pad((seconds % 86400) / 3600);
    nodes[2].textContent = pad((seconds % 3600) / 60);
    nodes[3].textContent = pad(seconds % 60);
  }

  tick();
  window.setInterval(tick, 1000);
}

function initReveal() {
  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (item) { item.classList.add("visible"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -48px 0px" });

  items.forEach(function (item, index) {
    item.style.transitionDelay = String((index % 3) * 70) + "ms";
    observer.observe(item);
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    });
  });
}

function initGiftFilters() {
  els.giftSearch.addEventListener("input", function () {
    state.filters.search = els.giftSearch.value.trim().toLowerCase();
    resetMobileGiftPagination();
    renderGifts();
  });

  els.giftSort.addEventListener("change", function () {
    state.filters.sort = els.giftSort.value;
    resetMobileGiftPagination();
    renderGifts();
  });

  if (els.giftLoadMore) {
    els.giftLoadMore.addEventListener("click", function () {
      state.visibleGiftCount += getGiftPageSize();
      renderGifts();
    });
  }
}

function loadGifts() {
  els.giftsGrid.innerHTML = '<div class="empty-state">Carregando lista de presentes...</div>';

  fetch("/api/gifts")
    .then(function (response) {
      if (!response.ok) throw new Error("Não foi possível carregar os presentes.");
      return response.json();
    })
    .then(function (data) {
      state.gifts = data.gifts || [];
      renderGifts();
    })
    .catch(function () {
      els.giftsGrid.innerHTML = "";
      els.giftEmptyState.hidden = false;
      els.giftEmptyState.textContent = "Inicie o servidor local com node server.js para carregar a lista de presentes.";
    });
}

function renderGifts() {
  var filtered = state.gifts.filter(function (gift) {
    var text = String(gift.name || "").toLowerCase();
    return !state.filters.search || text.indexOf(state.filters.search) >= 0;
  }).sort(sortGifts);
  var pageSize = getGiftPageSize();
  var visible = filtered.slice(0, state.visibleGiftCount);

  els.totalGifts.textContent = state.gifts.length;
  els.giftEmptyState.hidden = filtered.length > 0;
  els.giftsGrid.innerHTML = visible.map(renderGiftCard).join("");
  if (els.giftLoadMoreWrap) {
    var hasMore = visible.length < filtered.length;
    els.giftLoadMoreWrap.hidden = !hasMore;
    if (hasMore) {
      els.giftLoadMore.textContent = "Ver mais presentes (" + (filtered.length - visible.length) + ")";
    }
  }

  els.giftsGrid.querySelectorAll("[data-gift-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      var gift = state.gifts.find(function (item) { return item.id === button.dataset.giftAction; });
      if (gift) openGiftModal(gift);
    });
  });
}

function resetMobileGiftPagination() {
  state.visibleGiftCount = getGiftPageSize();
}

function getGiftPageSize() {
  return window.innerWidth <= 720 ? 8 : 12;
}

function sortGifts(a, b) {
  if (state.filters.sort === "price-asc") return a.price - b.price;
  if (state.filters.sort === "price-desc") return b.price - a.price;
  if (state.filters.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
  return (a.featuredOrder || 999) - (b.featuredOrder || 999);
}

function renderGiftCard(gift) {
  var image = gift.image ? '<img src="' + escapeHtml(gift.image) + '" alt="' + escapeHtml(gift.name) + '" loading="lazy" />' : "";
  return [
    '<article class="gift-card reveal visible">',
    '  <div class="gift-image">',
    image,
    '    <span class="gift-status">Disponível</span>',
    "  </div>",
    '  <div class="gift-body">',
    "    <h3>" + escapeHtml(gift.name) + "</h3>",
    "    <p>" + escapeHtml(gift.description) + "</p>",
    '    <div class="gift-footer">',
    '      <strong class="gift-price">' + formatCurrency(gift.price) + "</strong>",
    '      <button class="btn btn-primary" type="button" data-gift-action="' + escapeHtml(gift.id) + '">Presentear</button>',
    "    </div>",
    "  </div>",
    "</article>"
  ].join("");
}

function initModal() {
  els.modalClose.addEventListener("click", closeGiftModal);
  els.modal.addEventListener("click", function (event) {
    if (event.target === els.modal) closeGiftModal();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeGiftModal();
  });
  els.copyPix.addEventListener("click", copyPix);
  els.copyPixPayload.addEventListener("click", copyPixPayload);
  els.giftForm.addEventListener("submit", submitGift);
}

function openGiftModal(gift) {
  state.activeGift = gift;
  els.modalGiftName.textContent = gift.name;
  els.modalGiftPrice.textContent = formatCurrency(gift.price);
  els.pixKey.textContent = PIX_KEY;
  updatePixQr(gift);
  els.giftForm.reset();
  els.modal.classList.add("active");
  document.body.classList.add("modal-open");
  setTimeout(function () { document.getElementById("giverName").focus(); }, 80);
}

function closeGiftModal() {
  els.modal.classList.remove("active");
  document.body.classList.remove("modal-open");
  state.activeGift = null;
}

function copyPix() {
  if (!state.activeGift) return;
  var value = buildPixPayload(state.activeGift);
  var done = function () { showToast("Código Pix copiado."); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(function () { fallbackCopy(value, done); });
    return;
  }
  fallbackCopy(value, done);
}

function copyPixPayload() {
  if (!els.pixPayload) return;
  var value = els.pixPayload.value;
  var done = function () { showToast("Pix copia e cola copiado."); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(function () { fallbackCopy(value, done); });
    return;
  }
  fallbackCopy(value, done);
}

function updatePixQr(gift) {
  var payload = buildPixPayload(gift);
  els.pixQrImage.src = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + encodeURIComponent(payload);
  els.pixQrImage.alt = "QR Code Pix para " + gift.name;
  els.pixQrCaption.textContent = "Escaneie para pagar " + formatCurrency(gift.price) + " neste presente.";
  if (els.pixPayload) els.pixPayload.value = payload;
}

function buildPixPayload(gift) {
  var merchantAccount = emvField("00", "BR.GOV.BCB.PIX")
    + emvField("01", PIX_KEY)
    + emvField("02", truncateAscii(gift.name, 40));

  var payload = ""
    + emvField("00", "01")
    + emvField("26", merchantAccount)
    + emvField("52", "0000")
    + emvField("53", "986")
    + emvField("54", Number(gift.price).toFixed(2))
    + emvField("58", "BR")
    + emvField("59", truncateAscii(PIX_MERCHANT, 25))
    + emvField("60", truncateAscii(PIX_CITY, 15))
    + emvField("62", emvField("05", "***"));

  return payload + "6304" + crc16(payload + "6304");
}

function emvField(id, value) {
  var text = String(value == null ? "" : value);
  return id + String(text.length).padStart(2, "0") + text;
}

function truncateAscii(value, max) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,/&()-]/g, "")
    .toUpperCase()
    .slice(0, max);
}

function crc16(value) {
  var crc = 0xFFFF;
  for (var i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8;
    for (var bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function fallbackCopy(value, callback) {
  var input = document.createElement("input");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  try { document.execCommand("copy"); callback(); } catch (error) {}
  document.body.removeChild(input);
}

function submitGift(event) {
  event.preventDefault();
  if (!state.activeGift) return;

  var button = els.giftForm.querySelector("button[type='submit']");
  var payload = {
    giverName: document.getElementById("giverName").value.trim(),
    message: document.getElementById("giverMessage").value.trim()
  };

  if (!payload.giverName) {
    showToast("Informe seu nome para confirmar.");
    return;
  }

  button.disabled = true;
  button.textContent = "Confirmando...";

  fetch("/api/gifts/" + encodeURIComponent(state.activeGift.id) + "/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (error) {
          throw new Error(error.message || "Não foi possível confirmar este presente.");
        });
      }
      return response.json();
    })
    .then(function (data) {
      var index = state.gifts.findIndex(function (gift) { return gift.id === data.gift.id; });
      if (index >= 0) state.gifts[index] = data.gift;
      renderGifts();
      closeGiftModal();
      showToast("Presente confirmado. Obrigado pelo carinho!");
    })
    .catch(function (error) {
      showToast(error.message);
      loadGifts();
    })
    .finally(function () {
      button.disabled = false;
      button.textContent = "Já fiz o Pix e quero confirmar";
    });
}

function initRsvp() {
  var btnMenos = document.getElementById("btn-menos");
  var btnMais = document.getElementById("btn-mais");
  var inputPessoas = document.getElementById("rsvp-pessoas");
  var btnConfirmar = document.getElementById("btn-confirmar-presenca");

  btnMenos.addEventListener("click", function () {
    inputPessoas.value = String(Math.max(1, Number(inputPessoas.value) - 1));
  });

  btnMais.addEventListener("click", function () {
    inputPessoas.value = String(Math.min(20, Number(inputPessoas.value) + 1));
  });

  btnConfirmar.addEventListener("click", function () {
    var nome = document.getElementById("rsvp-nome").value.trim();
    var pessoas = Number(inputPessoas.value);

    if (!nome) {
      showToast("Por favor, informe seu nome.");
      document.getElementById("rsvp-nome").focus();
      return;
    }

    var mensagem = "Olá! Aqui é " + nome + ". Confirmo minha presença no casamento de Éric & Valéria. Seremos em " + pessoas + (pessoas === 1 ? " pessoa." : " pessoas.");
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmando...";

    fetch("/api/rsvps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nome,
        guestCount: pessoas,
        message: mensagem
      })
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (error) {
            throw new Error(error.message || "Não foi possível registrar a presença.");
          });
        }
        return response.json();
      })
      .then(function () {
        window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(mensagem), "_blank", "noopener,noreferrer");
        showToast("Presença registrada e WhatsApp aberto.");
      })
      .catch(function (error) {
        showToast(error.message);
      })
      .finally(function () {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "Confirmar via WhatsApp";
      });
  });
}

var toastTimer = null;
function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(function () { els.toast.classList.remove("show"); }, 3600);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
