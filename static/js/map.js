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

  function collectDeadlines(conf) {
    var out = [];

    var abstractDeadline = resolveDeadline(conf.abstract_deadline, conf.year, conf.timezone);
    if (abstractDeadline) {
      out.push({ label: "Abstract", at: abstractDeadline });
    }

    var raw = conf.deadline || [];
    raw.forEach(function(value, i) {
      var at = resolveDeadline(value, conf.year, conf.timezone);
      if (!at) return;
      var label = raw.length >= 2 ? "Full Paper (" + (i + 1) + "/" + raw.length + ")" : "Full Paper";
      out.push({ label: label, at: at });
    });

    return out;
  }

  function nextDeadline(deadlines) {
    var now = moment().valueOf();
    var upcoming = deadlines.filter(function(d) { return d.at.valueOf() > now; });
    upcoming.sort(function(a, b) { return a.at.valueOf() - b.at.valueOf(); });
    return upcoming[0] || null;
  }

  function formatRemaining(target) {
    if (!target) return "None";

    var diffMs = target.valueOf() - moment().valueOf();
    if (diffMs <= 0) return "Passed — " + target.local().format('D MMM YYYY, h:mm a');

    var dur = moment.duration(diffMs);
    return Math.floor(dur.asDays()) + "d " + dur.hours() + "h " + dur.minutes() + "m";
  }

  // Short form for the always-visible pin label: "71d", or hours on the last day.
  function formatShort(target) {
    var diffMs = target.valueOf() - moment().valueOf();
    if (diffMs <= 0) return "now";

    var dur = moment.duration(diffMs);
    var days = Math.floor(dur.asDays());
    return days >= 1 ? days + "d" : Math.max(1, Math.floor(dur.asHours())) + "h";
  }

  function urgencyClass(target) {
    var days = (target.valueOf() - moment().valueOf()) / 86400000;
    if (days <= 7) return "urgent";
    if (days <= 30) return "soon";
    return "later";
  }

  // "Boston, MA, USA" -> "Boston, USA", "Perth, Western Australia" -> "Perth, Australia".
  function shortPlace(place) {
    if (!place) return "";

    var parts = place.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    var last = parts[parts.length - 1];
    var compact = parts.length >= 3 ? parts[0] + ", " + last : parts.join(", ");
    if (compact.length <= 18) return compact;

    var country = last.split(" ").pop();
    var alt = parts[0] + ", " + country;
    return alt.length <= 18 ? alt : country;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function buildConfBlock(entry) {
    var rows = entry.deadlines.map(function(d) {
      var passed = d.at.valueOf() <= moment().valueOf();
      return '<div class="popup-row' + (passed ? ' popup-past' : '') + '">' + escapeHtml(d.label) + ': ' +
        '<span class="popup-timer" data-target="' + d.at.toISOString() + '">' +
        escapeHtml(formatRemaining(d.at)) + '</span></div>';
    }).join("");

    var conf = entry.conf;
    return '' +
      '<div class="popup-conf">' +
        '<a href="' + escapeHtml(conf.link) + '" target="_blank" rel="noopener"><strong>' +
          escapeHtml(conf.name) + ' ' + escapeHtml(conf.year) +
        '</strong></a><br>' +
        '<span class="popup-date">' + escapeHtml(conf.date) + '</span>' +
        rows +
      '</div>';
  }

  function buildPopupHtml(group) {
    return '<div class="map-popup">' +
      '<div class="popup-place">' + escapeHtml(group.place) + '</div>' +
      group.entries.map(buildConfBlock).join('<hr class="popup-sep">') +
      '</div>';
  }

  function buildLabelHtml(group) {
    var soonest = group.entries[0];
    var extra = group.entries.length - 1;

    return '' +
      '<span class="pin-line">' +
        '<span class="pin-name">' + escapeHtml(soonest.conf.name) + '</span>' +
        '<span class="pin-days ' + urgencyClass(soonest.next.at) + '" data-short="' + soonest.next.at.toISOString() + '">' +
          escapeHtml(formatShort(soonest.next.at)) +
        '</span>' +
      '</span>' +
      '<span class="pin-place">' + escapeHtml(shortPlace(group.place)) +
        (extra > 0 ? ' · +' + extra + ' more' : '') +
      '</span>';
  }

  function markerText(name) {
    var compact = name.replace(/^(IEEE|AIAA)\s+/, '');
    if (compact.length <= 8) return compact;
    return compact.split(/\s+/).map(function(word) { return word.charAt(0); }).join("").slice(0, 5);
  }

  function renderDeadlineList(groups, map) {
    var mount = document.getElementById('map-deadline-list');
    if (!mount) return;

    var sorted = groups.slice().sort(function(a, b) {
      return a.entries[0].next.at.valueOf() - b.entries[0].next.at.valueOf();
    });

    mount.innerHTML = '';
    sorted.forEach(function(group) {
      var entry = group.entries[0];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'deadline-card';
      button.innerHTML = '' +
        '<span class="deadline-card-main">' +
          '<strong>' + escapeHtml(entry.conf.name) + ' ' + escapeHtml(entry.conf.year) + '</strong>' +
          '<span>' + escapeHtml(shortPlace(group.place)) + '</span>' +
        '</span>' +
        '<span class="deadline-card-time ' + urgencyClass(entry.next.at) + '" data-short="' + entry.next.at.toISOString() + '">' +
          escapeHtml(formatShort(entry.next.at)) +
        '</span>';
      button.addEventListener('click', function() {
        map.panTo([group.lat, group.lng], { animate: true, duration: 0.45 });
        group.marker.openPopup();
      });
      mount.appendChild(button);
    });
  }

  // Only venues with a deadline still ahead of us belong on the map.
  function upcomingGroups(confs) {
    var groups = {};
    var order = [];

    confs.forEach(function(conf) {
      if (typeof conf.lat !== "number" || typeof conf.lng !== "number") return;

      var deadlines = collectDeadlines(conf);
      var next = nextDeadline(deadlines);
      if (!next) return;

      var key = conf.lat.toFixed(2) + "," + conf.lng.toFixed(2);
      if (!groups[key]) {
        groups[key] = { lat: conf.lat, lng: conf.lng, place: conf.place, entries: [] };
        order.push(key);
      }
      groups[key].entries.push({ conf: conf, deadlines: deadlines, next: next });
    });

    return order.map(function(key) {
      var group = groups[key];
      group.entries.sort(function(a, b) { return a.next.at.valueOf() - b.next.at.valueOf(); });
      return group;
    });
  }

  function updateTimers() {
    document.querySelectorAll('.leaflet-popup-content .popup-timer').forEach(function(el) {
      var iso = el.getAttribute('data-target');
      if (!iso) return;
      el.textContent = formatRemaining(moment(iso));
    });

    document.querySelectorAll('.pin-days, .deadline-card-time').forEach(function(el) {
      var iso = el.getAttribute('data-short');
      if (!iso) return;
      el.textContent = formatShort(moment(iso));
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    var mapEl = document.getElementById('conf-map');
    if (!mapEl) return;

    var map = L.map('conf-map', {
      scrollWheelZoom: false,
      minZoom: 2,
      preferCanvas: true,
      zoomControl: false
    }).setView([25, 10], 2);
    window.confMap = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Keep major country names readable in the world overview. Native tile
    // labels take over when zooming in; this pane never intercepts clicks.
    map.createPane('countryNames');
    map.getPane('countryNames').style.zIndex = 450;
    map.getPane('countryNames').style.pointerEvents = 'none';
    var countryNames = L.layerGroup();
    [
      ['Canada', 59, -106], ['United States', 38, -101],
      ['Mexico', 23, -102], ['Brazil', -10, -52], ['Argentina', -38, -65],
      ['United Kingdom', 58, -8], ['Spain', 37, -5], ['France', 47, 1],
      ['Germany', 52, 13], ['Romania', 44, 29], ['Russia', 61, 94],
      ['Egypt', 27, 30], ['Algeria', 27, 3], ['Nigeria', 9, 8],
      ['South Africa', -29, 24], ['Saudi Arabia', 23, 45],
      ['India', 22, 79], ['China', 36, 102], ['Japan', 39, 141],
      ['Indonesia', -5, 119], ['Australia', -25, 134]
    ].forEach(function(country) {
      L.marker([country[1], country[2]], {
        pane: 'countryNames', interactive: false, keyboard: false,
        icon: L.divIcon({className: 'country-name', html: escapeHtml(country[0]),
          iconSize: [100, 18], iconAnchor: [50, 9]})
      }).addTo(countryNames);
    });
    function updateCountryNames() {
      if (map.getZoom() <= 3) countryNames.addTo(map);
      else map.removeLayer(countryNames);
    }
    map.on('zoomend', updateCountryNames);
    updateCountryNames();

    var groups = upcomingGroups(CONFERENCES);
    if (!groups.length) {
      var hint = document.querySelector('.map-hint');
      if (hint) hint.textContent = "No upcoming deadlines right now — see the List tab for past ones.";
    }
    groups.forEach(function(group) {
      var first = group.entries[0];
      var marker = L.marker([group.lat, group.lng], {
        title: first.conf.name + ' — ' + group.place,
        alt: first.conf.name + ' — ' + group.place,
        icon: L.divIcon({
          className: 'conference-marker-wrap',
          html: '<span class="conference-marker ' + urgencyClass(first.next.at) + '"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -10]
        })
      }).addTo(map);
      group.marker = marker;
      marker.bindPopup(function() { return buildPopupHtml(group); }, { maxWidth: 280 });
      marker.bindTooltip(buildLabelHtml(group), {
        permanent: true,
        direction: 'right',
        className: 'pin-label',
        opacity: 1
      });
      marker.on('popupopen', function() {
        marker.getElement().classList.add('is-selected');
      });
      marker.on('popupclose', function() {
        marker.getElement().classList.remove('is-selected');
      });
    });
    // Position persistent names after panning/zooming, preferring the closest
    // free spot to each venue. The dot remains at the true geographic location.
    function layoutLabels() {
      var occupied = [];
      var size = map.getSize();
      groups.forEach(function(group) {
        var tip = group.marker.getTooltip();
        var node = tip.getElement();
        if (!node) return;
        var point = map.latLngToContainerPoint(group.marker.getLatLng());
        var width = node.offsetWidth;
        var height = node.offsetHeight;
        var chosen = null;
        for (var ring = 0; ring < 12 && !chosen; ring++) {
          var dy = ring === 0 ? 0 : Math.ceil(ring / 2) * (height + 6) * (ring % 2 ? 1 : -1);
          [12, -width - 12].some(function(dx) {
            var box = {x: point.x + dx, y: point.y + dy - height / 2, w: width, h: height};
            if (box.x < 4 || box.x + width > size.x - 4 || box.y < 4 || box.y + height > size.y - 4) return false;
            if (occupied.some(function(other) {
              return box.x < other.x + other.w + 5 && box.x + box.w + 5 > other.x &&
                box.y < other.y + other.h + 5 && box.y + box.h + 5 > other.y;
            })) return false;
            chosen = {dx: dx, dy: dy, box: box};
            return true;
          });
        }
        if (chosen) {
          occupied.push(chosen.box);
          tip.options.offset = L.point(chosen.dx, chosen.dy);
          tip.setLatLng(group.marker.getLatLng());
        }
      });
    }
    map.on('moveend zoomend resize', layoutLabels);
    requestAnimationFrame(layoutLabels);
    renderDeadlineList(groups, map);

    // The container's real size isn't always settled the instant the map is
    // created (fonts/CSS still applying), which throws off marker projection.
    setTimeout(function() { map.invalidateSize(); }, 0);
    window.addEventListener('load', function() { map.invalidateSize(); });

    setInterval(updateTimers, 60000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) updateTimers();
    });
  });
})();
