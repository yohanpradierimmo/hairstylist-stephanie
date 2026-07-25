const data = window.STEPHANIE_SITE;
const servicesGrid = document.querySelector("#servicesGrid");
const galleryGrid = document.querySelector("#galleryGrid");
const galleryFilters = document.querySelector("#galleryFilters");
const pricingTabs = document.querySelector("#pricingTabs");
const pricingList = document.querySelector("#pricingList");
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
const serviceMap = document.querySelector("#serviceMap");
const weddingCollections = document.querySelector("#weddingCollections");
let selectedCategory = "Tout";
let selectedPriceTab = "Femmes";
let selectedWeddingStyle = "all";

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
      (item) => `
        <figure class="gallery-item">
          <img src="${item.src}" alt="${item.title}" loading="lazy">
          <figcaption><span>${item.category}</span>${item.title}</figcaption>
        </figure>
      `
    )
    .join("");
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
    ["Montbrison", 45.607, 4.065],
    ["Savigneux", 45.616, 4.083],
    ["Saint-Romain-le-Puy", 45.558, 4.123],
    ["Sury-le-Comtal", 45.536, 4.185],
    ["Bonson", 45.522, 4.217],
    ["Saint-Just-Saint-Rambert", 45.499, 4.242],
    ["Andrézieux-Bouthéon", 45.526, 4.260],
    ["Veauche", 45.563, 4.277],
    ["Saint-Galmier", 45.592, 4.317],
    ["Montrond-les-Bains", 45.643, 4.231],
    ["Feurs", 45.743, 4.227],
    ["Boën-sur-Lignon", 45.746, 4.006],
    ["Champdieu", 45.645, 4.047],
    ["Précieux", 45.588, 4.151],
    ["Lézigneux", 45.566, 4.061],
    ["Saint-Marcellin-en-Forez", 45.496, 4.169],
    ["Roche-la-Molière", 45.434, 4.322],
    ["Saint-Genest-Lerpt", 45.445, 4.336]
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

function initWeddingCollections() {
  if (!weddingCollections) return;

  const groups = Array.from(weddingCollections.querySelectorAll(".wedding-group"));
  const controls = Array.from(document.querySelectorAll(".style-links [data-style]"));

  const applyWeddingStyle = (style) => {
    selectedWeddingStyle = style;
    controls.forEach((control) => control.classList.toggle("active", control.dataset.style === style));

    groups.forEach((group) => {
      const isVisible = style === "all" || group.id === style;
      group.hidden = !isVisible;
    });

    const overview = weddingCollections.nextElementSibling;
    if (overview && overview.classList.contains("wedding-overview-grid")) {
      overview.hidden = style !== "all";
    }
  };

  controls.forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      applyWeddingStyle(control.dataset.style);
      weddingCollections.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  applyWeddingStyle(selectedWeddingStyle);
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
renderPrices();
initServiceMap();
initWeddingCollections();
