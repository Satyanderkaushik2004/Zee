// Adds Android app shortcuts (long-press the Zee icon): New note, Record voice note, Search library.
const { withAndroidManifest, withStringsXml, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SHORTCUTS = [
  { id: 'note', label: 'New note', url: 'zee://capture' },
  { id: 'voice', label: 'Record voice note', url: 'zee://voice' },
  { id: 'search', label: 'Search library', url: 'zee://library' },
];

module.exports = function withShortcuts(config) {
  const pkg = config.android && config.android.package;
  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      SHORTCUTS.map((s) => ({ $: { name: 'shortcut_' + s.id }, _: s.label })), c.modResults);
    return c;
  });
  config = withDangerousMod(config, ['android', async (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(dir, { recursive: true });
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map((s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@mipmap/ic_launcher"
      android:shortcutShortLabel="@string/shortcut_${s.id}" android:shortcutLongLabel="@string/shortcut_${s.id}">
    <intent android:action="android.intent.action.VIEW" android:data="${s.url}"
        android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity" />
  </shortcut>`).join('\n')}
</shortcuts>
`;
    fs.writeFileSync(path.join(dir, 'shortcuts.xml'), xml);
    return c;
  }]);
  config = withAndroidManifest(config, (c) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    main['meta-data'] = (main['meta-data'] || []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    main['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return c;
  });
  return config;
};
