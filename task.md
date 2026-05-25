- [x] Update `src/lib/i18n.ts` translations (hourlyAll, thumbnail label text)
- [x] Implement Logs page enhancements in `src/app/logs/page.tsx` (Clear logs rename, RTL support, Auto Update state & checkbox)
- [x] Implement YouTube channels deletion endpoint updates in `src/app/api/youtube/channels/route.ts` to support comma-separated IDs
- [x] Implement YouTube channels cleanup endpoint updates in `src/app/api/youtube/cleanup/route.ts` to support `channelDbIds` array in body
- [x] Implement Page UI changes in `src/app/page.tsx`:
  - [x] Remove individual logs buttons next to slots
  - [x] Add single slot selection checkboxes to Table row and Card header
  - [x] Add "Select All" checkbox to Table header
  - [x] Render modern floating action bar at bottom center when slots are selected
  - [x] Add "Bulk Title & Description" button and dialog
  - [x] Update Thumbnail Selector to support directories and files (PNG/JPG/JPEG)
  - [x] Update YouTube Channel dialog table: renaming Official Title, adding links, adding search input, adding checkboxes, and adding Delete/Clean Selected buttons
  - [x] Correct swap warning time from 10m to 2m
- [x] Verify using compilation checks (`npx tsc --noEmit`) and build (`npm run build`)

## Design Context

### Users
- **Who they are**: Live stream managers, content creators, administrators, and broadcasters.
- **Context**: Managing multiple (up to 100) concurrent live streams (mainly on YouTube and Facebook) simultaneously. They need to monitor statuses in real-time, configure schedules, update metadata, swap videos, and manage connected YouTube accounts.
- **Job to be done**: Easily control, automate, reschedule, and monitor bulk live-streaming processes without CPU/network bottlenecks and with zero compliance issues.

### Brand Personality
- **Voice/Tone**: Professional, robust, and highly technical yet clean and organized.
- **3-word personality**: Efficient, Reliable, Sleek.
- **Emotional goals**: Trust, control, calm under heavy workload, and confidence in automation.

### Aesthetic Direction
- **Visual tone**: Dark-mode focused (default), clean glassmorphism, responsive, and micro-animated layouts.
- **References**: Modern developer consoles, cloud provider dashboards, video streaming control rooms.
- **Theme**: Dark theme (default) using deep neutrals, high contrast indicators for statuses, and subtle primary/accent colors.

### Design Principles
1. **Density with Clarity**: Present dense stream scheduling and diagnostic data clearly without clutter. Use hover micro-interactions, responsive sizing, and clean tables.
2. **Dynamic RTL/LTR Transitions**: Provide seamless Arabic/English layout shifts with appropriate font stacks (Geist/Al Jazeera) and natural directions.
3. **Safe Bulk Control**: Design confirmation modals and clear visual bounds for bulk actions to prevent accidental starts/stops of 100+ channels.
4. **Action Feedback**: Use loaders, progress bar animations, and real-time polling options (Auto-Update) to let users know the system is responsive and running.
