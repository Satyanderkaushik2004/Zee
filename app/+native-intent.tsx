// Share-sheet launches arrive as a special URL; send them to Home. Saving is handled in the root layout.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try { return new URL(path).hostname === 'expo-share-intent' ? '/' : path; } catch { return path; }
}
