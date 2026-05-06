# Project Media

Put project photos, thumbnails, and short clips here when you want the site to use local files instead of hosted links.

Recommended structure:

```text
assets/projects/
  case-001/
    orphan-support-001-main.jpg
    orphan-support-001-proof.jpg
  wells/
    village-well-thumbnail.jpg
    village-well-complete-01.jpg
  feeding/
    feeding-campaign-thumbnail.jpg
  orphans/
    orphan-support-thumbnail.jpg
```

Keep images compressed before adding them to Git. A good target is under 500 KB per image for thumbnails and under 1.5 MB for larger project photos.

For videos, the easiest option is usually to upload the video to YouTube as unlisted, then paste the YouTube link into `project-data.js` as `mediaUrl`.

For project detail pages, local media is preferred so donors stay on the One World Relief website. Put the files in the relevant project folder, then embed them from the matching page in `one-world-relief/projects/`.

Current case media:

- `case-001/orphan-support-001-main.jpg` is used as the public project card image.
- `case-001/orphan-support-001-proof.jpg` is stored as supporting proof media.
- `case-001/orphan-support-001-video-1.mp4` and `case-001/orphan-support-001-video-2.mp4` are embedded on `projects/case-001.html`.
