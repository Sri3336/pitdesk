# PitDesk Brand Assets

This directory contains source brand assets for PitDesk. These files are kept in the repo as backups.
The deployed app references the CDN-hosted versions (uploaded via `manus-upload-file --webdev`).

## Logo

| File | Description | CDN URL |
|---|---|---|
| `pitdesk-icon-v3.png` | Primary logo — A shape + shark fin sweep + green candlesticks (1080×1080, white background) | `/manus-storage/pitdesk-logo-v3_7453c57c.png` |

## Usage in Code

The logo is consumed via `client/src/components/PitDeskLogo.tsx`:

```tsx
import { PitDeskLogo } from "@/components/PitDeskLogo";

// In sidebar header
<PitDeskLogo size={40} />

// In signin branding panel (inside white card for dark backgrounds)
<div className="bg-white rounded-xl p-1.5 shadow-lg">
  <PitDeskLogo size={52} />
</div>
```

## Re-uploading

If the CDN URL ever needs to be refreshed:

```bash
manus-upload-file --webdev brand-assets/pitdesk-icon-v3.png
```

Then update the `src` in `client/src/components/PitDeskLogo.tsx` with the new path.
