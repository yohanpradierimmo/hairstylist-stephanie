const data = window.STEPHANIE_SITE;
const servicesGrid = document.querySelector("#servicesGrid");
const galleryGrid = document.querySelector("#galleryGrid");
const galleryFilters = document.querySelector("#galleryFilters");
const pricingTabs = document.querySelector("#pricingTabs");
const pricingList = document.querySelector("#pricingList");
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
let selectedCategory = "Tout";
let selectedPriceTab = "Femmes";

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
