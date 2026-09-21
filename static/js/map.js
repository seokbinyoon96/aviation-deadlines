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
    return Math.floor(dur.asDays()) + "d " + dur.hours() + "h " + dur.minutes() + "m " + dur.seconds() + "s";
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

  // Leaflet fixes a tooltip's side when it is bound, so pick sides up front that
  // keep the always-on labels from stacking on top of each other.
  function assignDirections(map, groups) {
    var placed = [];
    var order = groups.slice().sort(function(a, b) {
      return a.entries[0].next.at.valueOf() - b.entries[0].next.at.valueOf();
    });

    order.forEach(function(group) {
      var point = map.latLngToContainerPoint([group.lat, group.lng]);
      var chars = Math.max(
        group.entries[0].conf.name.length + 5,
        shortPlace(group.place).length + (group.entries.length > 1 ? 9 : 0)
      );
      var w = chars * 6.2 + 18;
      var h = 34;

      var candidates = {
        top: [point.x - w / 2, point.y - 44 - h, point.x + w / 2, point.y - 44],
        bottom: [point.x - w / 2, point.y + 4, point.x + w / 2, point.y + 4 + h],
        right: [point.x + 14, point.y - 20 - h / 2, point.x + 14 + w, point.y - 20 + h / 2],
        left: [point.x - 14 - w, point.y - 20 - h / 2, point.x - 14, point.y - 20 + h / 2]
      };

      var chosen = ["top", "bottom", "right", "left"].filter(function(dir) {
        var r = candidates[dir];
        return !placed.some(function(p) {
          return r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1];
        });
      })[0] || "top";

      placed.push(candidates[chosen]);
      group.direction = chosen;
    });
  }

  function updateTimers() {
    document.querySelectorAll('.leaflet-popup-content .popup-timer').forEach(function(el) {
      var iso = el.getAttribute('data-target');
      if (!iso) return;
      el.textContent = formatRemaining(moment(iso));
    });

    document.querySelectorAll('.pin-days').forEach(function(el) {
      var iso = el.getAttribute('data-short');
      if (!iso) return;
      el.textContent = formatShort(moment(iso));
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    var mapEl = document.getElementById('conf-map');
    if (!mapEl) return;

    var map = L.map('conf-map', { scrollWheelZoom: false, minZoom: 2 }).setView([25, 10], 2);
    window.confMap = map;

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 16
    }).addTo(map);

    // Place names: continents when zoomed out, countries and cities as you zoom in.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      className: 'map-labels',
      maxZoom: 16
    }).addTo(map);

    var groups = upcomingGroups(CONFERENCES);
    if (!groups.length) {
      var hint = document.querySelector('.map-hint');
      if (hint) hint.textContent = "No upcoming deadlines right now — see the List tab for past ones.";
    }
    assignDirections(map, groups);

    groups.forEach(function(group) {
      var marker = L.marker([group.lat, group.lng], { title: group.place }).addTo(map);
      marker.bindPopup(function() { return buildPopupHtml(group); }, { maxWidth: 280 });
      marker.bindTooltip(buildLabelHtml(group), {
        permanent: true,
        direction: group.direction,
        className: 'pin-label',
        opacity: 1
      });
    });

    // The container's real size isn't always settled the instant the map is
    // created (fonts/CSS still applying), which throws off marker projection.
    setTimeout(function() { map.invalidateSize(); }, 0);
    window.addEventListener('load', function() { map.invalidateSize(); });

    setInterval(updateTimers, 1000);
  });
})();
