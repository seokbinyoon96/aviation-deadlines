---
---
(function() {
  var CONFERENCES = {{ site.data.conferences | jsonify }};

  function resolveDeadline(raw, year, timezone) {
    if (!raw || raw === "TBA") return null;

    var resolved = raw.replace('%y', year).replace('%Y', year - 1);
    var tz = timezone || "Etc/GMT+12"; // Anywhere on Earth, matches list view default

    var deadline = moment.tz(resolved, "YYYY-M-D HH:mm", tz);
    if (deadline.minutes() === 0) {
      deadline.subtract(1, 'seconds');
    }
    if (deadline.minutes() === 59) {
      deadline.seconds(59);
    }
    return deadline;
  }

  function formatRemaining(target) {
    if (!target) return "None";

    var diffMs = target.valueOf() - moment().valueOf();
    if (diffMs <= 0) return "Passed — " + target.local().format('D MMM YYYY, h:mm a');

    var dur = moment.duration(diffMs);
    var days = Math.floor(dur.asDays());
    var hours = dur.hours();
    var minutes = dur.minutes();
    var seconds = dur.seconds();
    return days + "d " + hours + "h " + minutes + "m " + seconds + "s";
  }

  function groupByLocation(confs) {
    var groups = {};
    var order = [];

    confs.forEach(function(c) {
      if (typeof c.lat !== "number" || typeof c.lng !== "number") return;

      var key = c.lat.toFixed(2) + "," + c.lng.toFixed(2);
      if (!groups[key]) {
        groups[key] = { lat: c.lat, lng: c.lng, place: c.place, confs: [] };
        order.push(key);
      }
      groups[key].confs.push(c);
    });

    return order.map(function(key) { return groups[key]; });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function buildConfBlock(conf) {
    var abstractDeadline = resolveDeadline(conf.abstract_deadline, conf.year, conf.timezone);
    var deadlines = (conf.deadline || [])
      .map(function(raw) { return resolveDeadline(raw, conf.year, conf.timezone); });

    var fullBlocks = deadlines.map(function(d, i) {
      var label = deadlines.length >= 2 ? "Full Paper (" + (i + 1) + "/" + deadlines.length + ")" : "Full Paper";
      return '<div class="popup-row">' + label + ': ' +
        '<span class="popup-timer" data-target="' + (d ? d.toISOString() : "") + '">' +
        escapeHtml(formatRemaining(d)) + '</span></div>';
    }).join("");

    return '' +
      '<div class="popup-conf">' +
        '<a href="' + escapeHtml(conf.link) + '" target="_blank" rel="noopener"><strong>' +
          escapeHtml(conf.name) + ' ' + escapeHtml(conf.year) +
        '</strong></a><br>' +
        '<span class="popup-date">' + escapeHtml(conf.date) + '</span><br>' +
        '<div class="popup-row">Abstract: ' +
          '<span class="popup-timer" data-target="' + (abstractDeadline ? abstractDeadline.toISOString() : "") + '">' +
          escapeHtml(formatRemaining(abstractDeadline)) +
          '</span></div>' +
        fullBlocks +
      '</div>';
  }

  function buildPopupHtml(group) {
    var blocks = group.confs.map(buildConfBlock).join('<hr class="popup-sep">');
    return '<div class="map-popup">' +
      '<div class="popup-place">' + escapeHtml(group.place) + '</div>' +
      blocks +
      '</div>';
  }

  function updateOpenPopupTimers() {
    var timers = document.querySelectorAll('.leaflet-popup-content .popup-timer');
    timers.forEach(function(el) {
      var iso = el.getAttribute('data-target');
      if (!iso) return;
      el.textContent = formatRemaining(moment(iso));
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    var mapEl = document.getElementById('conf-map');
    if (!mapEl) return;

    var map = L.map('conf-map', { scrollWheelZoom: false }).setView([20, 10], 2);
    window.confMap = map;

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 16
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16
    }).addTo(map);

    groupByLocation(CONFERENCES).forEach(function(group) {
      var marker = L.marker([group.lat, group.lng], { title: group.place }).addTo(map);
      marker.bindPopup(function() { return buildPopupHtml(group); }, { maxWidth: 280 });
    });

    // The container's real size isn't always settled the instant the map is
    // created (fonts/CSS still applying), which throws off marker projection.
    setTimeout(function() { map.invalidateSize(); }, 0);
    window.addEventListener('load', function() { map.invalidateSize(); });

    setInterval(updateOpenPopupTimers, 1000);
  });
})();
