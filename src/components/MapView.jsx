import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ON_DUTY = new Set(['D', 'ON', 'INT_D']);

const STATUS_LABELS = {
  D: 'Driving',
  ON: 'On Duty',
  INT_D: 'On Duty',
  OFF: 'Off Duty',
  SB: 'Sleeper Berth',
  Logoff: 'Logged Off',
};

const onDutyIcon = L.divIcon({
  className: 'map-marker',
  html: '<div class="map-marker-dot map-marker-on"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const offDutyIcon = L.divIcon({
  className: 'map-marker',
  html: '<div class="map-marker-dot map-marker-off"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatAddress(addr) {
  if (!addr) return '';
  if (addr.formattedAddress) return addr.formattedAddress;
  return [addr.street, addr.city, addr.state, addr.country].filter(Boolean).join(', ');
}

export default function MapView({ events }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);

  useEffect(() => {
    const map = L.map(containerRef.current).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const points = [];
    for (const ev of events) {
      if (!ev.coords || typeof ev.coords.x !== 'number' || typeof ev.coords.y !== 'number') continue;
      const onDuty = ON_DUTY.has(ev.status);
      const label = STATUS_LABELS[ev.status] || ev.status;
      const addr = formatAddress(ev.address);
      const marker = L.marker([ev.coords.y, ev.coords.x], {
        icon: onDuty ? onDutyIcon : offDutyIcon,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(label)}</strong><br>` +
          `${escapeHtml(formatTime(ev.time))}` +
          (addr ? `<br>${escapeHtml(addr)}` : '')
      );
      marker.addTo(layer);
      points.push([ev.coords.y, ev.coords.x]);
    }

    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
  }, [events]);

  return <div ref={containerRef} className="map-container" />;
}
