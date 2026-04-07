# 📐 StockSense Design Folder

This folder holds all exported designs from **Variant.com** and the brand guidelines
used to generate the production frontend via **Claude**.

---

## Folder Structure

```
design/
├── README.md                  ← You are here
├── brand_guidelines.md        ← Colors, typography, voice — exported from Variant
├── pages/
│   ├── 01_landing.txt         ← Landing / home page design (from Variant → Claude Code)
│   ├── 02_auth_login.txt      ← Login page
│   ├── 03_auth_register.txt   ← Register page
│   ├── 04_dashboard.txt       ← Main dashboard (role-aware)
│   ├── 05_admin_panel.txt     ← Admin panel + AI Scenarios
│   ├── 06_analyst_view.txt    ← Analyst tools + GNN 3D Visualizer
│   ├── 07_manager_view.txt    ← Portfolio manager view
│   └── 08_forecasts.txt       ← Forecasts page
└── claude_prompt.md           ← The complete prompt to paste into Claude
```

---

## Steps to Follow

1. Go to [variant.com](https://variant.com)
2. Select a template close to a **financial dashboard / data platform**
3. Click **Edit Design** → write your prompt describing each page
4. Generate **all pages as separate designs** in one prompt
5. For each page design → click **⋮ (three dots)** → **Open in** → **Claude Code**
6. Paste the copied code into the corresponding `.txt` file in `design/pages/`
7. In Variant, also ask for **typography, brand guidelines, colors** → paste into `brand_guidelines.md`
8. Open Claude (Opus 4.6 Max recommended) and paste the contents of `claude_prompt.md`

---

## Pages to Design in Variant

| # | Page | Route | Notes |
|---|------|--------|-------|
| 1 | Landing / Home | `/` | Hero, features, CTA |
| 2 | Login | `/auth/login` | Email + password |
| 3 | Register | `/auth/register` | Role selection (Admin/Manager/Analyst) |
| 4 | Dashboard | `/dashboard` | Role-aware, charts, portfolio summary |
| 5 | Admin Panel | `/admin` | User management, AI scenario controls |
| 6 | Analyst View | `/analyst` | GNN graph, stock analysis, predictions |
| 7 | Manager View | `/manager` | Portfolio management, transactions |
| 8 | Forecasts | `/forecasts` | Forecast charts, predictions |
