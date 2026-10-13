# Exec Idea Book

A one-page notes app for exec ideas. Write an idea, pick the exec position
(A–H, Rush Chair, Social Chair, AMC), and save. Each position has its own tab
listing its ideas newest first, with edit, delete, and "Copy list".

It runs as a private claude.ai Artifact: https://claude.ai/artifact/VZbyZSte1YaQ2HCpS3SmaS

- Ideas are saved in the Artifact's database (`ideas` collection:
  `{ text, branch, createdAt, updatedAt }`), so they are the same on every device.
- Unsaved text in the box is kept on the device until it is saved.

To change it, edit `index.html` and republish it to the same Artifact URL.
