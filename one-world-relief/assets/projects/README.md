# Project Media

Put project photos, thumbnails, and short clips here when you want the site to use local files instead of hosted links.

Recommended structure:

```text
assets/projects/
  case-001/
    orphan-support-001-main.jpg
    orphan-support-001-proof.jpg
  case-005/
    flood-relief-005-thumbnail.jpg
    flood-relief-005-primary.mp4
  case-006/
    mosque-gate-006-thumbnail.jpg
    mosque-gate-006-primary.mp4
```

Keep images compressed before adding them to Git. A good target is under 500 KB per image for thumbnails and under 1.5 MB for larger project photos.

Use local, browser-compatible media whenever practical so donors stay on the One World Relief website. Publish JPEG images and H.264/AAC MP4 videos, add a small thumbnail for each project card, and keep filenames stable after a case is live. Compress large clips before committing them, but preserve the private originals outside the public website.

Only publish media that is approved for public use. Remove location and other sensitive metadata, and keep identity documents, birth-registration numbers, home addresses, phone numbers, and other personally identifying records off the site. Put approved files in the relevant case folder, then reference them from the matching page in `one-world-relief/projects/` and from `project-data.js`.

Current case media:

- `case-001/orphan-support-001-main.jpg` is used as the public project card image.
- `case-001/orphan-support-001-proof.jpg` is stored as supporting proof media.
- `case-001/orphan-support-001-primary.mp4`, `case-001/orphan-support-001-video-1.mp4`, and `case-001/orphan-support-001-video-2.mp4` are embedded on `projects/case-001.html`.
- `case-001/orphan-support-001-thumbnail.jpg` is the project-card thumbnail generated from the primary video so the subject is framed clearly.
- `case-002/` contains the livelihood-support main, proof, thumbnail, video-poster, and primary-video files used by `projects/case-002.html`.
- `case-003/` contains the orphan-education main, proof, thumbnail, primary-video, and second-video files used by `projects/case-003.html`. Its legacy placeholder is retained but is not used publicly.
- `case-004/` contains the `thumbnail`, `main`, and `proof` JPEGs plus the browser-safe `primary` MP4 used by `projects/case-004.html`. Its public title is `Feeding Madrasa for Orphan Kids`, and the user-confirmed project cost is `$400`. The public files document the madrasa meal service on June 24, 2026, and have device and precise-location metadata removed. No meal or beneficiary count is published because neither was supplied. The original 255 MB phone video remains outside the website, and the retained legacy placeholder is not referenced publicly.
- `case-005/` contains eight approved flood-relief JPEGs (`thumbnail`, `main`, `context`, `supplies`, `banner`, `delivery`, and two outdoor children/community context photos) plus `primary`, `video-2`, and `video-3` MP4 clips for `projects/case-005.html`. The children/community photos were added at the organization's explicit direction; private-bedroom, potentially medical-context, and readable-personal-name images remain unpublished.
- `case-006/` contains the mosque-gate `thumbnail` and `main` JPEGs plus `primary` and `video-2` MP4 clips for `projects/case-006.html`.
- Case 007 still uses a generated `Coming Soon` banner and has no public media folder.
- `case-008/` contains five mosque-exterior JPEGs, a main image and card thumbnail, and one H.264/AAC field video with a poster. These were published October 14, 2026 from the supplied update folder. The project remains `Coming Soon`; location, budget, scope, and completion are not newly claimed. Two zero-byte September video files could not be imported.
- `case-009/` contains metadata-stripped `thumbnail`, `main`, and `proof` JPEGs documenting the completed 20-ceiling-fan project at a newly built mosque in Bangladesh. The user confirmed the completed project cost was `$1,650` on August 17, 2026. The public case page uses only the approved field photos; private correspondence with a phone number remains unpublished.
- `case-010/` contains three H.264/AAC field videos of the elder-care building, individual poster JPEGs, and a main/card image taken from the building walkthrough. These were published October 14, 2026 from the supplied update folder. The first clip has its incorrect rotation flag cleared; the other clips preserve their recorded orientation. Status remains `Coming Soon` with unconfirmed scope, budget, and schedule. Public copies strip source metadata; private originals remain outside the website.
