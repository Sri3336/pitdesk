# PitDesk Media Assets

All video and image assets are stored in the project's webdev storage (S3-backed CDN).
They are **not** committed to the git repo to avoid binary bloat and deployment timeouts.

If assets are ever lost (e.g. after a project migration), re-upload from local files using:
```bash
manus-upload-file --webdev /home/ubuntu/webdev-static-assets/<filename>
```
Then update the `src=` references in the relevant page files.

---

## Videos

| Asset | Storage Path | Used In | Description |
|---|---|---|---|
| PCR Explainer | `/manus-storage/pcr_explainer_new_6a65aca1.mp4` | `client/src/pages/PCRStrategy.tsx` | 8-second PCR strategy explainer — gauge animation, contrarian signals |
| VCP Explainer | `/manus-storage/vcp_explainer_new_d0de15b2.mp4` | `client/src/pages/VCPStrategy.tsx` | 8-second VCP strategy explainer — contraction pattern, breakout |

## Thumbnail Images (CDN Direct URLs)

| Asset | CDN URL | Used In |
|---|---|---|
| PCR Thumbnail | `https://d2xsxph8kpxj0f.cloudfront.net/118490340/4ziQjLcBuBgPL6xfwF5uaR/pcr_frame1_title_new-9HfLbPpnp9yS78mpjTM2oE.webp` | `PCRStrategy.tsx` poster + thumbnail |
| PCR Thumbnail (PNG) | `https://d2xsxph8kpxj0f.cloudfront.net/118490340/4ziQjLcBuBgPL6xfwF5uaR/pcr_frame1_title_new-CzgrUapXQgXwq3WhGsxrXP.png` | Original full-res |
| VCP Thumbnail | `https://d2xsxph8kpxj0f.cloudfront.net/118490340/4ziQjLcBuBgPL6xfwF5uaR/vcp_frame1_title_new-5XsDeweQJKLtG3yBpKBRoG.webp` | `VCPStrategy.tsx` poster + thumbnail |
| VCP Thumbnail (PNG) | `https://d2xsxph8kpxj0f.cloudfront.net/118490340/4ziQjLcBuBgPL6xfwF5uaR/vcp_frame1_title_new-TP6vvKh7xxi6eoPz7PBf9s.png` | Original full-res |

## Logo

| Asset | Local Path | CDN URL |
|---|---|---|
| PitDesk Logo v3 | `/home/ubuntu/webdev-static-assets/pitdesk-logo-v3.png` | Uploaded via `manus-upload-file --webdev` |

---

## Recovery Steps

If any video returns 403 after a project migration:

1. Check if the local file exists at `/home/ubuntu/webdev-static-assets/`
2. If yes: `manus-upload-file --webdev /home/ubuntu/webdev-static-assets/<filename>`
3. If no: Re-generate using the `generate` tool with the prompts below, then re-upload
4. Update the `src=` in the relevant `.tsx` file

### PCR Video Regeneration Prompt
```
Professional trading strategy explainer video thumbnail. Dark navy background.
Bold white title 'PCR Strategy' at top. Green subtitle 'Put/Call Ratio Signals'.
Center infographic: a semicircular gauge with 5 zones — Extreme Fear (green),
Fear (teal), Neutral (gray), Greed (orange), Extreme Greed (red). Needle pointing
to Fear zone. Below gauge: 'Contrarian Options Signals'. Bottom: 'PitDesk Trading
Intelligence'. Play button icon bottom-right. Clean fintech design.
```

### VCP Video Regeneration Prompt
```
Professional trading strategy explainer video thumbnail. Dark navy background.
Bold white title 'VCP Strategy' at top. Green subtitle 'Volatility Contraction Pattern'.
Center: a stock candlestick chart showing 3 contracting price bases getting smaller
left to right, then a breakout arrow pointing up sharply. Labels: Base 1, Base 2,
Base 3, Breakout. Bottom: 'Minervini Method - 9-Point Score - PitDesk'. Play button
icon bottom-right. Clean fintech design, green accent color.
```
