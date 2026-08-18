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

  const overlay = document.createElement("dialog");
  overlay.className = "mobile-gallery-lightbox";
  overlay.setAttribute("aria-label", "Photo agrandie");
  overlay.innerHTML = `
    <button type="button" class="mobile-gallery-close" aria-label="Fermer">×</button>
    <img src="" alt="">
  `;

  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector(".mobile-gallery-close");
  closeButton.addEventListener("click", () => overlay.close());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.close();
  });

  mobileGalleryLightbox = overlay;
  return overlay;
}

function openMobileGalleryItem(source, alt) {
  const overlay = ensureMobileGalleryLightbox();
  const image = overlay.querySelector("img");
  image.src = source;
  image.alt = alt;
  if (!overlay.open) overlay.showModal();
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
  }).setView([45.585, 4.17], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const mainCoverage = [
    [45.774, 3.99],
    [45.758, 4.24],
    [45.638, 4.34],
    [45.505, 4.29],
    [45.468, 4.18],
    [45.512, 4.02],
    [45.615, 3.93]
  ];

  const westSaintEtienneCoverage = [
    [45.482, 4.272],
    [45.474, 4.365],
    [45.415, 4.376],
    [45.398, 4.292],
    [45.437, 4.235]
  ];

  const zoneStyle = {
    color: "#b93c5f",
    weight: 2,
    fillColor: "#ffc9d4",
    fillOpacity: 0.34
  };

  L.polygon(mainCoverage, zoneStyle).addTo(map).bindPopup("Zone principale: Montbrison et Plaine du Forez");
  L.polygon(westSaintEtienneCoverage, {
    ...zoneStyle,
    fillColor: "#ffe9ed",
    dashArray: "7 6"
  }).addTo(map).bindPopup("Secteur Roche-la-Molière et Saint-Genest-Lerpt");

  const cities = [
    ["Andrézieux-Bouthéon", 45.5250887, 4.2594811],
    ["Bonson", 45.5225917, 4.2154175],
    ["Boisset-lès-Montrond", 45.6228, 4.2123],
    ["Chalain-d'Uzore", 45.6730217, 4.0713993],
    ["Chambéon", 45.6955, 4.17485],
    ["Champdieu", 45.6461047, 4.0467474],
    ["Chazelles-sur-Lavieu", 45.5388, 4.00164],
    ["Craintilleux", 45.5843, 4.23378],
    ["Cuzieu", 45.6121925, 4.2579683],
    ["Écotay-l'Olme", 45.5911649, 4.0508251],
    ["Grézieux-le-Fromental", 45.619, 4.15155],
    ["L'Hôpital-le-Grand", 45.5939631, 4.1983685],
    ["Lézigneux", 45.567, 4.06143],
    ["Magneux-Haute-Rive", 45.6694153, 4.1717613],
    ["Marcoux", 45.711462, 4.0131614],
    ["Montbrison", 45.6072875, 4.0627318],
    ["Montrond-les-Bains", 45.6433431, 4.2299344],
    ["Montverdun", 45.714882, 4.0662679],
    ["Pralong", 45.6658747, 4.0307116],
    ["Précieux", 45.5862408, 4.1501848],
    ["Rivas", 45.5858, 4.24753],
    ["Roche-la-Molière", 45.4348987, 4.3212622],
    ["Saint-André-le-Puy", 45.6456225, 4.2578662],
    ["Saint-Bonnet-les-Oules", 45.5439729, 4.3277946],
    ["Saint-Cyprien", 45.5377735, 4.2360503],
    ["Saint-Galmier", 45.5903147, 4.3183716],
    ["Saint-Genest-Lerpt", 45.4460991, 4.3360534],
    ["Saint-Georges-Haute-Ville", 45.554421, 4.0992223],
    ["Saint-Just-Saint-Rambert", 45.4994639, 4.2423759],
    ["Saint-Marcellin-en-Forez", 45.4972427, 4.1670428],
    ["Saint-Paul-d'Uzore", 45.6765199, 4.0799376],
    ["Saint-Romain-le-Puy", 45.5549769, 4.1248446],
    ["Savigneux", 45.6063569, 4.0879027],
    ["Soleymieux", 45.5087757, 4.0417891],
    ["Sury-le-Comtal", 45.5381922, 4.1829539],
    ["Veauche", 45.5622913, 4.2892399],
    ["Veauchette", 45.562946, 4.2638619]
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

  L.circleMarker([45.607, 4.065], {
    ...markerOptions,
    radius: 8,
    color: "#292827",
    fillColor: "#ffc9d4"
  }).addTo(map).bindPopup("Montbrison");
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

renderServices();
renderGallery();
renderWeddingGallery();
renderPrices();
initServiceMap();
initMobileGalleryInteractions();
