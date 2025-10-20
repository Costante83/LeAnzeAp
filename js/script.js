// 🌿 Le Anze Agriturismo – script.js (V1.1_final aggiornato)

// Mappa base
const map = L.map('map', { zoomControl: false }).setView([45.61, 10.69], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
L.marker([45.6214, 10.7006]).bindPopup('🏡 <b>Agriturismo Le Anze</b><br>Benvenuto!').addTo(map);


// --- Localizzazione GPS con freccia blu direzionale ---
let userMarker = null;
let userHeading = 0;
let userPosition = null;

// Icona freccia blu SVG (rotabile)
const arrowIcon = L.divIcon({
  className: "user-arrow",
  html: `
  <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(0deg); transform-origin: center;">
    <polygon points="15,3 25,27 15,22 5,27" fill="#007bff" />
  </svg>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Aggiorna direzione (bussola)
if ('DeviceOrientationEvent' in window) {
  window.addEventListener('deviceorientationabsolute', e => {
    if (e.alpha !== null) userHeading = e.alpha; // 0-360°
    updateArrowRotation();
  }, true);
  window.addEventListener('deviceorientation', e => {
    if (e.alpha !== null) userHeading = e.alpha;
    updateArrowRotation();
  }, true);
}

function updateArrowRotation() {
  const arrow = document.querySelector('.user-arrow div');
  if (arrow) arrow.style.transform = `rotate(${userHeading}deg)`;
}

// Attiva tracciamento posizione GPS
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      userPosition = [lat, lon];

      if (!userMarker) {
        userMarker = L.marker(userPosition, { icon: arrowIcon }).addTo(map);
      } else {
        userMarker.setLatLng(userPosition);
      }

      // Centra la prima volta
      if (!map._userLocated) {
        map.setView(userPosition, 16);
        map._userLocated = true;
      }
    },
    err => console.warn("Errore GPS:", err),
    { enableHighAccuracy: true }
  );
} else {
  alert("⚠️ Il tuo dispositivo non supporta la geolocalizzazione GPS.");
}



// Apertura/chiusura pannello
const btn = document.getElementById('btnFilter'),
      panel = document.getElementById('filterPanel');
function togglePanel(s) {
  const open = s ?? !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  panel.setAttribute('aria-hidden', String(!open));
  btn.setAttribute('aria-expanded', String(open));
}
btn.addEventListener('click', () => togglePanel());
map.on('click', () => { if (panel.classList.contains('open')) togglePanel(false); });

// Stili e cache
const styles = {
  bici:  { color: '#3b82f6', weight: 4, opacity: 0.9 },
  piedi: { color: '#22c55e', weight: 3, opacity: 0.8, dashArray: '6,6' }
};
const cacheRoutes = { bici: null, piedi: null };
const routeLayers = {}; // key = tipo_nome

// --- Funzioni dinamiche per percorsi (indice + file esterni) ---
function createSubCheckbox(tipo, name) {
  const id = (tipo + '_' + name).replace(/\s+/g, '').replace(/[^\w]/g, '');
  const div = document.createElement('div');
  div.className = 'option';
  div.innerHTML = `<input type="checkbox" data-type="${tipo}" data-name="${name}" id="${id}">
                   <label for="${id}">${name}</label>`;
  div.querySelector('input').addEventListener('change', e =>
    toggleRoute(tipo, name, e.target)
  );
  return div;
}

function populateSub(tipo) {
  const cont = document.getElementById(tipo === 'bici' ? 'subBici' : 'subPiedi');
  cont.innerHTML = '';
  const data = cacheRoutes[tipo];
  if (!data) return;
  const features = data.features || [];
  features.forEach(f => {
    const n = f.properties?.name || 'Percorso';
    cont.appendChild(createSubCheckbox(tipo, n));
  });
}

function toggleMaster(tipo, checked) {
  const cont = document.getElementById(tipo === 'bici' ? 'subBici' : 'subPiedi');
  if (checked) {
    if (!cacheRoutes[tipo]) {
      fetch(`assets/data/percorsi_${tipo}.geojson?v=${Date.now()}`)
        .then(r => r.json())
        .then(d => { cacheRoutes[tipo] = d; populateSub(tipo); });
    } else populateSub(tipo);
    cont.style.display = 'block';
  } else {
    // Rimuove tutti i layer di quel tipo
    Object.keys(routeLayers)
      .filter(k => k.startsWith(tipo + '_'))
      .forEach(k => { map.removeLayer(routeLayers[k]); delete routeLayers[k]; });
    cont.innerHTML = '';
    cont.style.display = 'none';
  }
}

// --- Caricamento singolo percorso ---
function toggleRoute(tipo, name, chk) {
  const key = tipo + '_' + name;
  if (chk.checked) {
    const data = cacheRoutes[tipo];
    if (!data) return;
    const feat = data.features.find(f => f.properties?.name === name);
    if (!feat) return;

    // 🗂️ Se la feature ha un campo "file", carica il file esterno
    if (feat.properties.file) {
      const fileName = feat.properties.file;
      fetch('assets/data/' + feat.properties.file + '?v=' + Date.now())
        .then(r => r.json())
        .then(sub => {
          const layer = L.geoJSON(sub, {
            style: styles[tipo],
            onEachFeature: (feat, l) => {
              const p = feat.properties || {};
              let html = `<b>${p.name || name}</b>`;

              // Mostra eventuali dati tecnici
              if (p.lunghezza || p.dislivello || p.tempo) {
              html += `<br><small>`;
              if (p.lunghezza) html += `📏 <b>Lunghezza:</b> ${p.lunghezza}<br>`;
              if (p.dislivello) html += `⛰️ <b>Dislivello:</b> ${p.dislivello}<br>`;
              if (p.tempo) html += `⏱️ <b>Tempo:</b> ${p.tempo}<br>`;
              html += `</small>`;
              }
              l.bindPopup(html);
            }
          }).addTo(map);
          map.fitBounds(layer.getBounds());
          routeLayers[key] = layer;
        });
      return;
    }

    // 🔹 Altrimenti usa direttamente la geometria presente nel file indice
    const layer = L.geoJSON(feat, {
      style: styles[tipo],
      onEachFeature: (feat, l) => {
        const p = feat.properties || {};
        let html = `<b>${p.name || name}</b>`;
        if (p.mappa)
          html += `<br>🗺️ <a href="${p.mappa}" target="_blank">Vedi percorso completo</a>`;
        l.bindPopup(html);
      }
    }).addTo(map);
    map.fitBounds(layer.getBounds());
    routeLayers[key] = layer;

  } else {
    if (routeLayers[key]) {
      map.removeLayer(routeLayers[key]);
      delete routeLayers[key];
    }
  }
}

// --- Attiva i master ---
const masterBici  = document.getElementById('masterBici');
const masterPiedi = document.getElementById('masterPiedi');
masterBici.addEventListener('change', e => toggleMaster('bici', e.target.checked));
masterPiedi.addEventListener('change', e => toggleMaster('piedi', e.target.checked));
document.getElementById('subBici').style.display = 'none';
document.getElementById('subPiedi').style.display = 'none';

// --- Punti di interesse (logica originale) ---
function emojiIcon(e){return L.divIcon({className:'poi',html:`<span class="poi">${e}</span>`,iconSize:[24,24],iconAnchor:[12,12]});}
const ICONS={
  ristoranti:emojiIcon('🍽️'),
  bar:emojiIcon('☕'),
  noleggi:emojiIcon('🚲'),
  supermercati:emojiIcon('🛒'),
  raccolta_differenziata:emojiIcon('♻️'),
  farmacia:emojiIcon('💊')
};
const active={};
function loadGeoJSON(file,cb){fetch('assets/data/' + file + '?v=' + Date.now()).then(r=>r.json()).then(cb).catch(()=>{});}
function toLayer(file,data){
  const p=[
    "ristoranti.geojson",
    "bar.geojson",
    "noleggi.geojson",
    "supermercati.geojson",
    "raccolta_differenziata.geojson",
    "farmacia.geojson"
  ];
  const isP = p.includes(file);
  return L.geoJSON(data, {
    pointToLayer: (feature, latlng) => {
      if (!isP) return L.marker(latlng);
      const key = file.replace(".geojson", "");
      const emoji = feature.properties?.icona ||
        (ICONS[key] ? ICONS[key].options.html.replace(/<[^>]+>/g, "") : "📍");
      return L.marker(latlng, { icon: emojiIcon(emoji) });
    },
    onEachFeature: (feat, layer) => {
      const p = feat.properties || {};
      let html = `<b>${p.name || "Senza nome"}</b>`;
      if (p.telefono) html += `<br>📞 <a href="tel:${p.telefono.replace(/\\s+/g,"")}">${p.telefono}</a>`;
      if (p.sito) html += `<br>🌐 <a href="${p.sito}" target="_blank">Sito web</a>`;
      if (p.menu) html += `<br>📋 <a href="${p.menu}" target="_blank">Menu</a>`;
      if (p.google) html += `<br>📍 <a href="${p.google}" target="_blank">Google Maps</a>`;
      if (p.email) html += `<br>✉️ <a href="mailto:${p.email}">${p.email}</a>`;
      if (p.orari) html += `<br>🕒 ${p.orari}`;
      if (p.note) html += `<br>🗒️ ${p.note}`;
      layer.bindPopup(html);
    }
  });
}
document.querySelectorAll('[data-file]').forEach(cb=>{
  cb.addEventListener('change',e=>{
    const file=e.target.dataset.file;
    if(e.target.checked){
      loadGeoJSON(file,d=>{
        const layer=toLayer(file,d);
        active[file]=layer;
        layer.addTo(map);
      });
    } else if(active[file]) {
      map.removeLayer(active[file]);
      delete active[file];
    }
  });
});
if(matchMedia('(pointer:fine)').matches)togglePanel(true);
