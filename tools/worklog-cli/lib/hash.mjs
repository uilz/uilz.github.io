// Frozen bundle hashing (contract v0.1).
//
//   body_sha256 = sha256(md_bytes)
//   manifest    = "PAPBUNDLE1\n" +
//                 "body " + body_sha256 + "\n" +
//                 for each attachment sorted by name (UTF-8 byte order):
//                   "file " + name + " " + sha256_hex + " " + size + "\n"
//   bundle_sha256 = sha256(manifest.encode("utf-8"))
import crypto from 'node:crypto';

export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** UTF-8 byte order comparison (NOT localeCompare). */
export function compareUtf8(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function buildBundleManifest(bodySha256, attachments) {
  const sorted = [...attachments].sort((a, b) => compareUtf8(a.name, b.name));
  let text = 'PAPBUNDLE1\n';
  text += 'body ' + bodySha256 + '\n';
  for (const att of sorted) {
    text += 'file ' + att.name + ' ' + att.sha256 + ' ' + att.size + '\n';
  }
  return text;
}

export function bundleSha256(manifestText) {
  return sha256Hex(Buffer.from(manifestText, 'utf8'));
}
