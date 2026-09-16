const data = window.STEPHANIE_SITE;
const servicesGrid = document.querySelector("#servicesGrid");
const galleryGrid = document.querySelector("#galleryGrid");
const galleryFilters = document.querySelector("#galleryFilters");
const pricingTabs = document.querySelector("#pricingTabs");
const pricingList = document.querySelector("#pricingList");
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
const serviceMap = document.querySelector("#serviceMap");
const weddingStyleFilters = document.querySelector("#weddingStyleFilters");
const weddingGalleryGrid = document.querySelector("#weddingGalleryGrid");
let selectedCategory = "Tout";
let selectedPriceTab = "Femmes";
let selectedWeddingStyle = "Tout";
let mobileGalleryLightbox = null;
let mobileReviewLightbox = null;

const weddingGalleryData = [
  { src: "./assets/mariage/01-chignon-tresse-rousse.jpg", title: "Tresse rousse fleurie", category: "Chignons" },
  { src: "./assets/mariage/02-chignon-banane-brun.jpg", title: "Banane elegante", category: "Chignons" },
  { src: "./assets/mariage/05-chignon-bas-brun.jpg", title: "Brun sophistique", category: "Chignons" },
  { src: "./assets/mariage/12-chignon-blond-lac.jpg", title: "Blond romantique", category: "Chignons" },
  { src: "./assets/mariage/17-chignon-flou-roux.jpg", title: "Flou roux", category: "Chignons" },
  { src: "./assets/mariage/20-chignon-bas-roux.jpg", title: "Bas roux minimaliste", category: "Chignons" },
  { src: "./assets/mariage/21-chignon-tresse-perles.jpg", title: "Tresse et perles", category: "Chignons" },
  { src: "./assets/mariage/23-chignon-haut-brun.jpg", title: "Haut brun", category: "Chignons" },
  { src: "./assets/mariage/04-tresse-basse-brune.jpg", title: "Attache basse fleurie", category: "Tresses" },
  { src: "./assets/mariage/06-tresse-basse-rousse.jpg", title: "Rousse et fleurie", category: "Tresses" },
  { src: "./assets/mariage/07-chignon-tresse-brun.jpg", title: "Tresse brune", category: "Tresses" },
  { src: "./assets/mariage/08-tresse-longue-fleurie.jpg", title: "Longue et boheme", category: "Tresses" },
  { src: "./assets/mariage/13-tresse-bulle-brune.jpg", title: "Bulle brune", category: "Tresses" },
  { src: "./assets/mariage/16-chignon-tresse-rousse-bijou.jpg", title: "Rousse precieuse", category: "Tresses" },
  { src: "./assets/mariage/03-attache-basse-blonde.jpg", title: "Blond lumineux", category: "Attaches" },
  { src: "./assets/mariage/11-queue-basse-brune.jpg", title: "Queue basse souple", category: "Attaches" },
  { src: "./assets/mariage/14-demi-attache-brune.jpg", title: "Demi-attache naturelle", category: "Attaches" },
  { src: "./assets/mariage/15-queue-haute-blonde.jpg", title: "Queue haute blonde", category: "Attaches" },
  { src: "./assets/mariage/22-chignon-bas-brun-verriere.jpg", title: "Bas brun naturel", category: "Attaches" },
  { src: "./assets/mariage/09-carre-wavy-blond.jpg", title: "Carre blond", category: "Wavy" },
  { src: "./assets/mariage/10-wavy-long-brun.jpg", title: "Longueurs brunes", category: "Wavy" },
  { src: "./assets/mariage/18-tresse-longue-blonde.jpg", title: "Longue blonde", category: "Wavy" },
  { src: "./assets/mariage/19-wavy-blond-bijou.jpg", title: "Blond avec bijou", category: "Wavy" }
];

const weddingStyleLabels = ["Tout", "Chignons", "Tresses", "Attaches", "Wavy"];

function renderServices() {
  if (!servicesGrid) return;
  servicesGrid.innerHTML = data.services
    .map((service) => `<article class="service-card"><h3>${service.title}</h3><p>${service.text}</p></article>`)
    .join("");
}

