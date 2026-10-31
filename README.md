# SafeSCADA HSE Audit
Offline-first QHSE compliance PWA for SCADA / I&C engineers.

Run: serve this folder from the web root over HTTPS or localhost, e.g. `python3 -m http.server 8080`, then open http://localhost:8080/.
(The manifest uses root-absolute paths: scope "/" and start_url "/index.html", so host at the domain root.)
Regenerate icons: `python3 tools/make_icons.py` (needs Pillow).
Data lives in IndexedDB; use Archive > Export for JSON/CSV backups.
