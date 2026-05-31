# Graph Report - .  (2026-05-31)

## Corpus Check
- Corpus is ~16,983 words - fits in a single context window. You may not need a graph.

## Summary
- 137 nodes · 203 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Server Backend|Server Backend]]
- [[_COMMUNITY_Public App Logic|Public App Logic]]
- [[_COMMUNITY_Dependency Manifest|Dependency Manifest]]
- [[_COMMUNITY_Admin Modal UI|Admin Modal UI]]
- [[_COMMUNITY_Admin Data Management|Admin Data Management]]
- [[_COMMUNITY_Site Configuration|Site Configuration]]
- [[_COMMUNITY_Admin Branding Logic|Admin Branding Logic]]
- [[_COMMUNITY_Admin Table UI|Admin Table UI]]
- [[_COMMUNITY_Architecture Concepts|Architecture Concepts]]
- [[_COMMUNITY_Admin Session Logic|Admin Session Logic]]
- [[_COMMUNITY_Data Storage Logic|Data Storage Logic]]
- [[_COMMUNITY_Stream Monitor|Stream Monitor]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]

## God Nodes (most connected - your core abstractions)
1. `init()` - 9 edges
2. `loadChannels()` - 8 edges
3. `checkSingle()` - 7 edges
4. `escapeAttr()` - 7 edges
5. `api()` - 6 edges
6. `applyChannelFilters()` - 6 edges
7. `loadSettings()` - 6 edges
8. `renderPagination()` - 5 edges
9. `openPreview()` - 5 edges
10. `init()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Admin Portal UI` --references--> `Admin Portal Logic`  [EXTRACTED]
  admin/index.html → assets/admin.js
- `Main Website UI` --references--> `Public App Logic`  [EXTRACTED]
  index.html → assets/app.js
- `Admin Portal Logic` --shares_data_with--> `Channel Data`  [INFERRED]
  assets/admin.js → data/channels.json
- `Public App Logic` --shares_data_with--> `Channel Data`  [INFERRED]
  assets/app.js → data/channels.json
- `Premium Dark Aesthetic` --rationale_for--> `Main Website UI`  [EXTRACTED]
  README.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Data Access Layer** — server_js, channels_json, settings_json [INFERRED 0.95]
- **Streaming Platform Architecture** — server_js, app_js, admin_js [INFERRED 0.85]

## Communities (14 total, 2 thin omitted)

### Community 0 - "Server Backend"
Cohesion: 0.07
Nodes (23): Site Settings, ALLOWED_IMG, app, bcrypt, CHANNELS_FILE, cors, DATA_DIR, express (+15 more)

### Community 1 - "Public App Logic"
Cohesion: 0.15
Nodes (20): api(), applyFilters(), applySettings(), bindEvents(), bindScroll(), cleanupPlayer(), closePlayer(), cssUrl() (+12 more)

### Community 2 - "Dependency Manifest"
Cohesion: 0.10
Nodes (20): author, dependencies, bcrypt, cors, express, express-rate-limit, jsonwebtoken, multer (+12 more)

### Community 3 - "Admin Modal UI"
Cohesion: 0.22
Nodes (9): cleanupPreview(), closePreview(), escapeHtml(), failPreview(), markPreview(), openEditModal(), openPreview(), startInlineEdit() (+1 more)

### Community 4 - "Admin Data Management"
Cohesion: 0.39
Nodes (9): api(), applyChannelFilters(), checkSingle(), handleM3UFile(), healthBadge(), loadChannels(), renderStats(), setFeatured() (+1 more)

### Community 5 - "Site Configuration"
Cohesion: 0.22
Nodes (8): adminPasswordHash, adminUsername, featuredId, heroSubtitle, heroTitle, maintenanceMode, siteLogo, siteName

### Community 6 - "Admin Branding Logic"
Cohesion: 0.40
Nodes (6): applyBranding(), escapeAttr(), loadSettings(), populateFeaturedSelect(), setChannelLogoPreview(), setSiteLogoPreview()

### Community 7 - "Admin Table UI"
Cohesion: 0.40
Nodes (6): goToPage(), pageBtn(), renderChannelTable(), renderPagination(), totalPages(), updateSelectionUI()

### Community 8 - "Architecture Concepts"
Cohesion: 0.33
Nodes (6): Admin Portal UI, Admin Portal Logic, Public App Logic, Channel Data, Main Website UI, Premium Dark Aesthetic

### Community 9 - "Admin Session Logic"
Cohesion: 0.40
Nodes (5): bindEvents(), init(), logout(), showDashboard(), showLogin()

### Community 10 - "Data Storage Logic"
Cohesion: 0.67
Nodes (3): ensureDataFiles(), readChannels(), readSettings()

## Knowledge Gaps
- **49 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `description` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Dependency Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._