function renderGallery() {
  if (!galleryGrid || !galleryFilters) return;
  galleryFilters.innerHTML = data.galleryFilters
    .map((filter) => `<button type="button" class="${filter === selectedCategory ? "active" : ""}" data-filter="${filter}">${filter}</button>`)
    .join("");

  const visibleItems = data.gallery.filter((item) => selectedCategory === "Tout" || item.category === selectedCategory);
  galleryGrid.innerHTML = visibleItems
    .map(
      (item, index) => `
        <figure class="gallery-item" data-gallery-index="${index}">
          <img src="${item.src}" alt="${item.title}" loading="lazy">
          <figcaption><span>${item.category}</span>${item.title}</figcaption>
        </figure>
      `
    )
    .join("");
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function ensureMobileGalleryLightbox() {
  if (mobileGalleryLightbox) return mobileGalleryLightbox;

  const overlay = document.createElement("div");
  overlay.className = "mobile-gallery-lightbox";
  overlay.setAttribute("aria-label", "Photo agrandie");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="mobile-gallery-shell">
      <button type="button" class="mobile-gallery-close" aria-label="Fermer">×</button>
      <img src="" alt="">
    </div>
  `;

  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector(".mobile-gallery-close");
  closeButton.addEventListener("click", closeMobileGalleryItem);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMobileGalleryItem();
  });

  mobileGalleryLightbox = overlay;
  return overlay;
}

function closeMobileGalleryItem() {
  if (!mobileGalleryLightbox) return;
  mobileGalleryLightbox.classList.remove("open");
  mobileGalleryLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
}

function openMobileGalleryItem(source, alt) {
  const overlay = ensureMobileGalleryLightbox();
  const image = overlay.querySelector("img");
  image.src = source;
  image.alt = alt;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
}

function initMobileGalleryInteractions() {
  if (!galleryGrid) return;

  galleryGrid.addEventListener("click", (event) => {
    if (!isMobileViewport()) return;

    const item = event.target.closest(".gallery-item");
    if (!item) return;

    const image = item.querySelector("img");
    if (!image) return;

    openMobileGalleryItem(image.currentSrc || image.src, image.alt || "Photo réalisation");
  });
}

function initMobileWeddingGalleryInteractions() {
  if (!weddingGalleryGrid) return;

  weddingGalleryGrid.addEventListener("click", (event) => {
    if (!isMobileViewport()) return;

    const item = event.target.closest(".gallery-item");
    if (!item) return;

    const image = item.querySelector("img");
    if (!image) return;

    openMobileGalleryItem(image.currentSrc || image.src, image.alt || "Photo mariage");
  });
}

function ensureMobileReviewLightbox() {
  if (mobileReviewLightbox) return mobileReviewLightbox;

  const overlay = document.createElement("div");
  overlay.className = "mobile-review-lightbox";
  overlay.setAttribute("aria-label", "Avis agrandi");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="mobile-review-shell">
      <button type="button" class="mobile-review-close" aria-label="Fermer">×</button>
      <div class="mobile-review-content"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".mobile-review-close")?.addEventListener("click", closeMobileReviewItem);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMobileReviewItem();
  });

  mobileReviewLightbox = overlay;
  return overlay;
}

function closeMobileReviewItem() {
  if (!mobileReviewLightbox) return;
  mobileReviewLightbox.classList.remove("open");
  mobileReviewLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
}

function openMobileReviewItem(card) {
  const overlay = ensureMobileReviewLightbox();
  const content = overlay.querySelector(".mobile-review-content");
  if (!content) return;

  const clone = card.cloneNode(true);
  clone.removeAttribute("aria-hidden");
  clone.classList.add("mobile-review-expanded-card");
  content.replaceChildren(clone);

  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
}

function initMobileReviewInteractions() {
  const reviewCards = document.querySelectorAll(".review-card");
  if (!reviewCards.length) return;

  reviewCards.forEach((card) => {
    if (card.getAttribute("aria-hidden") === "true") return;

    card.addEventListener("click", (event) => {
      if (!isMobileViewport()) return;
      if (event.target.closest("a")) return;
      openMobileReviewItem(card);
    });
  });
}

function renderPrices() {
  if (!pricingTabs || !pricingList) return;
  pricingTabs.innerHTML = Object.keys(data.prices)
    .map((tab) => `<button type="button" class="${tab === selectedPriceTab ? "active" : ""}" data-tab="${tab}">${tab}</button>`)
    .join("");

  pricingList.innerHTML = data.prices[selectedPriceTab]
    .map(
      (section) => `
        <section class="price-group">
          <h3>${section.group}</h3>
          ${section.items
            .map(([name, price]) =>
              price ? `<div class="price-row"><span>${name}</span><strong>${price}</strong></div>` : `<p class="price-note">${name}</p>`
            )
            .join("")}
        </section>
      `
    )
    .join("");
}

function initServiceMap() {
  if (!serviceMap || !window.L) return;

  const map = L.map(serviceMap, {
    scrollWheelZoom: true,
    zoomControl: true
  }).setView([45.5622913, 4.2892399], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const mainCoverage = [
    [45.525, 3.963],
    [45.572, 3.966],
    [45.636, 3.984],
    [45.700, 4.035],
    [45.754, 4.090],
    [45.775, 4.165],
    [45.765, 4.240],
    [45.718, 4.330],
    [45.645, 4.415],
    [45.560, 4.475],
    [45.480, 4.475],
    [45.430, 4.405],
    [45.405, 4.320],
    [45.395, 4.190],
    [45.402, 4.052],
    [45.456, 3.985]
  ];

  const zoneStyle = {
    color: "#b93c5f",
    weight: 2,
    fillColor: "#ffc9d4",
    fillOpacity: 0.34
  };

  L.polygon(mainCoverage, {
    ...zoneStyle,
    smoothFactor: 0.6
  }).addTo(map).bindPopup("Zone de déplacement: Veauche, Plaine du Forez et alentours");

  const cities = [
    ["Andrézieux-Bouthéon", 45.5250887, 4.2594811],
    ["Aveizieux", 45.5653000, 4.3719200],
    ["Bard", 45.5876709, 4.0120110],
    ["Bellegarde-en-Forez", 45.6471727, 4.2981197],
    ["Boisset-lès-Montrond", 45.6228, 4.2123],
    ["Boisset-Saint-Priest", 45.5125000, 4.1047300],
    ["Bonson", 45.5225917, 4.2154175],
    ["Chalain-d'Uzore", 45.6730217, 4.0713993],
    ["Chalain-le-Comtal", 45.6461839, 4.1691566],
    ["Chambéon", 45.6955, 4.17485],
    ["Chamboeuf", 45.5771746, 4.3207570],
    ["Champdieu", 45.6461047, 4.0467474],
    ["Chazelles-sur-Lavieu", 45.5388, 4.00164],
    ["Chazelles-sur-Lyon", 45.6375531, 4.3889953],
    ["Chenereilles", 45.4829000, 4.0807600],
    ["Craintilleux", 45.5843, 4.23378],
    ["Cuzieu", 45.6121925, 4.2579683],
    ["Écotay-l'Olme", 45.5911649, 4.0508251],
    ["Feurs", 45.7440738, 4.2215124],
    ["Grézieux-le-Fromental", 45.619, 4.15155],
    ["Gumières", 45.5316000, 3.9877200],
    ["L'Étrat", 45.4863704, 4.3755315],
    ["L'Hôpital-le-Grand", 45.5939631, 4.1983685],
    ["La Fouillouse", 45.5009884, 4.3157199],
    ["La Talaudière", 45.4804780, 4.4290257],
    ["La Tour-en-Jarez", 45.4851029, 4.3876936],
    ["Lézigneux", 45.567, 4.06143],
    ["Luriecq", 45.4511233, 4.0784718],
    ["Magneux-Haute-Rive", 45.6694153, 4.1717613],
    ["Marclopt", 45.6656172, 4.2090677],
    ["Margerie-Chantagret", 45.5253000, 4.0672700],
    ["Marols", 45.4782091, 4.0467361],
    ["Montbrison", 45.6072875, 4.0627318],
    ["Montrond-les-Bains", 45.6433431, 4.2299344],
    ["Mornand-en-Forez", 45.6774000, 4.1236400],
    ["Périgneux", 45.4419832, 4.1555711],
    ["Poncins", 45.7281239, 4.1601332],
    ["Pralong", 45.6658747, 4.0307116],
    ["Précieux", 45.5862408, 4.1501848],
    ["Ratarieux", 45.4792334, 4.3583347],
    ["Rivas", 45.5858, 4.24753],
    ["Roche-la-Molière", 45.4348987, 4.3212622],
    ["Saint-André-le-Puy", 45.6456225, 4.2578662],
    ["Saint-Bonnet-le-Château", 45.4235000, 4.0655500],
    ["Saint-Bonnet-les-Oules", 45.5439729, 4.3277946],
    ["Saint-Cyprien", 45.5377735, 4.2360503],
    ["Saint-Cyr-les-Vignes", 45.6763000, 4.2989800],
    ["Saint-Galmier", 45.5903147, 4.3183716],
    ["Saint-Genest-Lerpt", 45.4460991, 4.3360534],
    ["Saint-Georges-Haute-Ville", 45.554421, 4.0992223],
    ["Saint-Héand", 45.5296285, 4.3752871],
    ["Saint-Jean-Soleymieux", 45.5045000, 4.0390100],
    ["Saint-Just-Saint-Rambert", 45.4994639, 4.2423759],
    ["Saint-Laurent-la-Conche", 45.6844000, 4.2128900],
    ["Saint-Marcellin-en-Forez", 45.4972427, 4.1670428],
    ["Saint-Médard-en-Forez", 45.5973395, 4.3619438],
    ["Saint-Paul-d'Uzore", 45.6765199, 4.0799376],
    ["Saint-Priest-en-Jarez", 45.4734080, 4.3792689],
    ["Saint-Romain-le-Puy", 45.5549769, 4.1248446],
    ["Saint-Thomas-la-Garde", 45.5673563, 4.0815435],
    ["Savigneux", 45.6063569, 4.0879027],
    ["Soleymieux", 45.5087757, 4.0417891],
    ["Sorbiers", 45.4873195, 4.4507034],
    ["Sury-le-Comtal", 45.5381922, 4.1829539],
    ["Unias", 45.6059450, 4.2264907],
    ["Veauchette", 45.562946, 4.2638619],
    ["Verrières-en-Forez", 45.5708000, 3.9967400],
    ["Villars", 45.4684804, 4.3533070]
  ];

  const markerOptions = {
    radius: 6,
    color: "#b93c5f",
    weight: 2,
    fillColor: "#fffdf9",
    fillOpacity: 1
  };

  cities.forEach(([name, lat, lng]) => {
    L.circleMarker([lat, lng], markerOptions).addTo(map).bindPopup(name);
  });

  L.circleMarker([45.5622913, 4.2892399], {
    ...markerOptions,
    radius: 8,
    color: "#292827",
    fillColor: "#ffc9d4"
  }).addTo(map).bindPopup("Veauche");

  const bounds = L.latLngBounds([
    ...cities.map(([, lat, lng]) => [lat, lng]),
    [45.5622913, 4.2892399]
  ]);
  map.fitBounds(bounds.pad(0.12));
}

function renderWeddingGallery() {
  if (!weddingGalleryGrid || !weddingStyleFilters) return;

  weddingStyleFilters.innerHTML = weddingStyleLabels
    .map((label) => `<button type="button" class="${label === selectedWeddingStyle ? "active" : ""}" data-style="${label}">${label}</button>`)
    .join("");

  const visibleItems = weddingGalleryData.filter((item) => selectedWeddingStyle === "Tout" || item.category === selectedWeddingStyle);

  weddingGalleryGrid.innerHTML = visibleItems
    .map(
      (item) => `
        <figure class="gallery-item">
          <img src="${item.src}" alt="${item.title}" loading="lazy">
          <figcaption><span>${item.category}</span>${item.title}</figcaption>
        </figure>
      `
    )
    .join("");
}

if (galleryFilters) {
  galleryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    selectedCategory = button.dataset.filter;
    renderGallery();
  });
}

if (pricingTabs) {
  pricingTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) return;
    selectedPriceTab = button.dataset.tab;
    renderPrices();
  });
}

if (weddingStyleFilters) {
  weddingStyleFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-style]");
    if (!button) return;
    selectedWeddingStyle = button.dataset.style;
    renderWeddingGallery();
  });
}

navToggle.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

mainNav.addEventListener("click", () => {
  mainNav.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
});

const legalDialog = document.querySelector("#legalDialog");
const legalToggle = document.querySelector("#legalToggle");
const legalClose = document.querySelector("#legalClose");
if (legalDialog && legalToggle && legalClose) {
  legalToggle.addEventListener("click", () => legalDialog.showModal());
  legalClose.addEventListener("click", () => legalDialog.close());
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileGalleryItem();
    closeMobileReviewItem();
  }
});

renderServices();
renderGallery();
renderWeddingGallery();
renderPrices();
initServiceMap();
initMobileGalleryInteractions();
initMobileWeddingGalleryInteractions();
initMobileReviewInteractions();
